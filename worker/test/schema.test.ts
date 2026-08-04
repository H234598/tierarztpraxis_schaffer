import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workerDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = join(workerDirectory, "node_modules", ".bin", "wrangler");
const temporaryDirectoryPrefix = resolve(
  tmpdir(),
  "tierarztpraxis-d1-schema-",
);

const expectedTables = [
  "d1_migrations",
  "transfer_audit_events",
  "transfer_cases",
  "transfer_files",
  "transfer_links",
  "transfer_notifications",
  "transfer_replies",
  "transfer_sessions",
  "transfer_submissions",
  "transfer_tokens",
];

const expectedIndexes = [
  "idx_transfer_cases_status_expires",
  "idx_transfer_files_submission_state",
  "idx_transfer_notifications_state_created",
  "idx_transfer_sessions_hmac",
  "idx_transfer_submissions_case_created",
  "idx_transfer_tokens_case",
];

let persistenceDirectory = "";
let databasePath = "";
let database: DatabaseSync | undefined;
let firstMigration: SpawnSyncReturns<string>;

function runWrangler(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(wrangler, args, {
    cwd: workerDirectory,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
}

function migrationOutput(result: SpawnSyncReturns<string>): string {
  return [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean)
    .join("\n");
}

function findSqliteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findSqliteFiles(path);
    return entry.isFile() &&
      entry.name.endsWith(".sqlite") &&
      entry.name !== "metadata.sqlite"
      ? [path]
      : [];
  });
}

function migratedDatabase(): DatabaseSync {
  expect(firstMigration.status, migrationOutput(firstMigration)).toBe(0);
  expect(firstMigration.error, migrationOutput(firstMigration)).toBeUndefined();
  if (!database) throw new Error("Wrangler created no usable local D1 database");
  return database;
}

function expectConstraintFailure(db: DatabaseSync, sql: string): void {
  expect(() => db.exec(sql)).toThrow(/constraint/i);
}

function schemaRows(db: DatabaseSync): unknown[] {
  return db
    .prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all();
}

beforeAll(() => {
  persistenceDirectory = mkdtempSync(temporaryDirectoryPrefix);
  firstMigration = runWrangler([
    "d1",
    "migrations",
    "apply",
    "TRANSFER_DB",
    "--local",
    "--env",
    "development",
    "--persist-to",
    persistenceDirectory,
  ]);

  if (firstMigration.status === 0) {
    const sqliteFiles = findSqliteFiles(persistenceDirectory);
    if (sqliteFiles.length === 1 && sqliteFiles[0]) {
      databasePath = sqliteFiles[0];
      database = new DatabaseSync(databasePath);
      database.exec("PRAGMA foreign_keys = ON;");
    }
  }
}, 30_000);

afterAll(() => {
  database?.close();
  if (!persistenceDirectory) return;

  const resolvedDirectory = resolve(persistenceDirectory);
  if (
    !resolvedDirectory.startsWith(temporaryDirectoryPrefix) ||
    lstatSync(resolvedDirectory).isSymbolicLink()
  ) {
    throw new Error(`Refusing to remove unsafe test path: ${resolvedDirectory}`);
  }
  rmSync(resolvedDirectory, { recursive: true });
});

describe.sequential("D1 transfer schema migration", () => {
  it("creates all tables and named indexes", () => {
    const db = migratedDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all()
      .map((row) => String(row.name))
      .filter((name) => expectedTables.includes(name))
      .sort();
    const indexes = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'index'")
      .all()
      .map((row) => String(row.name))
      .filter((name) => name.startsWith("idx_transfer_"))
      .sort();

    expect(tables).toEqual([...expectedTables].sort());
    expect(indexes).toEqual([...expectedIndexes].sort());
  });

  it("enforces checks, uniqueness and foreign keys", () => {
    const db = migratedDatabase();
    db.exec(`
      INSERT INTO transfer_cases (
        id, public_id, pet_name, created_by_sub, created_at, updated_at,
        expires_at, delete_after
      ) VALUES (
        'constraints-case', 'public-constraints', 'Momo', 'admin',
        '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
        '2026-09-04T10:00:00Z', '2026-10-04T10:00:00Z'
      );
      INSERT INTO transfer_tokens (
        id, case_id, token_hmac, token_hint, created_at, expires_at
      ) VALUES (
        'constraints-token', 'constraints-case', 'unique-token-hmac', 'hint',
        '2026-08-04T10:00:00Z', '2026-09-04T10:00:00Z'
      );
    `);

    expectConstraintFailure(
      db,
      `INSERT INTO transfer_cases (
         id, public_id, pet_name, status, created_by_sub, created_at,
         updated_at, expires_at, delete_after
       ) VALUES (
         'bad-status', 'public-bad-status', 'Momo', 'pending', 'admin',
         '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
         '2026-09-04T10:00:00Z', '2026-10-04T10:00:00Z'
       );`,
    );
    expectConstraintFailure(
      db,
      `INSERT INTO transfer_cases (
         id, public_id, pet_name, allow_replies, created_by_sub, created_at,
         updated_at, expires_at, delete_after
       ) VALUES (
         'bad-boolean', 'public-bad-boolean', 'Momo', 2, 'admin',
         '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
         '2026-09-04T10:00:00Z', '2026-10-04T10:00:00Z'
       );`,
    );
    expectConstraintFailure(
      db,
      `INSERT INTO transfer_cases (
         id, public_id, pet_name, created_by_sub, created_at, updated_at,
         expires_at, delete_after
       ) VALUES (
         'bad-length', 'public-bad-length', '', 'admin',
         '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
         '2026-09-04T10:00:00Z', '2026-10-04T10:00:00Z'
       );`,
    );
    expectConstraintFailure(
      db,
      `INSERT INTO transfer_cases (
         id, public_id, pet_name, max_total_bytes, created_by_sub, created_at,
         updated_at, expires_at, delete_after
       ) VALUES (
         'bad-size', 'public-bad-size', 'Momo', 1048575, 'admin',
         '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
         '2026-09-04T10:00:00Z', '2026-10-04T10:00:00Z'
       );`,
    );
    expectConstraintFailure(
      db,
      `INSERT INTO transfer_cases (
         id, public_id, pet_name, created_by_sub, created_at, updated_at,
         expires_at, delete_after
       ) VALUES (
         'duplicate-public-id', 'public-constraints', 'Momo', 'admin',
         '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
         '2026-09-04T10:00:00Z', '2026-10-04T10:00:00Z'
       );`,
    );
    expectConstraintFailure(
      db,
      `INSERT INTO transfer_tokens (
         id, case_id, token_hmac, token_hint, created_at, expires_at
       ) VALUES (
         'duplicate-token', 'constraints-case', 'unique-token-hmac', 'hint',
         '2026-08-04T10:00:00Z', '2026-09-04T10:00:00Z'
       );`,
    );
    expectConstraintFailure(
      db,
      `INSERT INTO transfer_submissions (
         id, case_id, title, message, created_at, updated_at
       ) VALUES (
         'orphan-submission', 'missing-case', 'Valid title',
         'This message is long enough.', '2026-08-04T10:00:00Z',
         '2026-08-04T10:00:00Z'
       );`,
    );
  });

  it("cascades case deletion through every dependent record", () => {
    const db = migratedDatabase();
    db.exec(`
      INSERT INTO transfer_cases (
        id, public_id, pet_name, created_by_sub, created_at, updated_at,
        expires_at, delete_after
      ) VALUES (
        'cascade-case', 'public-cascade', 'Momo', 'admin',
        '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
        '2026-09-04T10:00:00Z', '2026-10-04T10:00:00Z'
      );
      INSERT INTO transfer_tokens (
        id, case_id, token_hmac, token_hint, created_at, expires_at
      ) VALUES (
        'cascade-token', 'cascade-case', 'cascade-token-hmac', 'hint',
        '2026-08-04T10:00:00Z', '2026-09-04T10:00:00Z'
      );
      INSERT INTO transfer_sessions (
        id, case_id, token_id, session_hmac, csrf_hmac, created_at,
        last_seen_at, expires_at, absolute_expires_at
      ) VALUES (
        'cascade-session', 'cascade-case', 'cascade-token',
        'cascade-session-hmac', 'cascade-csrf-hmac',
        '2026-08-04T10:00:00Z', '2026-08-04T10:00:00Z',
        '2026-08-04T11:00:00Z', '2026-08-04T18:00:00Z'
      );
      INSERT INTO transfer_submissions (
        id, case_id, title, message, created_at, updated_at
      ) VALUES (
        'cascade-submission', 'cascade-case', 'Valid title',
        'This message is long enough.', '2026-08-04T10:00:00Z',
        '2026-08-04T10:00:00Z'
      );
      INSERT INTO transfer_files (
        id, case_id, submission_id, r2_key, original_name,
        declared_media_type, expected_size, created_at, delete_after
      ) VALUES (
        'cascade-file', 'cascade-case', 'cascade-submission',
        'cascade/file.pdf', 'file.pdf', 'application/pdf', 1024,
        '2026-08-04T10:00:00Z', '2026-10-04T10:00:00Z'
      );
      INSERT INTO transfer_links (id, submission_id, url, created_at)
      VALUES (
        'cascade-link', 'cascade-submission', 'https://example.test/file',
        '2026-08-04T10:00:00Z'
      );
      INSERT INTO transfer_replies (
        id, case_id, submission_id, body, created_by_sub, created_at
      ) VALUES (
        'cascade-reply', 'cascade-case', 'cascade-submission', 'Reply',
        'admin', '2026-08-04T10:00:00Z'
      );
      INSERT INTO transfer_notifications (
        id, case_id, submission_id, reply_id, kind, created_at, updated_at
      ) VALUES (
        'cascade-notification', 'cascade-case', 'cascade-submission',
        'cascade-reply', 'customer_reply', '2026-08-04T10:00:00Z',
        '2026-08-04T10:00:00Z'
      );
      INSERT INTO transfer_audit_events (
        id, case_id, event_type, actor_type, created_at
      ) VALUES (
        'cascade-audit', 'cascade-case', 'created', 'system',
        '2026-08-04T10:00:00Z'
      );
      DELETE FROM transfer_cases WHERE id = 'cascade-case';
    `);

    for (const table of [
      "transfer_cases",
      "transfer_tokens",
      "transfer_sessions",
      "transfer_submissions",
      "transfer_files",
      "transfer_links",
      "transfer_replies",
      "transfer_notifications",
    ]) {
      const row = db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id LIKE 'cascade-%'`)
        .get();
      expect(Number(row?.count), table).toBe(0);
    }

    expect(
      db
        .prepare(
          "SELECT case_id FROM transfer_audit_events WHERE id = 'cascade-audit'",
        )
        .get(),
    ).toEqual({ case_id: null });
  });

  it("is idempotent when Wrangler applies migrations twice", () => {
    const db = migratedDatabase();
    const before = schemaRows(db);
    db.close();
    database = undefined;

    const secondMigration = runWrangler([
      "d1",
      "migrations",
      "apply",
      "TRANSFER_DB",
      "--local",
      "--env",
      "development",
      "--persist-to",
      persistenceDirectory,
    ]);

    expect(secondMigration.status, migrationOutput(secondMigration)).toBe(0);
    expect(migrationOutput(secondMigration)).toMatch(/No migrations to apply/i);

    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON;");
    expect(schemaRows(database)).toEqual(before);
  });
});
