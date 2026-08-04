import { describe, expect, it, vi } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "../src/security/csrf";
import { hmacHex } from "../src/security/hmac";
import {
  clearSessionCookie,
  createTransferSession,
  nextSessionExpiry,
  parseSessionCookie,
  serializeSessionCookie,
  verifyTransferSession,
  type StoredTransferSession,
} from "../src/transfers/sessions";

const sessionPepper = "test-session-pepper";
const now = new Date("2026-08-04T10:00:00.000Z");
const validCookieValue = "A".repeat(43);

describe("transfer session cookie", () => {
  it("serializes an exact host-only session cookie", () => {
    const cookie = serializeSessionCookie(validCookieValue);

    expect(cookie).toBe(
      `dt_session=${validCookieValue}; Max-Age=1800; Path=/api/transfers/; Secure; HttpOnly; SameSite=Strict`,
    );
    expect(cookie).not.toContain("Domain=");
    expect(clearSessionCookie()).toBe(
      "dt_session=; Max-Age=0; Path=/api/transfers/; Secure; HttpOnly; SameSite=Strict",
    );
  });

  it("accepts exactly one canonical session cookie", () => {
    expect(
      parseSessionCookie(`other=x; dt_session=${validCookieValue}; theme=dark`),
    ).toBe(validCookieValue);
  });

  it.each([
    null,
    "",
    "other=x",
    "dt_session=",
    `dt_session= ${validCookieValue}`,
    `dt_session=${validCookieValue}=`,
    `dt_session=${validCookieValue.slice(0, -1)}.`,
    `dt_session=${validCookieValue}; dt_session=${validCookieValue}`,
  ])("rejects missing, duplicate or malformed cookie %j", (header) => {
    expect(parseSessionCookie(header)).toBeNull();
  });
});

describe("transfer session lifecycle", () => {
  it("creates a 32-byte secret with 30-minute and 12-hour bounds", async () => {
    const generated = await createTransferSession(sessionPepper, now);

    expect(generated.cookieValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.storage).not.toHaveProperty("cookieValue");
    expect(generated.storage).not.toHaveProperty("secret");
    expect(generated.storage.expiresAt).toBe("2026-08-04T10:30:00.000Z");
    expect(generated.storage.absoluteExpiresAt).toBe(
      "2026-08-04T22:00:00.000Z",
    );
    expect(generated.setCookie).toBe(
      serializeSessionCookie(generated.cookieValue),
    );
  });

  it("caps sliding expiry at the absolute boundary", () => {
    expect(nextSessionExpiry(now, "2026-08-04T22:00:00.000Z")).toBe(
      "2026-08-04T10:30:00.000Z",
    );
    expect(
      nextSessionExpiry(
        new Date("2026-08-04T21:45:00.000Z"),
        "2026-08-04T22:00:00.000Z",
      ),
    ).toBe("2026-08-04T22:00:00.000Z");
    expect(nextSessionExpiry(now, "not-a-date")).toBeNull();
  });

  it("verifies a live session with session-domain separation", async () => {
    const sessionHmac = await hmacHex(
      sessionPepper,
      `session-v1\0${validCookieValue}`,
    );
    const csrfHmac = await hmacHex(
      sessionPepper,
      `csrf-v1\0${validCookieValue}`,
    );
    const stored: StoredTransferSession = {
      sessionHmac,
      expiresAt: "2026-08-04T10:00:01.000Z",
      absoluteExpiresAt: "2026-08-04T22:00:00.000Z",
      revokedAt: null,
    };

    await expect(
      verifyTransferSession(validCookieValue, stored, sessionPepper, now),
    ).resolves.toBe(true);
    await expect(
      verifyTransferSession(
        validCookieValue,
        { ...stored, sessionHmac: csrfHmac },
        sessionPepper,
        now,
      ),
    ).resolves.toBe(false);
  });

  it("fails closed for revoked, expired and malformed sessions", async () => {
    const generated = await createTransferSession(sessionPepper, now);
    const live: StoredTransferSession = {
      ...generated.storage,
      expiresAt: "2026-08-04T10:00:01.000Z",
      absoluteExpiresAt: "2026-08-04T22:00:00.000Z",
      revokedAt: null,
    };

    for (const [value, stored] of [
      [generated.cookieValue, { ...live, revokedAt: now.toISOString() }],
      [generated.cookieValue, { ...live, expiresAt: now.toISOString() }],
      [generated.cookieValue, { ...live, absoluteExpiresAt: now.toISOString() }],
      [generated.cookieValue, { ...live, expiresAt: "invalid" }],
      [generated.cookieValue, { ...live, absoluteExpiresAt: "invalid" }],
      [`${generated.cookieValue}=`, live],
      ["wrong", live],
    ] satisfies Array<[string, StoredTransferSession]>) {
      await expect(
        verifyTransferSession(value, stored, sessionPepper, now),
      ).resolves.toBe(false);
    }
  });
});

describe("CSRF rotation", () => {
  it("verifies only canonical tokens under the CSRF domain", async () => {
    const generated = await generateCsrfToken(sessionPepper);
    const sessionDomainHmac = await hmacHex(
      sessionPepper,
      `session-v1\0${generated.token}`,
    );

    expect(generated.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.token).not.toContain("=");
    await expect(
      verifyCsrfToken(generated.token, generated.csrfHmac, sessionPepper),
    ).resolves.toBe(true);
    await expect(
      verifyCsrfToken(generated.token, sessionDomainHmac, sessionPepper),
    ).resolves.toBe(false);
    await expect(
      verifyCsrfToken(`${generated.token}=`, generated.csrfHmac, sessionPepper),
    ).resolves.toBe(false);
    await expect(
      verifyCsrfToken(` ${generated.token}`, generated.csrfHmac, sessionPepper),
    ).resolves.toBe(false);
    await expect(
      verifyCsrfToken(
        `${generated.token.slice(0, -1)}.`,
        generated.csrfHmac,
        sessionPepper,
      ),
    ).resolves.toBe(false);
    await expect(
      verifyCsrfToken("short", generated.csrfHmac, sessionPepper),
    ).resolves.toBe(false);
    await expect(
      verifyCsrfToken(null, generated.csrfHmac, sessionPepper),
    ).resolves.toBe(false);
  });

  it("invalidates the old token when its stored HMAC is replaced", async () => {
    const previous = await generateCsrfToken(sessionPepper);
    const rotated = await generateCsrfToken(sessionPepper);

    await expect(
      verifyCsrfToken(previous.token, rotated.csrfHmac, sessionPepper),
    ).resolves.toBe(false);
    await expect(
      verifyCsrfToken(rotated.token, rotated.csrfHmac, sessionPepper),
    ).resolves.toBe(true);
  });

  it("does not log session or CSRF secrets", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const session = await createTransferSession(sessionPepper, now);
    await verifyTransferSession(
      session.cookieValue,
      { ...session.storage, revokedAt: null },
      sessionPepper,
      now,
    );
    const csrf = await generateCsrfToken(sessionPepper);
    await verifyCsrfToken(csrf.token, csrf.csrfHmac, sessionPepper);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
