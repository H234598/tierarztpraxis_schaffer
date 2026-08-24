import { describe, expect, it, vi } from "vitest";

import {
  loadAdminStoredFile,
  loadCustomerStoredFile,
  parseSingleRange,
  storedFileResponse,
} from "../src/transfers/file-response";
import { routePublicTransfer } from "../src/transfers/routes-public";
import type { DevelopmentRouteContext } from "../src/env";

describe("Single-Range-Parser", () => {
  const size = 10;

  it.each([
    ["bytes=0-0", { offset: 0, length: 1 }],
    ["bytes=2-5", { offset: 2, length: 4 }],
    ["bytes=8-99", { offset: 8, length: 2 }],
    ["bytes=8-", { offset: 8, length: 2 }],
    ["bytes=-3", { offset: 7, length: 3 }],
    ["bytes=-99", { offset: 0, length: 10 }],
  ])("parst %s", (header, expected) => {
    expect(parseSingleRange(header, size)).toEqual(expected);
  });

  it.each([
    "bytes=0-1,3-4",
    "bytes=10-10",
    "bytes=5-4",
    "bytes=-0",
    "bytes=999999999999999999999-",
    "items=0-1",
    "bytes=foo-bar",
  ])("weist %s als unzulässig ab", (header) => {
    expect(parseSingleRange(header, size)).toBe("invalid");
  });

  it("unterscheidet fehlenden Range-Header", () => {
    expect(parseSingleRange(null, size)).toBeNull();
  });
});

function stream(...bytes: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

describe("Geschützte R2-Antwort", () => {
  const metadata = {
    r2Key: "private/key",
    originalName: "Befund\r\nüber.mp4",
    mediaType: "video/mp4",
    size: 10,
    etag: "etag-1",
    inlineSafe: 1,
  };
  const calls: R2GetOptions[] = [];
  const bucket = {
    async get(_key: string, options?: R2GetOptions) {
      calls.push(options ?? {});
      const range = options?.range;
      const offset = typeof range === "object" && "offset" in range ? range.offset : 0;
      const length = typeof range === "object" && "length" in range ? range.length : 10;
      return {
        body: stream(...Array.from({ length }, (_, index) => offset + index)),
        size: 10,
        etag: "etag-1",
        ...(range ? { range: { offset, length } } : {}),
      };
    },
  };

  it("liefert Range-Stream mit ETag-Precondition und sicheren Headern", async () => {
    calls.length = 0;
    const response = await storedFileResponse(
      bucket as never,
      metadata,
      "bytes=2-5",
      "request-1",
    );
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) return;
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''Befund__%C3%BCber.mp4",
    );
    expect(calls[0]).toMatchObject({
      onlyIf: { etagMatches: "etag-1" },
      range: { offset: 2, length: 4 },
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([2, 3, 4, 5]),
    );
  });

  it("verweigert unzulässige Range ohne R2-Lesevorgang", async () => {
    calls.length = 0;
    await expect(
      storedFileResponse(bucket as never, metadata, "bytes=99-", "request-1"),
    ).resolves.toBe("invalid");
    expect(calls).toHaveLength(0);
  });

  it("liefert unsichere Medien nur als Attachment ohne Range", async () => {
    const response = await storedFileResponse(
      bucket as never,
      { ...metadata, mediaType: "image/heic", inlineSafe: 0 },
      "bytes=2-5",
      "request-1",
    );
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) return;
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment/u);
    expect(response.headers.get("accept-ranges")).toBeNull();
  });

  it("hält inkonsistentes Inline-Flag, fehlendes und falsches R2 fail-closed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      storedFileResponse(
        bucket as never,
        { ...metadata, inlineSafe: 2 },
        null,
        "request-1",
      ),
    ).resolves.toBe("unavailable");
    await expect(
      storedFileResponse(
        { get: async () => null } as never,
        metadata,
        null,
        "request-1",
      ),
    ).resolves.toBe("unavailable");
    await expect(
      storedFileResponse(
        { get: async () => ({ body: stream(1), size: 9, etag: "wrong" }) } as never,
        metadata,
        null,
        "request-1",
      ),
    ).resolves.toBe("unavailable");
    expect(error).toHaveBeenCalledWith("transfer_file_object_unavailable", "request-1");
  });

  it("kodiert lone-surrogate-Dateinamen ohne Throw", async () => {
    const response = await storedFileResponse(
      bucket as never,
      { ...metadata, originalName: "x\ud800.jpg" },
      null,
      "request-1",
    );
    expect(response).toBeInstanceOf(Response);
  });

  it.each([
    [
      "get throw",
      {
        get: async () => {
          throw new Error("r2");
        },
      },
    ],
    ["conditional miss", { get: async () => ({ size: 10, etag: "etag-1" }) }],
    [
      "etag mismatch",
      { get: async () => ({ body: stream(1), size: 10, etag: "other" }) },
    ],
    [
      "size mismatch",
      { get: async () => ({ body: stream(1), size: 9, etag: "etag-1" }) },
    ],
    [
      "range mismatch",
      {
        get: async () => ({
          body: stream(1),
          size: 10,
          etag: "etag-1",
          range: { offset: 3, length: 4 },
        }),
      },
    ],
  ])("weist R2-%s mit festem Event ab", async (_label, failingBucket) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      storedFileResponse(failingBucket as never, metadata, "bytes=2-5", "request-1"),
    ).resolves.toBe("unavailable");
    expect(error).toHaveBeenCalledWith("transfer_file_object_unavailable", "request-1");
  });
});

describe("D1-Dateibindung", () => {
  const row = {
    r2Key: "private/key",
    originalName: "x.jpg",
    mediaType: "image/jpeg",
    size: 3,
    etag: "etag",
    inlineSafe: 1,
  };
  const calls: { query: string; values: readonly unknown[] }[] = [];
  const database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ query, values });
          return { first: async () => row };
        },
      };
    },
  } as Pick<D1Database, "prepare">;

  it("bindet Customer-Datei an Session, Case und frische Ablaufgrenzen", async () => {
    calls.length = 0;
    await expect(
      loadCustomerStoredFile(
        database,
        "file-1",
        "case-1",
        "session-1",
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).resolves.toEqual(row);
    expect(calls[0]?.values).toEqual([
      "file-1",
      "case-1",
      "session-1",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
    expect(calls[0]?.query).toContain("active_session.revoked_at IS NULL");
  });

  it("bindet Admin-Datei nur an stored File-ID", async () => {
    calls.length = 0;
    await expect(loadAdminStoredFile(database, "file-1")).resolves.toEqual(row);
    expect(calls[0]?.values).toEqual(["file-1"]);
    expect(calls[0]?.query).toContain("f.state = 'stored'");
  });
});

describe("Customer-Dateiroute", () => {
  it("weist fehlende Session vor jedem R2-Zugriff ab", async () => {
    let reads = 0;
    const request = new Request(
      "https://example.test/api/transfers/files/file-foreign",
    );
    const response = await routePublicTransfer({
      request,
      url: new URL(request.url),
      requestId: "request-1",
      env: {
        TRANSFER_FILES: {
          get: async () => {
            reads += 1;
            return null;
          },
        },
        TRANSFER_DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
        SESSION_PEPPER: "pepper",
      },
    } as unknown as DevelopmentRouteContext);
    expect(response.status).toBe(401);
    expect(reads).toBe(0);
  });
});
