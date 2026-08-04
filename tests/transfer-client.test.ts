import { describe, expect, it, vi } from "vitest";

import {
  buildSubmissionPayload,
  CSRF_STORAGE_KEY,
  clearTransferSession,
  consumeFragmentToken,
  finalizeWhenAllUploaded,
  logoutTransferSession,
  parseTransferCaseSnapshot,
  parseTransferDraftResponse,
  parseTransferSessionResponse,
  parseHttpsLinks,
  requestTransferJson,
  storeCsrfToken,
  TransferUploadError,
  uploadPendingFiles,
  uploadTransferFile,
  validateTransferFiles,
} from "../src/scripts/transfer-client";

class RecordingStorage implements Storage {
  readonly writes: Array<readonly [string, string]> = [];
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.writes.push([key, value]);
    this.values.set(key, value);
  }
}

class FakeEventSource {
  private readonly handlers = new Map<string, Array<(event: Event) => void>>();

  addEventListener(type: string, handler: EventListener): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  emit(type: string, event: Event = new Event(type)): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
}

class FakeXhr extends FakeEventSource {
  readonly upload = new FakeEventSource();
  readonly headers = new Map<string, string>();
  readonly open = vi.fn();
  readonly send = vi.fn((body: Document | XMLHttpRequestBodyInit | null) => {
    this.sentBody = body;
    this.upload.emit("progress", {
      lengthComputable: true,
      loaded: 5,
      total: 10,
    } as ProgressEvent);
    this.emit(this.event);
  });
  responseText = JSON.stringify({ ok: true });
  sentBody: Document | XMLHttpRequestBodyInit | null = null;

  constructor(
    readonly status: number,
    private readonly event: "load" | "error" = "load",
  ) {
    super();
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
}

describe("Datentransfer-Client", () => {
  it("konsumiert #token, bereinigt die URL sofort und persistiert nur CSRF", () => {
    const history = { replaceState: vi.fn() };
    const storage = new RecordingStorage();

    expect(
      consumeFragmentToken(
        {
          hash: "#token=dt1_geheim%2Fwert",
          pathname: "/datentransfer/",
          search: "",
        },
        history,
      ),
    ).toBe("dt1_geheim/wert");
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/datentransfer/",
    );
    expect(storage.writes).toEqual([]);

    storeCsrfToken(storage, "csrf-session");
    expect(storage.writes).toEqual([[CSRF_STORAGE_KEY, "csrf-session"]]);

    clearTransferSession(storage);
    expect(storage.length).toBe(0);
  });

  it("akzeptiert höchstens acht reine HTTPS-Links und verwirft leere Zeilen", () => {
    expect(
      parseHttpsLinks("\nhttps://example.org/video\n  https://example.org/bild  \n"),
    ).toEqual([
      { url: "https://example.org/video" },
      { url: "https://example.org/bild" },
    ]);
    expect(() => parseHttpsLinks("http://example.org/unsicher")).toThrow(
      "HTTPS",
    );
    expect(() =>
      parseHttpsLinks(
        Array.from({ length: 9 }, (_, index) => `https://example.org/${index}`).join(
          "\n",
        ),
      ),
    ).toThrow("acht");
  });

  it("spiegelt Worker-Dateigrenzen und verbleibendes Fallvolumen", () => {
    const file = (name: string, type: string, size: number): File =>
      ({ name, type, size }) as File;

    expect(
      validateTransferFiles(
        [
          file("foto.heic", "image/heic", 12 * 1024 * 1024),
          file("clip.mov", "video/quicktime", 50 * 1024 * 1024),
        ],
        62 * 1024 * 1024,
      ),
    ).toEqual([
      { name: "foto.heic", mediaType: "image/heic", size: 12 * 1024 * 1024 },
      {
        name: "clip.mov",
        mediaType: "video/quicktime",
        size: 50 * 1024 * 1024,
      },
    ]);

    expect(() =>
      validateTransferFiles(
        [file("zu-gross.jpg", "image/jpeg", 12 * 1024 * 1024 + 1)],
        100 * 1024 * 1024,
      ),
    ).toThrow("12 MiB");
    expect(() =>
      validateTransferFiles(
        [file("falsch.pdf", "application/pdf", 10)],
        100,
      ),
    ).toThrow("Dateityp");
    expect(() =>
      validateTransferFiles([file("foto.jpg", "image/jpeg", 11)], 10),
    ).toThrow("Restkontingent");
    expect(() =>
      validateTransferFiles(
        Array.from({ length: 9 }, (_, index) =>
          file(`${index}.jpg`, "image/jpeg", 1),
        ),
        100,
      ),
    ).toThrow("acht");
  });

  it("baut nur das erlaubte Submission-Payload und verlangt Rückrufnummer sowie Bestätigungen", () => {
    const data = new FormData();
    data.set("title", "  Linkes Ohr  ");
    data.set("message", "  Luna kratzt sich seit gestern deutlich häufiger.  ");
    data.set("observedSince", "  Seit gestern Abend  ");
    data.set("urgency", "callback_requested");
    data.set("callbackPhone", "  0911 123456  ");
    data.set("notificationEmail", "  kunde@example.org  ");
    data.set("links", "https://example.org/video");
    data.set("privacyAccepted", "true");
    data.set("notEmergencyConfirmed", "true");
    const file = { name: "ohr.jpg", type: "image/jpeg", size: 100 } as File;

    expect(buildSubmissionPayload(data, [file], 1_000, true)).toEqual({
      title: "Linkes Ohr",
      message: "Luna kratzt sich seit gestern deutlich häufiger.",
      observedSince: "Seit gestern Abend",
      urgency: "callback_requested",
      callbackRequested: true,
      callbackPhone: "0911 123456",
      notificationEmail: "kunde@example.org",
      links: [{ url: "https://example.org/video" }],
      files: [{ name: "ohr.jpg", mediaType: "image/jpeg", size: 100 }],
      notEmergencyConfirmed: true,
    });

    data.delete("callbackPhone");
    expect(() => buildSubmissionPayload(data, [], 1_000, true)).toThrow(
      "Telefonnummer",
    );
    data.set("callbackPhone", "0911 123456");
    data.delete("notEmergencyConfirmed");
    expect(() => buildSubmissionPayload(data, [], 1_000, true)).toThrow(
      "Kein Notfall",
    );
  });

  it("lädt rohe Dateien per XHR mit CSRF, MIME und Fortschritt", async () => {
    const xhr = new FakeXhr(200);
    const file = { name: "ohr.jpg", type: "image/jpeg", size: 10 } as File;
    const progress = vi.fn();

    await uploadTransferFile(
      file,
      { fileId: "file-1", uploadUrl: "/api/transfers/uploads/file-1" },
      "csrf-session",
      progress,
      () => xhr as unknown as XMLHttpRequest,
    );

    expect(xhr.open).toHaveBeenCalledWith(
      "PUT",
      "/api/transfers/uploads/file-1",
    );
    expect(xhr.headers).toEqual(
      new Map([
        ["Content-Type", "image/jpeg"],
        ["X-Datentransfer-CSRF", "csrf-session"],
      ]),
    );
    expect(xhr.sentBody).toBe(file);
    expect(progress).toHaveBeenCalledWith(50);

    await expect(
      uploadTransferFile(
        file,
        { fileId: "file-1", uploadUrl: "/api/transfers/uploads/file-1" },
        "csrf-session",
        vi.fn(),
        () => new FakeXhr(503) as unknown as XMLHttpRequest,
      ),
    ).rejects.toMatchObject({ retryable: true });
    await expect(
      uploadTransferFile(
        file,
        { fileId: "file-1", uploadUrl: "/api/transfers/uploads/file-1" },
        "csrf-session",
        vi.fn(),
        () => new FakeXhr(400) as unknown as XMLHttpRequest,
      ),
    ).rejects.toMatchObject({ retryable: false });
    await expect(
      uploadTransferFile(
        file,
        { fileId: "file-1", uploadUrl: "/api/transfers/uploads/file-1" },
        "csrf-session",
        vi.fn(),
        () => new FakeXhr(401) as unknown as XMLHttpRequest,
      ),
    ).rejects.toMatchObject({ retryable: false, status: 401 });
    const malformedSuccess = new FakeXhr(200);
    malformedSuccess.responseText = JSON.stringify({ ok: false });
    await expect(
      uploadTransferFile(
        file,
        { fileId: "file-1", uploadUrl: "/api/transfers/uploads/file-1" },
        "csrf-session",
        vi.fn(),
        () => malformedSuccess as unknown as XMLHttpRequest,
      ),
    ).rejects.toMatchObject({ retryable: false, status: 200 });
  });

  it("wiederholt nur offene Slots und finalisiert erst nach allen Uploads", async () => {
    const files = [
      { name: "eins.jpg", type: "image/jpeg", size: 10 },
      { name: "zwei.jpg", type: "image/jpeg", size: 10 },
    ] as File[];
    const slots = [
      { fileId: "file-1", uploadUrl: "/api/transfers/uploads/file-1" },
      { fileId: "file-2", uploadUrl: "/api/transfers/uploads/file-2" },
    ];
    const completed = new Set<number>();
    const attempts: number[] = [];
    const upload = vi.fn(async (_file: File, _slot: unknown, index: number) => {
      attempts.push(index);
      if (
        index === 0 &&
        attempts.filter((attempt) => attempt === 0).length === 1
      ) {
        throw new TransferUploadError(true);
      }
    });
    const finalize = vi.fn(async () => undefined);

    const first = await uploadPendingFiles(files, slots, completed, upload);
    expect(first).toEqual([{ index: 0, retryable: true }]);
    expect(completed).toEqual(new Set([1]));
    expect(await finalizeWhenAllUploaded(files.length, completed, finalize)).toBe(
      false,
    );
    expect(finalize).not.toHaveBeenCalled();

    expect(await uploadPendingFiles(files, slots, completed, upload)).toEqual([]);
    expect(attempts).toEqual([0, 1, 0]);
    expect(await finalizeWhenAllUploaded(files.length, completed, finalize)).toBe(
      true,
    );
    expect(finalize).toHaveBeenCalledOnce();
  });

  it("löscht CSRF bei 401 und zeigt nur generischen Fehler samt Vorgangskennung", async () => {
    const storage = new RecordingStorage();
    storeCsrfToken(storage, "csrf-session");
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "unauthorized",
            message: "dt1_geheim und patientenakte.jpg",
            requestId: "req-401",
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    await expect(
      requestTransferJson("/api/transfers/case", {
        storage,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      message: "Die Sitzung ist abgelaufen. Vorgangskennung: req-401",
      requestId: "req-401",
      status: 401,
    });
    expect(storage.length).toBe(0);
  });

  it("weist eine HTTP-200-Antwort ohne ok=true als generischen API-Fehler ab", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, secret: "nicht anzeigen" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    await expect(
      requestTransferJson("/api/transfers/case", { fetchImpl }),
    ).rejects.toMatchObject({
      message: "Die Anfrage konnte nicht verarbeitet werden.",
      status: 200,
    });
  });

  it("verwirft unvollständige Session-, Draft- und Case-Erfolgsdaten", () => {
    const publicCase = {
      publicId: "ABCD1234EFGH",
      petName: "Luna",
      publicReference: null,
      expiresAt: "2026-08-18T20:00:00.000Z",
      remainingSubmissions: 2,
      remainingBytes: 1_000,
      allowReplies: true,
      allowCallback: true,
    };

    expect(() =>
      parseTransferSessionResponse({
        ok: true,
        case: { ...publicCase, allowCallback: undefined },
        csrfToken: "csrf",
      }),
    ).toThrow("Serverantwort");
    expect(() =>
      parseTransferDraftResponse({
        ok: true,
        submissionId: "submission-1",
        uploads: [{ fileId: "file-1", uploadUrl: "https://evil.example/upload" }],
      }),
    ).toThrow("Serverantwort");
    expect(() =>
      parseTransferCaseSnapshot({
        ok: true,
        case: publicCase,
        submissions: [],
        links: [],
        files: [],
      }),
    ).toThrow("Serverantwort");
  });

  it("meldet sich mit CSRF ab und löscht lokalen Sitzungszustand", async () => {
    const storage = new RecordingStorage();
    storeCsrfToken(storage, "csrf-session");
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    await logoutTransferSession(storage, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/transfers/session/logout",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          "X-Datentransfer-CSRF": "csrf-session",
        },
      }),
    );
    expect(storage.length).toBe(0);
  });
});
