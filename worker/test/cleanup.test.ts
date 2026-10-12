import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupExpired } from "../src/transfers/cleanup";
import {
  createSubmissionDraft,
  finalizeSubmission,
  validateSubmissionInput,
} from "../src/transfers/submissions";

function sqlResult<T>(results: T[], changes = 0): D1Result<T> {
  return {
    success: true,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
    results,
  };
}

class LifecycleStatement implements D1PreparedStatement {
  constructor(
    readonly database: LifecycleDatabase,
    readonly query: string,
    readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new LifecycleStatement(
      this.database,
      this.query,
      values.map((value) => {
        if (value === null || typeof value === "string" || typeof value === "number")
          return value;
        throw new TypeError("Unsupported test SQL value");
      }),
    );
  }

  first<T = unknown>(columnName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.database.sql.prepare(this.query).get(...this.values);
    return (row === undefined ? null : columnName ? row[columnName] : row) as T | null;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  execute<T>(): D1Result<T> {
    const changes = this.database.sql.prepare(this.query).run(...this.values).changes;
    return sqlResult<T>([], Number(changes));
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const rows = this.database.sql.prepare(this.query).all(...this.values);
    await this.database.afterRead?.(this.query);
    return sqlResult(rows as T[]);
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(_options?: {
    columnNames?: boolean;
  }): Promise<T[] | [string[], ...T[]]> {
    throw new Error("Unused raw binding");
  }
}

class LifecycleDatabase implements D1Database {
  readonly sql = new DatabaseSync(":memory:");
  afterRead: ((query: string) => Promise<void>) | undefined;
  beforeBatch: (() => void) | undefined;

  constructor() {
    this.sql.exec(
      readFileSync(
        new URL("../migrations/0001_datatransfer.sql", import.meta.url),
        "utf8",
      ),
    );
  }

  prepare(query: string): D1PreparedStatement {
    return new LifecycleStatement(this, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.beforeBatch?.();
    this.sql.exec("BEGIN");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof LifecycleStatement))
          throw new TypeError("Foreign SQL statement");
        return statement.execute<T>();
      });
      this.sql.exec("COMMIT");
      return results;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.sql.exec(query);
    return { count: 1, duration: 0 };
  }

  withSession(): D1DatabaseSession {
    throw new Error("Unused session binding");
  }
  dump(): Promise<ArrayBuffer> {
    throw new Error("Unused dump binding");
  }
}

const lifecycleDatabases: LifecycleDatabase[] = [];
const createdAt = "2026-08-04T10:00:00.000Z";
const slotExpiry = "2026-08-05T10:00:00.000Z";
const caseExpiry = "2026-08-18T10:00:00.000Z";
const caseRetention = "2026-08-25T10:00:00.000Z";

function lifecycleFixture() {
  const database = new LifecycleDatabase();
  lifecycleDatabases.push(database);
  const objects = new Map<string, Date>();
  const env = {
    TRANSFER_DB: database,
    TRANSFER_FILES: {
      delete: async (keys: string | string[]) => {
        for (const key of typeof keys === "string" ? [keys] : keys) objects.delete(key);
      },
      list: async (): Promise<R2Objects> => ({
        objects: [...objects].map(([key, uploaded]) => ({
          key,
          uploaded,
          version: "1",
          size: 1,
          etag: "etag",
          httpEtag: '"etag"',
          checksums: { toJSON: () => ({}) },
          storageClass: "Standard",
          writeHttpMetadata() {},
        })),
        truncated: false,
        delimitedPrefixes: [],
      }),
    },
    TRANSFER_NOTIFICATIONS: {
      send: vi.fn(),
      sendBatch: vi.fn(),
      metrics: vi.fn(),
    } satisfies Queue,
  };
  return { database, objects, env };
}

function seedCase(database: LifecycleDatabase, id = "case-1") {
  database.sql
    .prepare(
      `INSERT INTO transfer_cases
    (id, public_id, pet_name, created_by_sub, created_at, updated_at, expires_at, delete_after)
    VALUES (?, ?, 'Luna', 'admin', ?, ?, ?, ?)`,
    )
    .run(id, `public-${id}`, createdAt, createdAt, caseExpiry, caseRetention);
  database.sql
    .prepare(
      `INSERT INTO transfer_tokens
    (id, case_id, token_hmac, token_hint, created_at, expires_at)
    VALUES (?, ?, ?, 'hint', ?, ?)`,
    )
    .run(`token-${id}`, id, `token-hmac-${id}`, createdAt, caseExpiry);
  database.sql
    .prepare(
      `INSERT INTO transfer_sessions
    (id, case_id, token_id, session_hmac, csrf_hmac, created_at, last_seen_at, expires_at, absolute_expires_at)
    VALUES (?, ?, ?, ?, 'csrf', ?, ?, ?, ?)`,
    )
    .run(
      `session-${id}`,
      id,
      `token-${id}`,
      `session-hmac-${id}`,
      createdAt,
      createdAt,
      "2026-08-04T10:30:00.000Z",
      "2026-08-04T22:00:00.000Z",
    );
}

function renewSession(database: LifecycleDatabase, now: Date, id = "case-1") {
  database.sql
    .prepare(
      `UPDATE transfer_sessions SET created_at = ?, expires_at = ?, absolute_expires_at = ?
    WHERE id = ?`,
    )
    .run(
      now.toISOString(),
      new Date(now.getTime() + 1_800_000).toISOString(),
      new Date(now.getTime() + 43_200_000).toISOString(),
      `session-${id}`,
    );
}

async function draft(
  database: LifecycleDatabase,
  sizes: number[],
  now = new Date(createdAt),
  id = "case-1",
) {
  const input = validateSubmissionInput(
    {
      title: "Tagesbericht",
      message: "Dies ist ein ausreichend langer Bericht für die Praxis.",
      urgency: "normal",
      callbackRequested: false,
      links: [],
      notEmergencyConfirmed: true,
      files: sizes.map((size) => ({ name: "bild.jpg", mediaType: "image/jpeg", size })),
    },
    { allowCallback: true },
  );
  const result = await createSubmissionDraft(database, id, `session-${id}`, input, now);
  if (!result || result === "unauthorized")
    throw new Error("Fixture draft creation failed");
  return result;
}

function storeFiles(
  database: LifecycleDatabase,
  objects: Map<string, Date>,
  submissionId: string,
) {
  database.sql
    .prepare(
      `UPDATE transfer_files SET state = 'stored', stored_size = expected_size,
    verified_media_type = declared_media_type, etag = 'etag', uploaded_at = ?
    WHERE submission_id = ?`,
    )
    .run(createdAt, submissionId);
  for (const row of database.sql
    .prepare("SELECT r2_key FROM transfer_files WHERE submission_id = ?")
    .all(submissionId)) {
    objects.set(String(row.r2_key), new Date(createdAt));
  }
}

afterEach(() => {
  for (const database of lifecycleDatabases.splice(0)) database.sql.close();
});

describe("Transfer-Lifecycle mit echten SQLite-Transaktionen", () => {
  it("behält finalisierte Dateien bis zur Fallfrist und löscht sie erst dort", async () => {
    const { database, objects, env } = lifecycleFixture();
    seedCase(database);
    const submission = await draft(database, [123]);
    storeFiles(database, objects, submission.submissionId);
    expect(
      await finalizeSubmission(
        database,
        "case-1",
        "session-case-1",
        submission.submissionId,
        new Date(createdAt),
      ),
    ).toBeTruthy();

    await cleanupExpired(env, new Date(slotExpiry));
    expect(objects.size).toBe(1);
    expect(
      database.sql.prepare("SELECT state, delete_after FROM transfer_files").get(),
    ).toMatchObject({
      state: "stored",
      delete_after: caseRetention,
    });

    await cleanupExpired(env, new Date(caseRetention));
    expect(objects.size).toBe(0);
    expect(
      database.sql.prepare("SELECT COUNT(*) AS count FROM transfer_cases").get()?.count,
    ).toBe(0);
  });

  it("schützt bereits finalisierte Altdateien mit der alten 24-Stunden-Frist", async () => {
    const { database, objects, env } = lifecycleFixture();
    seedCase(database);
    const submission = await draft(database, [123]);
    storeFiles(database, objects, submission.submissionId);
    database.sql
      .prepare("UPDATE transfer_submissions SET status = 'submitted', finalized_at = ?")
      .run(createdAt);

    await cleanupExpired(env, new Date(slotExpiry));
    expect(objects.size).toBe(1);
    expect(database.sql.prepare("SELECT state FROM transfer_files").get()?.state).toBe(
      "stored",
    );
    await cleanupExpired(env, new Date(caseRetention));
    expect(objects.size).toBe(0);
  });

  it("überführt Fälle genau am Ablauf in expired und widerruft alle Zugangsdaten", async () => {
    const { database, env } = lifecycleFixture();
    seedCase(database);
    seedCase(database, "case-2");
    database.sql
      .prepare("UPDATE transfer_cases SET expires_at = ? WHERE id = 'case-2'")
      .run("2026-08-18T10:00:00.001Z");
    database.sql
      .prepare("UPDATE transfer_sessions SET expires_at = ?, absolute_expires_at = ?")
      .run(caseRetention, caseRetention);
    database.sql
      .prepare("UPDATE transfer_tokens SET expires_at = ?")
      .run(caseRetention);

    await cleanupExpired(env, new Date(Date.parse(caseExpiry) - 1));
    expect(
      database.sql.prepare("SELECT status FROM transfer_cases").get()?.status,
    ).toBe("open");
    await Promise.all([
      cleanupExpired(env, new Date(caseExpiry)),
      cleanupExpired(env, new Date(caseExpiry)),
    ]);
    expect(
      database.sql.prepare("SELECT status FROM transfer_cases").get()?.status,
    ).toBe("expired");
    expect(
      database.sql.prepare("SELECT revoked_at FROM transfer_tokens").get()?.revoked_at,
    ).toBe(caseExpiry);
    expect(
      database.sql.prepare("SELECT revoked_at FROM transfer_sessions").get()
        ?.revoked_at,
    ).toBe(caseExpiry);
    expect(
      database.sql
        .prepare("SELECT status FROM transfer_cases WHERE id = 'case-2'")
        .get()?.status,
    ).toBe("open");
    expect(
      database.sql
        .prepare("SELECT revoked_at FROM transfer_tokens WHERE case_id = 'case-2'")
        .get()?.revoked_at,
    ).toBeNull();
    expect(
      database.sql
        .prepare("SELECT revoked_at FROM transfer_sessions WHERE case_id = 'case-2'")
        .get()?.revoked_at,
    ).toBeNull();
    expect(
      database.sql.prepare("SELECT COUNT(*) AS count FROM transfer_cases").get()?.count,
    ).toBe(2);
    await cleanupExpired(env, new Date(caseRetention));
    expect(
      database.sql.prepare("SELECT COUNT(*) AS count FROM transfer_cases").get()?.count,
    ).toBe(0);
  });

  it("rollt den Fallablauf zurück, wenn die Zugangssperre scheitert", async () => {
    const { database, env } = lifecycleFixture();
    seedCase(database);
    database.sql
      .exec(`CREATE TRIGGER fail_expiration BEFORE UPDATE OF revoked_at ON transfer_sessions
      BEGIN SELECT RAISE(ABORT, 'injected revocation failure'); END;`);
    await expect(cleanupExpired(env, new Date(caseExpiry))).rejects.toThrow(
      "injected revocation failure",
    );
    expect(
      database.sql.prepare("SELECT status FROM transfer_cases").get()?.status,
    ).toBe("open");
    expect(
      database.sql.prepare("SELECT revoked_at FROM transfer_tokens").get()?.revoked_at,
    ).toBeNull();
    expect(
      database.sql.prepare("SELECT revoked_at FROM transfer_sessions").get()
        ?.revoked_at,
    ).toBeNull();
  });

  it("gibt alte Draftquoten bei konkurrierendem und wiederholtem Cleanup genau einmal frei", async () => {
    const { database, objects, env } = lifecycleFixture();
    seedCase(database);
    seedCase(database, "case-2");
    const stale = await draft(database, [123, 345]);
    storeFiles(database, objects, stale.submissionId);
    const recentAt = new Date("2026-08-05T09:59:59.999Z");
    renewSession(database, recentAt);
    const recent = await draft(database, [777], recentAt);
    renewSession(database, recentAt, "case-2");
    await draft(database, [999], recentAt, "case-2");

    await Promise.all([
      cleanupExpired(env, new Date(slotExpiry)),
      cleanupExpired(env, new Date(slotExpiry)),
    ]);
    await cleanupExpired(env, new Date(slotExpiry));

    expect(
      database.sql
        .prepare(
          "SELECT submission_count, total_bytes FROM transfer_cases WHERE id = 'case-1'",
        )
        .get(),
    ).toMatchObject({
      submission_count: 1,
      total_bytes: 777,
    });
    expect(
      database.sql
        .prepare("SELECT id FROM transfer_submissions WHERE case_id = 'case-1'")
        .all(),
    ).toEqual([expect.objectContaining({ id: recent.submissionId })]);
    expect(
      database.sql
        .prepare(
          "SELECT submission_count, total_bytes FROM transfer_cases WHERE id = 'case-2'",
        )
        .get(),
    ).toMatchObject({
      submission_count: 1,
      total_bytes: 999,
    });
    expect(objects.size).toBe(0);
    expect(await draft(database, [100], new Date(slotExpiry))).toBeTruthy();
  });

  it.each([
    ["Schließen", "closed", caseExpiry, false],
    ["Ablauf", "open", createdAt, false],
    ["eine Millisekunde vor Ablauf", "open", "2026-08-04T10:00:00.001Z", true],
  ])(
    "prüft %s erneut am Finalisierungsbatch",
    async (_name, status, expiry, success) => {
      const { database, objects } = lifecycleFixture();
      seedCase(database);
      const submission = await draft(database, [123]);
      storeFiles(database, objects, submission.submissionId);
      database.beforeBatch = () =>
        database.sql
          .prepare(
            "UPDATE transfer_cases SET status = ?, expires_at = ? WHERE id = 'case-1'",
          )
          .run(status, expiry);

      const result = await finalizeSubmission(
        database,
        "case-1",
        "session-case-1",
        submission.submissionId,
        new Date(createdAt),
      );
      expect(Boolean(result)).toBe(success);
      expect(
        database.sql.prepare("SELECT status FROM transfer_submissions").get()?.status,
      ).toBe(success ? "submitted" : "draft");
      expect(
        database.sql
          .prepare("SELECT COUNT(*) AS count FROM transfer_notifications")
          .get()?.count,
      ).toBe(success ? 1 : 0);
      expect(
        database.sql.prepare("SELECT delete_after FROM transfer_files").get()
          ?.delete_after,
      ).toBe(success ? caseRetention : slotExpiry);
    },
  );

  it("legt beim Replay mit identischem Zeitstempel keine zweite Notification an", async () => {
    const { database } = lifecycleFixture();
    seedCase(database);
    const submission = await draft(database, []);
    const args = [
      database,
      "case-1",
      "session-case-1",
      submission.submissionId,
      new Date(createdAt),
    ] as const;
    expect(await finalizeSubmission(...args)).toBeTruthy();
    expect(await finalizeSubmission(...args)).toBe(false);
    expect(
      database.sql.prepare("SELECT COUNT(*) AS count FROM transfer_notifications").get()
        ?.count,
    ).toBe(1);
  });

  it("finalisiert keine abgelaufenen Slots und ändert keinen fremden Fall", async () => {
    const { database, objects } = lifecycleFixture();
    seedCase(database);
    seedCase(database, "case-2");
    const submission = await draft(database, [123]);
    storeFiles(database, objects, submission.submissionId);
    expect(
      await finalizeSubmission(
        database,
        "case-2",
        "session-case-2",
        submission.submissionId,
        new Date(createdAt),
      ),
    ).toBe(false);
    renewSession(database, new Date(slotExpiry));
    expect(
      await finalizeSubmission(
        database,
        "case-1",
        "session-case-1",
        submission.submissionId,
        new Date(slotExpiry),
      ),
    ).toBe(false);
    expect(
      database.sql.prepare("SELECT status FROM transfer_submissions").get()?.status,
    ).toBe("draft");
    expect(
      database.sql.prepare("SELECT COUNT(*) AS count FROM transfer_notifications").get()
        ?.count,
    ).toBe(0);
    expect(
      database.sql
        .prepare(
          "SELECT submission_count, total_bytes FROM transfer_cases WHERE id = 'case-2'",
        )
        .get(),
    ).toMatchObject({
      submission_count: 0,
      total_bytes: 0,
    });
  });

  it("rollt Finalisierung und Notification beim Fehler der Fristmutation zurück", async () => {
    const { database, objects } = lifecycleFixture();
    seedCase(database);
    const submission = await draft(database, [123]);
    storeFiles(database, objects, submission.submissionId);
    database.sql
      .exec(`CREATE TRIGGER fail_retention BEFORE UPDATE OF delete_after ON transfer_files
      BEGIN SELECT RAISE(ABORT, 'injected retention failure'); END;`);
    await expect(
      finalizeSubmission(
        database,
        "case-1",
        "session-case-1",
        submission.submissionId,
        new Date(createdAt),
      ),
    ).rejects.toThrow("injected retention failure");
    expect(
      database.sql.prepare("SELECT status FROM transfer_submissions").get()?.status,
    ).toBe("draft");
    expect(
      database.sql.prepare("SELECT delete_after FROM transfer_files").get()
        ?.delete_after,
    ).toBe(slotExpiry);
    expect(
      database.sql.prepare("SELECT COUNT(*) AS count FROM transfer_notifications").get()
        ?.count,
    ).toBe(0);
  });

  it("rollt Quotenfreigabe zurück, wenn die Draftlöschung scheitert", async () => {
    const { database, env } = lifecycleFixture();
    seedCase(database);
    await draft(database, [123]);
    database.sql
      .exec(`CREATE TRIGGER fail_draft_delete BEFORE DELETE ON transfer_submissions
      BEGIN SELECT RAISE(ABORT, 'injected draft deletion failure'); END;`);
    await expect(cleanupExpired(env, new Date(slotExpiry))).rejects.toThrow(
      "injected draft deletion failure",
    );
    expect(
      database.sql
        .prepare("SELECT submission_count, total_bytes FROM transfer_cases")
        .get(),
    ).toMatchObject({
      submission_count: 1,
      total_bytes: 123,
    });
    expect(
      database.sql.prepare("SELECT COUNT(*) AS count FROM transfer_submissions").get()
        ?.count,
    ).toBe(1);
  });

  it("gibt die Quote eines nach der Draftauswahl finalisierten Berichts nicht frei", async () => {
    const { database, objects, env } = lifecycleFixture();
    seedCase(database);
    const submission = await draft(database, [123]);
    storeFiles(database, objects, submission.submissionId);
    const finalizationAt = new Date(Date.parse(slotExpiry) - 1);
    renewSession(database, finalizationAt);
    database.afterRead = async (query) => {
      if (!query.includes("SELECT id FROM transfer_submissions")) return;
      database.afterRead = undefined;
      expect(
        await finalizeSubmission(
          database,
          "case-1",
          "session-case-1",
          submission.submissionId,
          finalizationAt,
        ),
      ).toBeTruthy();
    };
    await cleanupExpired(env, new Date(slotExpiry));
    expect(
      database.sql
        .prepare("SELECT submission_count, total_bytes FROM transfer_cases")
        .get(),
    ).toMatchObject({
      submission_count: 1,
      total_bytes: 123,
    });
    expect(
      database.sql.prepare("SELECT status FROM transfer_submissions").get()?.status,
    ).toBe("submitted");
    expect(objects.size).toBe(1);
  });

  it("hält einen fehlgeschlagenen R2-Löschclaim retryfähig und finalisiert ihn nicht", async () => {
    const { database, objects, env } = lifecycleFixture();
    seedCase(database);
    const submission = await draft(database, [123]);
    storeFiles(database, objects, submission.submissionId);
    const now = new Date(slotExpiry);
    renewSession(database, now);
    database.sql
      .prepare("UPDATE transfer_submissions SET updated_at = ?")
      .run(slotExpiry);
    vi.spyOn(env.TRANSFER_FILES, "delete").mockRejectedValueOnce(
      new Error("R2 unavailable"),
    );
    const first = await cleanupExpired(env, now);
    expect(first.files).toBe(0);
    expect(objects.size).toBe(1);
    expect(database.sql.prepare("SELECT state FROM transfer_files").get()?.state).toBe(
      "rejected",
    );
    expect(
      await finalizeSubmission(
        database,
        "case-1",
        "session-case-1",
        submission.submissionId,
        now,
      ),
    ).toBe(false);
    const second = await cleanupExpired(env, now);
    expect(second.files).toBe(1);
    expect(objects.size).toBe(0);
    expect(database.sql.prepare("SELECT state FROM transfer_files").get()?.state).toBe(
      "deleted",
    );
  });

  it("löscht eine zwischen Auswahl und Löschclaim finalisierte Datei nicht", async () => {
    const { database, objects, env } = lifecycleFixture();
    seedCase(database);
    const submission = await draft(database, [123]);
    storeFiles(database, objects, submission.submissionId);
    // The request's timestamp predates the cleanup boundary; its batch wins first.
    const finalizationAt = new Date(Date.parse(slotExpiry) - 1);
    renewSession(database, finalizationAt);
    database.afterRead = async (query) => {
      if (!query.includes("SELECT id, r2_key")) return;
      database.afterRead = undefined;
      expect(
        await finalizeSubmission(
          database,
          "case-1",
          "session-case-1",
          submission.submissionId,
          finalizationAt,
        ),
      ).toBeTruthy();
    };
    // The draft's updated_at was refreshed before the stale-draft sweep.
    database.sql
      .prepare("UPDATE transfer_submissions SET updated_at = ?")
      .run(finalizationAt.toISOString());

    const result = await cleanupExpired(env, new Date(slotExpiry));
    expect(result.files).toBe(0);
    expect(objects.size).toBe(1);
    expect(
      database.sql.prepare("SELECT state, delete_after FROM transfer_files").get(),
    ).toMatchObject({
      state: "stored",
      delete_after: caseRetention,
    });
  });
});

describe("Datentransfer-Cleanup", () => {
  it("löscht R2 nicht, wenn der Schlüssel fehlt, und bleibt fail-closed", async () => {
    const prepare = vi.fn((query: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => ({
          results: query.includes("transfer_files") ? [{ id: "f1", r2_key: "" }] : [],
        }),
        run: async () => ({}),
      }),
    }));
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: vi.fn() },
    } as any;
    const result = await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));
    expect(result.files).toBe(0);
    expect(env.TRANSFER_FILES.delete).not.toHaveBeenCalled();
  });

  it("löscht nur tatsächlich abgelaufene geschlossene Fälle", async () => {
    const queries: string[] = [];
    const prepare = vi.fn((query: string) => {
      queries.push(query);
      return {
        bind: (..._args: unknown[]) => ({
          all: async () => ({ results: [] }),
          run: async () => ({}),
        }),
      };
    });
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: vi.fn() },
    } as any;
    await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));
    expect(
      queries.some((query) => query.includes("status IN ('closed', 'expired')")),
    ).toBe(true);
  });

  it("löscht nur alte, nicht in D1 referenzierte Transferobjekte", async () => {
    const old = new Date("2026-08-03T00:00:00.000Z");
    const activeKey = "cases/case-1/submissions/sub-1/file-1";
    const orphanKey = "cases/orphan/submissions/sub/file";
    const prepare = vi.fn((query: string) => {
      const all = async () => ({
        results: query.includes("SELECT r2_key") ? [{ r2_key: activeKey }] : [],
      });
      return {
        bind: (..._args: unknown[]) => ({
          all,
          run: async () => ({ meta: { changes: 0 } }),
        }),
        all,
      };
    });
    const remove = vi.fn();
    const list = vi.fn().mockResolvedValue({
      objects: [
        { key: activeKey, uploaded: old },
        { key: orphanKey, uploaded: old },
      ],
      truncated: false,
    });
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: remove, list },
    } as any;

    await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));

    expect(list).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(orphanKey);
    expect(remove).not.toHaveBeenCalledWith(activeKey);
  });

  it("stellt hängende Benachrichtigungen wieder in die Queue", async () => {
    const notificationId = "11111111-1111-4111-8111-111111111111";
    const prepare = vi.fn((query: string) => {
      const statement = {
        bind: (..._args: unknown[]) => statement,
        all: async () => ({
          results: query.includes("FROM transfer_notifications")
            ? [{ id: notificationId }]
            : [],
        }),
        run: async () => ({ meta: { changes: 1 } }),
      };
      return statement;
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: vi.fn() },
      TRANSFER_NOTIFICATIONS: { send },
    } as any;

    const result = await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ notificationId }, { contentType: "json" });
    expect(result.notifications).toBe(1);
  });
});
