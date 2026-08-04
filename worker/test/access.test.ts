import { beforeAll, describe, expect, it } from "vitest";
import { base64url, createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { createAccessVerifier } from "../src/security/access-jwt";
import { routeAdmin } from "../src/transfers/routes-admin";
import type { DevelopmentRouteContext } from "../src/env";
import { routeRequest } from "../src/router";

const teamDomain = "clinic.cloudflareaccess.com";
const issuer = `https://${teamDomain}`;
const audience = "admin-api-audience";
let privateKey: CryptoKey;
let publicKey: CryptoKey;
let rotatedPrivateKey: CryptoKey;
let rotatedPublicKey: CryptoKey;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
  ({ privateKey: rotatedPrivateKey, publicKey: rotatedPublicKey } = await generateKeyPair("RS256"));
});

async function assertion(
  overrides: Record<string, unknown> = {},
  key: CryptoKey = privateKey,
  kid = "local-key",
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const { iss = issuer, aud = audience, sub = "subject-1", exp = now + 60, nbf = now - 1, iat = now, ...claims } = overrides;
  return new SignJWT({ email: "admin@example.test", ...claims })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(String(iss))
    .setAudience(String(aud))
    .setSubject(String(sub))
    .setIssuedAt(Number(iat))
    .setNotBefore(Number(nbf))
    .setExpirationTime(Number(exp))
    .sign(key);
}

function withAlgorithm(token: string, algorithm: string): string {
  const [, payload, signature] = token.split(".");
  return `${Buffer.from(JSON.stringify({ alg: algorithm, kid: "local-key" })).toString("base64url")}.${payload!}.${signature!}`;
}

function noncanonicalSignature(token: string): string {
  const [header, payload, signature] = token.split(".") as [string, string, string];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const value = alphabet.indexOf(signature.at(-1)!);
  const paddingBits = signature.length % 4 === 2 ? 4 : 2;
  const altered = `${signature.slice(0, -1)}${alphabet[(value & ~((1 << paddingBits) - 1)) | ((value + 1) & ((1 << paddingBits) - 1))]!}`;
  expect(base64url.decode(altered)).toEqual(base64url.decode(signature));
  return `${header}.${payload}.${altered}`;
}

const adminStoredFile = {
  r2Key: "cases/case-1/submissions/submission-1/file-1",
  originalName: "befund.jpg",
  mediaType: "image/jpeg",
  size: 3,
  etag: "etag-1",
  inlineSafe: 1,
};

interface AdminFileState {
  row: typeof adminStoredFile | null;
  reads: number;
  readonly calls: { readonly query: string; readonly values: readonly unknown[] }[];
}

function adminFileContext(
  state: AdminFileState,
  origin: string | null,
  assertionHeader: string | null,
  extraHeaders: Readonly<Record<string, string>> = {},
): DevelopmentRouteContext {
  const headers = new Headers(extraHeaders);
  if (origin !== null) headers.set("origin", origin);
  if (assertionHeader !== null) {
    headers.set("cf-access-jwt-assertion", assertionHeader);
  }
  const request = new Request(
    "https://admin.example.test/api/admin/files/file-1",
    { headers },
  );
  return {
    request,
    url: new URL(request.url),
    requestId: "request-1",
    env: {
      ACCESS_TEAM_DOMAIN: teamDomain,
      ACCESS_ADMIN_API_AUD: audience,
      TRANSFER_DB: {
        prepare(query: string) {
          return {
            bind(...values: unknown[]) {
              state.calls.push({ query, values });
              return { first: async () => state.row };
            },
          };
        },
      },
      TRANSFER_FILES: {
        async get() {
          state.reads += 1;
          return {
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff]));
                controller.close();
              },
            }),
            size: adminStoredFile.size,
            etag: adminStoredFile.etag,
          };
        },
      },
    },
  } as unknown as DevelopmentRouteContext;
}

describe("Cloudflare-Access-Verifier", () => {
  it("validiert lokales JWKS über kid und cached Factory trotz Key-Rotation", async () => {
    let resolverFactories = 0;
    const first = { ...await exportJWK(publicKey), kid: "kid-1", alg: "RS256", use: "sig" };
    const second = { ...await exportJWK(rotatedPublicKey), kid: "kid-2", alg: "RS256", use: "sig" };
    const jwks = { keys: [first] };
    const verifier = createAccessVerifier({
      createKeyResolver(jwksUrl) {
        resolverFactories += 1;
        expect(jwksUrl.href).toBe(`${issuer}/cdn-cgi/access/certs`);
        return async (protectedHeader, token) => createLocalJWKSet(jwks)(protectedHeader, token);
      },
    });
    await expect(verifier.verify(await assertion({}, privateKey, "kid-1"), teamDomain, audience)).resolves.toEqual({
      email: "admin@example.test", subject: "subject-1",
    });
    jwks.keys.push(second);
    await expect(verifier.verify(await assertion({}, rotatedPrivateKey, "kid-2"), teamDomain, audience)).resolves.toEqual({
      email: "admin@example.test", subject: "subject-1",
    });
    await expect(verifier.verify(await assertion({}, privateKey, "unknown"), teamDomain, audience)).resolves.toBeNull();
    expect(resolverFactories).toBe(1);
  });

  it("begrenzt Cache über Team-Domains und bindet Issuer fail-closed", async () => {
    let resolverFactories = 0;
    const verifier = createAccessVerifier({
      maxCachedJwks: 1,
      createKeyResolver: () => { resolverFactories += 1; return async () => publicKey; },
    });
    const token = await assertion();
    await expect(verifier.verify(token, teamDomain, audience)).resolves.not.toBeNull();
    await expect(verifier.verify(token, "other.cloudflareaccess.com", audience)).resolves.toBeNull();
    await expect(verifier.verify(token, teamDomain, audience)).resolves.not.toBeNull();
    expect(resolverFactories).toBe(3);
  });

  it.each([
    ["fehlend", null],
    ["leer", ""],
    ["kaputt", "a.b.c"],
    ["nichtkanonische Base64url", { noncanonical: true }],
    ["Padding", { padded: true }],
    ["falscher Algorithmus", { alg: "HS256" }],
    ["falscher Issuer", { iss: "https://evil.cloudflareaccess.com" }],
    ["falsche Audience", { aud: "other" }],
    ["abgelaufen", { exp: Math.floor(Date.now() / 1_000) - 1 }],
    ["nbf zukünftig", { nbf: Math.floor(Date.now() / 1_000) + 60 }],
    ["fehlende E-Mail", { email: undefined }],
    ["ungültige E-Mail", { email: "not-an-email" }],
  ])("weist %s fail-closed ab", async (_label, input) => {
    const verifier = createAccessVerifier({ createKeyResolver: () => async () => publicKey });
    const token = typeof input === "string" || input === null
      ? input
      : "alg" in input ? withAlgorithm(await assertion(), String(input.alg))
      : "noncanonical" in input ? noncanonicalSignature(await assertion())
      : "padded" in input ? `${await assertion()}=`
      : await assertion(input);
    await expect(verifier.verify(token, teamDomain, audience)).resolves.toBeNull();
  });

  it("weist unbrauchbare Audience-Konfiguration und ungetrimmtes Subject ab", async () => {
    const verifier = createAccessVerifier({ createKeyResolver: () => async () => publicKey });
    await expect(verifier.verify(await assertion(), teamDomain, " ")).resolves.toBeNull();
    await expect(verifier.verify(await assertion({ sub: " subject-1 " }), teamDomain, audience)).resolves.toBeNull();
  });

  it.each([
    "http://clinic.cloudflareaccess.com",
    "https://user@clinic.cloudflareaccess.com",
    "https://clinic.cloudflareaccess.com:8443",
    "https://clinic.cloudflareaccess.com/path",
    "attacker.example",
  ])("weist unsichere Team-Domain ab", async (domain) => {
    const verifier = createAccessVerifier({ createKeyResolver: () => async () => publicKey });
    await expect(verifier.verify(await assertion(), domain, audience)).resolves.toBeNull();
  });

  it("exportiert lokale JWKS kompatibel", async () => {
    expect((await exportJWK(publicKey)).kty).toBe("RSA");
  });

  it("Adminroute prüft Origin, Assertion und gibt nur E-Mail-DTO zurück", async () => {
    const token = await assertion();
    const verifier = createAccessVerifier({ createKeyResolver: () => async () => publicKey });
    const context = (origin: string | null, assertionHeader: string | null): DevelopmentRouteContext => {
      const headers = new Headers();
      if (origin) headers.set("origin", origin);
      if (assertionHeader) headers.set("cf-access-jwt-assertion", assertionHeader);
      const request = new Request("https://admin.example.test/api/admin/session", { headers });
      return {
        request, url: new URL(request.url), requestId: "request-1",
        env: { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_ADMIN_API_AUD: audience },
      } as unknown as DevelopmentRouteContext;
    };
    expect((await routeAdmin(context("https://evil.example.test", token), verifier)).status).toBe(403);
    expect((await routeAdmin(context("https://admin.example.test", null), verifier)).status).toBe(401);
    const response = await routeAdmin(context("https://admin.example.test", token), verifier);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, admin: { email: "admin@example.test" } });
  });

  it("liefert Admin-Datei nur mit exakter Origin und lokal verifiziertem RS256-JWT", async () => {
    const state: AdminFileState = {
      row: adminStoredFile,
      reads: 0,
      calls: [],
    };
    const verifier = createAccessVerifier({
      createKeyResolver: () => async () => publicKey,
    });

    const response = await routeAdmin(
      adminFileContext(
        state,
        "https://admin.example.test",
        await assertion(),
      ),
      verifier,
    );

    expect(response.status).toBe(200);
    expect(state.reads).toBe(1);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]?.values).toEqual(["file-1"]);
    expect(state.calls[0]?.query).toContain("f.state = 'stored'");
  });

  it.each([
    ["fehlende", null],
    ["falsche", "https://evil.example.test"],
  ])("weist %s Admin-Origin vor R2 mit 403 ab", async (_label, origin) => {
    const state: AdminFileState = {
      row: adminStoredFile,
      reads: 0,
      calls: [],
    };
    const verifier = createAccessVerifier({
      createKeyResolver: () => async () => publicKey,
    });

    const response = await routeAdmin(
      adminFileContext(state, origin, await assertion()),
      verifier,
    );

    expect(response.status).toBe(403);
    expect(state.reads).toBe(0);
    expect(state.calls).toHaveLength(0);
  });

  it.each([
    ["fehlenden Assertion-Header", null, {}],
    ["ungültige Assertion", "a.b.c", {}],
    [
      "gespoofte E-Mail ohne Assertion",
      null,
      { "cf-access-authenticated-user-email": "admin@example.test" },
    ],
  ])("weist %s vor R2 mit 401 ab", async (_label, assertionHeader, headers) => {
    const state: AdminFileState = {
      row: adminStoredFile,
      reads: 0,
      calls: [],
    };
    const verifier = createAccessVerifier({
      createKeyResolver: () => async () => publicKey,
    });

    const response = await routeAdmin(
      adminFileContext(
        state,
        "https://admin.example.test",
        assertionHeader,
        headers,
      ),
      verifier,
    );

    expect(response.status).toBe(401);
    expect(state.reads).toBe(0);
    expect(state.calls).toHaveLength(0);
  });

  it("liefert unbekannte Admin-Datei ohne R2 als 404", async () => {
    const state: AdminFileState = { row: null, reads: 0, calls: [] };
    const verifier = createAccessVerifier({
      createKeyResolver: () => async () => publicKey,
    });

    const response = await routeAdmin(
      adminFileContext(
        state,
        "https://admin.example.test",
        await assertion(),
      ),
      verifier,
    );

    expect(response.status).toBe(404);
    expect(state.reads).toBe(0);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]?.values).toEqual(["file-1"]);
  });

  it("hält Admin-API außerhalb Development bei 503", async () => {
    const request = new Request("https://admin.example.test/api/admin/session");
    const response = await routeRequest({
      request, url: new URL(request.url), requestId: "request-1", ctx: {} as ExecutionContext,
      env: { ENVIRONMENT: "production" },
    } as never);
    expect(response.status).toBe(503);
  });
});
