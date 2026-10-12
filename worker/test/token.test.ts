import { describe, expect, it, vi } from "vitest";
import { hmacHex, verifyHmacHex } from "../src/security/hmac";
import {
  generateTransferToken,
  parseTransferToken,
  verifyTransferToken,
  type StoredTransferToken,
} from "../src/transfers/tokens";

const tokenPepper = "test-token-pepper";
const now = new Date("2026-08-04T10:00:00.000Z");
const validStaticToken = `dt1_ABCDEFGHIJKL_${"A".repeat(43)}`;

describe("HMAC-SHA-256", () => {
  it("matches a known HMAC vector and verifies natively", async () => {
    const value = "The quick brown fox jumps over the lazy dog";
    const expected = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

    await expect(hmacHex("key", value)).resolves.toBe(expected);
    await expect(verifyHmacHex("key", value, expected)).resolves.toBe(true);
    await expect(verifyHmacHex("key", `${value}.`, expected)).resolves.toBe(false);
  });

  it.each(["", "0".repeat(63), "0".repeat(65), `${"0".repeat(63)}g`, " ".repeat(64)])(
    "rejects malformed signature %j without throwing",
    async (signature) => {
      await expect(verifyHmacHex("key", "value", signature)).resolves.toBe(false);
    },
  );
});

describe("transfer token format", () => {
  it("parses the exact canonical format", () => {
    expect(parseTransferToken(validStaticToken)).toEqual({
      version: "dt1",
      publicCaseId: "ABCDEFGHIJKL",
      secret: "A".repeat(43),
    });
  });

  it.each([
    `dt2_ABCDEFGHIJKL_${"A".repeat(43)}`,
    `dt1_ABCDEFGHIJKL_${"A".repeat(42)}`,
    `dt1_ABCDEFGHIJKL_${"A".repeat(43)}=`,
    `dt1_ABCDEFGHIJKL_${"A".repeat(42)}B`,
    `dt1_ABCDEFGHIJKL_${"A".repeat(42)}.`,
    `dt1_ABCDEFGHIJKL_${"A".repeat(42)}_A`,
    `dt1_ABCDEFGHIJK_${"A".repeat(43)}`,
    `dt1_ABCDEFGHIJKLMNOPQ_${"A".repeat(43)}`,
    `dt1_ABCDEFGHIJ1L_${"A".repeat(43)}`,
    ` dt1_ABCDEFGHIJKL_${"A".repeat(43)}`,
    `dt1_ABCDEFGHIJKL_${"A".repeat(42)} `,
    `dt1_ABCDEFGHIJKL_${"A".repeat(42)}\n`,
  ])("rejects malformed input %j", (token) => {
    expect(parseTransferToken(token)).toBeNull();
  });
});

describe("transfer token lifecycle", () => {
  it("generates, parses and verifies a token without persisting its secret", async () => {
    const generated = await generateTransferToken(tokenPepper);
    const parsed = parseTransferToken(generated.token);

    expect(parsed).not.toBeNull();
    expect(generated.storage.publicCaseId).toMatch(/^[A-Z2-7]{16}$/);
    expect(parsed?.publicCaseId).toBe(generated.storage.publicCaseId);
    expect(parsed?.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(parsed?.secret).not.toContain("=");
    expect(generated.token.match(/_/g)).toHaveLength(2);
    expect(generated.storage.version).toBe("dt1");
    expect(generated.storage.tokenHint).toBe(parsed?.secret.slice(-4));
    expect(generated.storage).not.toHaveProperty("token");
    expect(generated.storage).not.toHaveProperty("secret");
    await expect(
      verifyHmacHex(tokenPepper, parsed?.secret ?? "", generated.storage.tokenHmac),
    ).resolves.toBe(true);

    const stored: StoredTransferToken = {
      ...generated.storage,
      expiresAt: "2026-08-04T10:00:01.000Z",
      revokedAt: null,
    };
    await expect(
      verifyTransferToken(generated.token, stored, tokenPepper, now),
    ).resolves.toBe(true);
  });

  it("fails closed for every stored-token mismatch", async () => {
    const generated = await generateTransferToken(tokenPepper);
    const stored: StoredTransferToken = {
      ...generated.storage,
      expiresAt: "2026-08-04T10:00:01.000Z",
      revokedAt: null,
    };
    const otherPublicId =
      stored.publicCaseId[0] === "A"
        ? `B${stored.publicCaseId.slice(1)}`
        : `A${stored.publicCaseId.slice(1)}`;

    for (const candidate of [
      { ...stored, publicCaseId: otherPublicId },
      { ...stored, version: "dt2" },
      { ...stored, tokenHmac: "0".repeat(64) },
      { ...stored, expiresAt: now.toISOString() },
      { ...stored, expiresAt: "not-a-date" },
      { ...stored, revokedAt: now.toISOString() },
    ]) {
      await expect(
        verifyTransferToken(generated.token, candidate, tokenPepper, now),
      ).resolves.toBe(false);
    }
  });

  it("does not log tokens or secrets", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const generated = await generateTransferToken(tokenPepper);
    await verifyTransferToken(
      generated.token,
      {
        ...generated.storage,
        expiresAt: "2026-08-04T10:00:01.000Z",
        revokedAt: null,
      },
      tokenPepper,
      now,
    );

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
