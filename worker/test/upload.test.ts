import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevelopmentRouteContext } from "../src/env";
import { generateCsrfToken } from "../src/security/csrf";
import { createTransferSession } from "../src/transfers/sessions";
import { detectMediaType } from "../src/transfers/file-signatures";
import {
  uploadReservedFile,
  validateUploadHeaders,
  validatedUploadStream,
} from "../src/transfers/uploads";
import { routePublicTransfer } from "../src/transfers/routes-public";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

beforeEach(() => {
  vi.stubGlobal("FixedLengthStream", class extends TransformStream<Uint8Array, Uint8Array> {
    constructor(_length: number) { super(); }
  });
});

afterEach(() => vi.unstubAllGlobals());

function isoBmff(brand: string): Uint8Array {
  return bytes(
    0,
    0,
    0,
    16,
    0x66,
    0x74,
    0x79,
    0x70,
    ...[...brand].map((character) => character.charCodeAt(0)),
    0,
    0,
    0,
    0,
  );
}

function ftyp(major: string, ...compatible: string[]): Uint8Array {
  const size = 16 + compatible.length * 4;
  return bytes(
    (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff,
    0x66, 0x74, 0x79, 0x70,
    ...[...major].map((character) => character.charCodeAt(0)),
    0, 0, 0, 0,
    ...compatible.flatMap((brand) => [...brand].map((character) => character.charCodeAt(0))),
  );
}

describe("Magic-Byte-Erkennung", () => {
  it.each([
    ["JPEG", bytes(0xff, 0xd8, 0xff), "image/jpeg"],
    ["PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"],
    [
      "WebP",
      bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50),
      "image/webp",
    ],
    ["WebM", bytes(0x1a, 0x45, 0xdf, 0xa3), "video/webm"],
    ["MP4", isoBmff("isom"), "video/mp4"],
    ["QuickTime", isoBmff("qt  "), "video/quicktime"],
    ["HEIC", isoBmff("heic"), "image/heic"],
    ["HEIF", isoBmff("mif1"), "image/heif"],
  ])("erkennt %s", (_label, prefix, mediaType) => {
    expect(detectMediaType(prefix)).toBe(mediaType);
  });

  it.each([
    ["zu kurzes JPEG", bytes(0xff, 0xd8)],
    ["zu kurzes PNG", bytes(0x89, 0x50, 0x4e, 0x47)],
    ["unvollständiges WebP", bytes(0x52, 0x49, 0x46, 0x46)],
    ["AVIF", isoBmff("avif")],
    ["HEIF mit kompatiblem AVIF", ftyp("mif1", "avif")],
    ["MP4 mit kompatiblem AVIS", ftyp("isom", "avis")],
    ["unbekannte BMFF-Brand", isoBmff("free")],
    ["zufällige Bytes", bytes(1, 2, 3, 4)],
  ])("weist %s ab", (_label, prefix) => {
    expect(detectMediaType(prefix)).toBeNull();
  });
});

describe("Upload-Header", () => {
  const expected = { size: 12, mediaType: "image/jpeg" as const };

  it.each([
    ["fehlende Länge", new Headers({ "content-type": "image/jpeg" })],
    ["Exponent", new Headers({ "content-length": "1e1", "content-type": "image/jpeg" })],
    ["falsche Länge", new Headers({ "content-length": "11", "content-type": "image/jpeg" })],
    ["Parameter", new Headers({ "content-length": "12", "content-type": "image/jpeg; charset=x" })],
    ["falscher Typ", new Headers({ "content-length": "12", "content-type": "image/png" })],
    ["Kompression", new Headers({ "content-length": "12", "content-type": "image/jpeg", "content-encoding": "gzip" })],
  ])("weist %s ab", (_label, headers) => {
    expect(() => validateUploadHeaders(headers, expected)).toThrow();
  });

  it("akzeptiert exakte Länge und normalisierten Content-Type", () => {
    expect(() =>
      validateUploadHeaders(
        new Headers({ "content-length": "12", "content-type": "IMAGE/JPEG", "content-encoding": "identity" }),
        expected,
      ),
    ).not.toThrow();
  });
});

function d1Result(changes: number): D1Result {
  return {
    success: true,
    meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: changes, last_row_id: 0, changed_db: changes > 0, changes },
    results: [],
  };
}

class UploadStatement implements D1PreparedStatement {
  constructor(private readonly database: UploadDatabase, readonly query: string) {}
  bind(...values: unknown[]): D1PreparedStatement { this.database.calls.push({ query: this.query, values }); return this; }
  first<T = unknown>(_columnName?: string): Promise<T | null> {
    const result = this.query.includes("FROM transfer_sessions AS s")
      ? this.database.sessionRow
      : this.query.includes("SELECT f.id") ? this.database.slot : null;
    return Promise.resolve(result as T | null);
  }
  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    if (this.query.includes("SET state = 'stored'") && this.database.finalizeThrows) {
      return Promise.reject(new Error("finalize failed"));
    }
    if (this.query.includes("SET state = ?") && this.database.rollbackThrows > 0) {
      this.database.rollbackThrows -= 1;
      return Promise.reject(new Error("rollback failed"));
    }
    const changes = this.database.nextChanges();
    if (changes === 1) {
      if (this.query.includes("state = 'rejected'")) this.database.state = "rejected";
      if (this.query.includes("state = 'pending'")) this.database.state = "pending";
      if (this.query.includes("SET state = ?")) this.database.state = String(this.database.calls.at(-1)?.values[0]);
    }
    return Promise.resolve(d1Result(changes) as D1Result<T>);
  }
  all<T = Record<string, unknown>>(): Promise<D1Result<T>> { return Promise.resolve(d1Result(0) as D1Result<T>); }
  raw<T = unknown[]>(_: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(_?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(): Promise<T[] | [string[], ...T[]]> { throw new Error("unused"); }
}

class UploadDatabase implements Pick<D1Database, "prepare" | "batch"> {
  calls: { query: string; values: readonly unknown[] }[] = [];
  changes = [1, 1, 1];
  state = "pending";
  finalizeThrows = false;
  rollbackThrows = 0;
  sessionRow: unknown = null;
  slot = { id: "file-1", r2_key: "cases/case-1/submissions/s/file-1", size: 3, mediaType: "image/jpeg" as const };
  prepare(query: string): D1PreparedStatement { return new UploadStatement(this, query); }
  nextChanges(): number { return this.changes.shift() ?? 1; }
  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return statements.map((statement) => {
      const changes = this.nextChanges();
      if (changes === 1 && (statement as UploadStatement).query.includes("state = 'uploading'")) this.state = "uploading";
      return d1Result(changes) as D1Result<T>;
    });
  }
}

class UploadBucket {
  bytes = new Uint8Array();
  deletes = 0;
  result: { readonly size: number; readonly etag: string } | null = { size: 3, etag: "etag" };
  putThrows = false;
  deleteThrows = false;
  async put(_key: string, value: ReadableStream<Uint8Array>, _options: R2PutOptions): Promise<{ readonly size: number; readonly etag: string } | null> {
    if (this.putThrows) throw new Error("put failed");
    const reader = value.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) { const { value: chunk, done } = await reader.read(); if (done) break; if (chunk) chunks.push(chunk); }
    this.bytes = Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
    return this.result;
  }
  async delete(_key: string): Promise<void> { this.deletes += 1; if (this.deleteThrows) throw new Error("delete failed"); }
}

function uploadBody(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk)); controller.close(); } });
}

describe("Streaming-Upload", () => {
  const headers = new Headers({ "content-length": "3", "content-type": "image/jpeg" });
  const now = new Date("2026-08-04T10:00:00.000Z");

  it("streamt mehrchunkigen Präfix byteidentisch ohne tee-Cancel", async () => {
    const database = new UploadDatabase();
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff], [0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("stored");
    expect(bucket.bytes).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it("wartet auf vollständigen ftyp-Box-Header vor R2-Write", async () => {
    const prefix = ftyp("mif1");
    const stream = validatedUploadStream({ size: prefix.byteLength, mediaType: "image/heif" });
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const firstRead = reader.read();
    await writer.write(prefix.slice(0, 12));
    expect(await Promise.race([
      firstRead.then(() => "written"),
      new Promise((resolve) => setTimeout(() => resolve("waiting"), 1)),
    ])).toBe("waiting");
    await writer.write(prefix.slice(12));
    await writer.close();
    expect((await firstRead).value).toEqual(prefix);
  });

  it("weist falsche tatsächliche Länge ab und speichert nichts", async () => {
    const database = new UploadDatabase();
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff, 0]), "case-1", "session-1", "file-1", now)).resolves.toBe("invalid");
    expect(bucket.bytes).toEqual(new Uint8Array());
  });

  it("scheitert bei Session-Gate vor R2", async () => {
    const database = new UploadDatabase(); database.changes = [0, 0];
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("unauthorized");
    expect(bucket.bytes).toEqual(new Uint8Array());
  });

  it("weist fremde oder fehlende Datei-ID vor R2 ab", async () => {
    const database = new UploadDatabase(); database.slot = null as never;
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "other-file", now)).resolves.toBe("conflict");
    expect(bucket.bytes).toEqual(new Uint8Array());
  });

  it("weist Signatur-Mismatch zurück", async () => {
    const database = new UploadDatabase();
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0x89, 0x50, 0x4e]), "case-1", "session-1", "file-1", now)).resolves.toBe("invalid");
    expect(database.state).toBe("rejected");
  });

  it("löscht neu geschriebenes Objekt bei D1-Finalfehler", async () => {
    const database = new UploadDatabase(); database.changes = [1, 1, 0, 1];
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("unavailable");
    expect(bucket.deletes).toBe(1);
  });

  it("bindet Auswahl, Claim und Finalisierung an vollständige Case-Quota", async () => {
    const database = new UploadDatabase();
    await expect(uploadReservedFile(database, new UploadBucket(), headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("stored");
    const queries = database.calls.map((call) => call.query).join("\n");
    expect(queries).toContain("submission_count BETWEEN 1 AND c.max_submissions");
    expect(queries).toContain("total_bytes BETWEEN f.expected_size AND c.max_total_bytes");
    expect(queries).toContain("f.delete_after > ?");
    expect(queries).toContain("s.status = 'draft'");
  });

  it("claim 0 schreibt nichts nach R2", async () => {
    const database = new UploadDatabase(); database.changes = [1, 0];
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("conflict");
    expect(bucket.bytes).toEqual(new Uint8Array());
  });

  it("conditional R2 miss setzt Slot zurück ohne Delete", async () => {
    const database = new UploadDatabase(); database.changes = [1, 1, 1];
    const bucket = new UploadBucket(); bucket.result = null;
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("conflict");
    expect(bucket.deletes).toBe(0);
    expect(database.state).toBe("pending");
  });

  it("R2-Put-Fehler setzt Slot zurück", async () => {
    const database = new UploadDatabase(); database.changes = [1, 1, 1];
    const bucket = new UploadBucket(); bucket.putThrows = true;
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("unavailable");
    expect(database.state).toBe("pending");
  });

  it("kompensiert fehlendes Pending mit Rejected ohne Throw", async () => {
    const database = new UploadDatabase(); database.changes = [1, 1, 1]; database.rollbackThrows = 1;
    const bucket = new UploadBucket(); bucket.putThrows = true;
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("unavailable");
    expect(database.state).toBe("rejected");
  });

  it("Größenabweichung löscht Objekt und sperrt Slot", async () => {
    const database = new UploadDatabase(); database.changes = [1, 1, 1];
    const bucket = new UploadBucket(); bucket.result = { size: 2, etag: "etag" };
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("invalid");
    expect(bucket.deletes).toBe(1);
    expect(database.state).toBe("rejected");
  });

  it("Finale-D1-Exception löscht Objekt und setzt Slot zurück", async () => {
    const database = new UploadDatabase(); database.changes = [1, 1, 1]; database.finalizeThrows = true;
    const bucket = new UploadBucket();
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("unavailable");
    expect(bucket.deletes).toBe(1);
    expect(database.state).toBe("pending");
  });

  it("Delete-Fehler nach Finalisierung sperrt Orphan-Slot", async () => {
    const database = new UploadDatabase(); database.changes = [1, 1, 0, 1];
    const bucket = new UploadBucket(); bucket.deleteThrows = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(uploadReservedFile(database, bucket, headers, uploadBody([0xff, 0xd8, 0xff]), "case-1", "session-1", "file-1", now)).resolves.toBe("unavailable");
    expect(database.state).toBe("rejected");
    expect(error).toHaveBeenCalled();
  });
});

describe("Upload-API-Gate", () => {
  function context(request: Request): DevelopmentRouteContext {
    return {
      request,
      url: new URL(request.url),
      requestId: "request-1",
      env: { TRANSFER_DB: new UploadDatabase(), TRANSFER_FILES: new UploadBucket() },
    } as unknown as DevelopmentRouteContext;
  }

  it("verlangt gleiche Origin vor Upload", async () => {
    const response = await routePublicTransfer(context(new Request("https://example.test/api/transfers/uploads/file-1", { method: "PUT" })));
    expect(response.status).toBe(403);
  });

  it("verlangt Transfer-Session vor Upload", async () => {
    const response = await routePublicTransfer(context(new Request("https://example.test/api/transfers/uploads/file-1", {
      method: "PUT", headers: { origin: "https://example.test" },
    })));
    expect(response.status).toBe(401);
  });

  async function authenticatedContext(csrf: string | null): Promise<{
    context: DevelopmentRouteContext;
    csrfToken: string;
  }> {
    const pepper = "session-pepper";
    const session = await createTransferSession(pepper, new Date());
    const database = new UploadDatabase();
    const csrfToken = await generateCsrfToken(pepper);
    database.sessionRow = {
      session_id: "session-1", session_hmac: session.storage.sessionHmac,
      csrf_hmac: csrfToken.csrfHmac,
      session_expires_at: session.storage.expiresAt,
      absolute_expires_at: session.storage.absoluteExpiresAt,
      session_revoked_at: null, case_id: "case-1", public_id: "case-public",
      pet_name: "Pet", public_reference: "REF", status: "open", allow_replies: 1,
      allow_callback: 1, max_submissions: 2, max_total_bytes: 100,
      submission_count: 1, total_bytes: 3,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const request = new Request("https://example.test/api/transfers/uploads/file-1", {
      method: "PUT",
      headers: {
        origin: "https://example.test", cookie: `dt_session=${session.cookieValue}`,
        "x-datentransfer-csrf": csrf ?? csrfToken.token, "content-length": "3", "content-type": "image/jpeg",
      },
      body: uploadBody([0xff], [0xd8, 0xff]),
      // Request streaming is required by undici for a ReadableStream body.
      duplex: "half",
    } as RequestInit);
    return {
      csrfToken: csrfToken.token,
      context: {
      request, url: new URL(request.url), requestId: "request-1",
      env: { TRANSFER_DB: database, TRANSFER_FILES: new UploadBucket(), SESSION_PEPPER: pepper },
      } as unknown as DevelopmentRouteContext,
    };
  }

  it("weist ungültiges CSRF vor R2 ab", async () => {
    const fixture = await authenticatedContext("invalid");
    const response = await routePublicTransfer(fixture.context);
    expect(response.status).toBe(403);
  });

  it("akzeptiert gültiges PUT nach Session und CSRF", async () => {
    const fixture = await authenticatedContext(null);
    expect(fixture.context.request.headers.get("x-datentransfer-csrf")).toBe(fixture.csrfToken);
    const response = await routePublicTransfer(fixture.context);
    expect(response.status).toBe(200);
  });
});
