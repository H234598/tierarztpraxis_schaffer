import type { DevelopmentRouteContext } from "../env";
import { json } from "../http/response";
import type { VerifiedAdminIdentity } from "../security/access-jwt";
import { transferError } from "./routes-public";
import {
  generateTransferToken,
  generateTransferTokenForPublicCaseId,
} from "./tokens";

const MEBIBYTE = 1_024 * 1_024;
const MAXIMUM_BODY_BYTES = 16 * 1_024;
const PAGE_SIZE = 20;
const allowedCaseKeys = new Set([
  "petName", "ownerDisplayName", "internalReference", "internalNote",
  "expiresInDays", "maxSubmissions", "maxTotalBytes", "allowReplies",
  "allowCallback",
]);
const statuses = new Set(["open", "closed", "expired", "deleted"]);
const idPattern = /^[A-Za-z0-9-]{1,64}$/u;

export interface AdminCaseInput {
  readonly petName: string;
  readonly ownerDisplayName: string | null;
  readonly internalReference: string | null;
  readonly internalNote: string | null;
  readonly expiresInDays: number;
  readonly maxSubmissions: number;
  readonly maxTotalBytes: number;
  readonly allowReplies: boolean;
  readonly allowCallback: boolean;
}

class AdminInputError extends Error {
  constructor(readonly field: string) {
    super(field);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new AdminInputError(field);
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximum) throw new AdminInputError(field);
  return normalized;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new AdminInputError(field);
  }
  return Number(value);
}

function optionalBoolean(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new AdminInputError(field);
  return value;
}

export function validateAdminCaseInput(value: unknown): AdminCaseInput {
  if (!isRecord(value)) throw new AdminInputError("body");
  if (Object.keys(value).some((key) => !allowedCaseKeys.has(key))) {
    throw new AdminInputError("body");
  }
  if (typeof value.petName !== "string") throw new AdminInputError("petName");
  const petName = value.petName.trim();
  if (petName.length < 1 || petName.length > 120) throw new AdminInputError("petName");
  return {
    petName,
    ownerDisplayName: optionalString(value.ownerDisplayName, "ownerDisplayName", 160),
    internalReference: optionalString(value.internalReference, "internalReference", 160),
    internalNote: optionalString(value.internalNote, "internalNote", 4_000),
    expiresInDays: boundedInteger(value.expiresInDays, 14, 1, 30, "expiresInDays"),
    maxSubmissions: boundedInteger(value.maxSubmissions, 3, 1, 5, "maxSubmissions"),
    maxTotalBytes: boundedInteger(value.maxTotalBytes, 100 * MEBIBYTE, MEBIBYTE, 250 * MEBIBYTE, "maxTotalBytes"),
    allowReplies: optionalBoolean(value.allowReplies, true, "allowReplies"),
    allowCallback: optionalBoolean(value.allowCallback, true, "allowCallback"),
  };
}

async function readJson(context: DevelopmentRouteContext): Promise<unknown> {
  if (context.request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new AdminInputError("contentType");
  }
  const declaredLength = Number(context.request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_BODY_BYTES) {
    throw new AdminInputError("body");
  }
  const text = await context.request.text();
  if (new TextEncoder().encode(text).byteLength > MAXIMUM_BODY_BYTES) {
    throw new AdminInputError("body");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AdminInputError("body");
  }
}

function isoAfter(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function auditDetails(admin: VerifiedAdminIdentity): string {
  return JSON.stringify({ actorEmail: admin.email });
}

function auditStatement(
  database: D1Database,
  caseId: string,
  eventType: string,
  admin: VerifiedAdminIdentity,
  now: string,
): D1PreparedStatement {
  return database.prepare(
    `INSERT INTO transfer_audit_events
      (id, case_id, event_type, actor_type, actor_reference, details_json, created_at)
    VALUES (?, ?, ?, 'admin', ?, ?, ?)`,
  ).bind(crypto.randomUUID(), caseId, eventType, admin.subject, auditDetails(admin), now);
}

function adminCaseSummary(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    publicId: row.public_id,
    petName: row.pet_name,
    ownerDisplayName: row.owner_display_name,
    internalReference: row.internal_reference,
    status: row.status,
    submissionCount: row.submission_count,
    totalBytes: row.total_bytes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    exportedAt: row.exported_at,
  };
}

function adminCaseDetail(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...adminCaseSummary(row),
    publicReference: row.public_reference,
    internalNote: row.internal_note,
    callbackNote: row.callback_note,
    allowReplies: row.allow_replies === 1,
    allowCallback: row.allow_callback === 1,
    maxSubmissions: row.max_submissions,
    maxTotalBytes: row.max_total_bytes,
    createdByEmail: row.created_by_email,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

function mapSubmission(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id, title: row.title, message: row.message,
    observedSince: row.observed_since, urgency: row.urgency,
    callbackRequested: row.callback_requested === 1,
    callbackPhone: row.callback_phone, notificationEmail: row.notification_email,
    status: row.status, createdAt: row.created_at, finalizedAt: row.finalized_at,
    updatedAt: row.updated_at,
  };
}

function mapFile(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id, submissionId: row.submission_id, originalName: row.original_name,
    declaredMediaType: row.declared_media_type, verifiedMediaType: row.verified_media_type,
    expectedSize: row.expected_size, storedSize: row.stored_size,
    state: row.state, inlineSafe: row.inline_safe === 1,
    createdAt: row.created_at, uploadedAt: row.uploaded_at,
  };
}

function mapLink(row: Record<string, unknown>): Record<string, unknown> {
  return { id: row.id, submissionId: row.submission_id, url: row.url, label: row.label, createdAt: row.created_at };
}

function mapReply(row: Record<string, unknown>): Record<string, unknown> {
  return { id: row.id, submissionId: row.submission_id, body: row.body, createdByEmail: row.created_by_email, createdAt: row.created_at };
}

function mapToken(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id, hint: row.token_hint, version: row.token_version,
    createdAt: row.created_at, expiresAt: row.expires_at,
    revokedAt: row.revoked_at, lastUsedAt: row.last_used_at, useCount: row.use_count,
  };
}

function mapAudit(row: Record<string, unknown>): Record<string, unknown> {
  return { id: row.id, eventType: row.event_type, actorType: row.actor_type, actorReference: row.actor_reference, details: row.details_json, createdAt: row.created_at };
}

async function createCase(context: DevelopmentRouteContext, admin: VerifiedAdminIdentity): Promise<Response> {
  const input = validateAdminCaseInput(await readJson(context));
  const generated = await generateTransferToken(context.env.TOKEN_PEPPER);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = isoAfter(nowDate, input.expiresInDays);
  const deleteAfter = isoAfter(nowDate, input.expiresInDays + 30);
  const caseId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const database = context.env.TRANSFER_DB;
  await database.batch([
    database.prepare(
      `INSERT INTO transfer_cases
        (id, public_id, pet_name, owner_display_name, internal_reference,
         internal_note, status, allow_replies, allow_callback, max_submissions,
         max_total_bytes, created_by_sub, created_by_email, created_at,
         updated_at, expires_at, delete_after)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      caseId, generated.storage.publicCaseId, input.petName,
      input.ownerDisplayName, input.internalReference, input.internalNote,
      input.allowReplies ? 1 : 0, input.allowCallback ? 1 : 0,
      input.maxSubmissions, input.maxTotalBytes, admin.subject, admin.email,
      now, now, expiresAt, deleteAfter,
    ),
    database.prepare(
      `INSERT INTO transfer_tokens
        (id, case_id, token_version, token_hmac, token_hint, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(tokenId, caseId, generated.storage.version, generated.storage.tokenHmac, generated.storage.tokenHint, now, expiresAt),
    auditStatement(database, caseId, "case_created", admin, now),
  ]);
  return json({
    ok: true,
    case: {
      id: caseId, publicId: generated.storage.publicCaseId,
      petName: input.petName, ownerDisplayName: input.ownerDisplayName,
      internalReference: input.internalReference, internalNote: input.internalNote,
      status: "open", allowReplies: input.allowReplies,
      allowCallback: input.allowCallback, maxSubmissions: input.maxSubmissions,
      maxTotalBytes: input.maxTotalBytes, createdAt: now, expiresAt,
      exportedAt: null, closedAt: null,
    },
    token: generated.token,
    shareUrl: `/datentransfer/#token=${generated.token}`,
  }, 201);
}

function listWhere(url: URL): { clause: string; values: unknown[]; page: number } {
  const status = url.searchParams.get("status")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const pageValue = Number(url.searchParams.get("page") ?? "1");
  if ((status && !statuses.has(status)) || q.length > 160 || !Number.isSafeInteger(pageValue) || pageValue < 1 || pageValue > 10_000) {
    throw new AdminInputError("query");
  }
  const predicates: string[] = [];
  const values: unknown[] = [];
  if (status) { predicates.push("status = ?"); values.push(status); }
  if (q) {
    predicates.push("(pet_name LIKE ? ESCAPE '\\' OR public_id LIKE ? ESCAPE '\\' OR owner_display_name LIKE ? ESCAPE '\\' OR internal_reference LIKE ? ESCAPE '\\')");
    const pattern = `%${q.replace(/[\\%_]/gu, "\\$&")}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  return { clause: predicates.length ? `WHERE ${predicates.join(" AND ")}` : "", values, page: pageValue };
}

async function listCases(context: DevelopmentRouteContext): Promise<Response> {
  const { clause, values, page } = listWhere(context.url);
  const database = context.env.TRANSFER_DB;
  const count = await database.prepare(`SELECT COUNT(*) AS total FROM transfer_cases ${clause}`).bind(...values).first<{ total: number }>();
  const rows = await database.prepare(
    `SELECT id, public_id, pet_name, owner_display_name, internal_reference,
      status, submission_count, total_bytes, created_at, expires_at, exported_at
     FROM transfer_cases ${clause}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
  ).bind(...values, PAGE_SIZE, (page - 1) * PAGE_SIZE).all<Record<string, unknown>>();
  return json({ ok: true, cases: rows.results.map(adminCaseSummary), page, pageSize: PAGE_SIZE, total: count?.total ?? 0 });
}

async function caseDetail(context: DevelopmentRouteContext, caseId: string): Promise<Response> {
  const database = context.env.TRANSFER_DB;
  const row = await database.prepare(
    `SELECT id, public_id, pet_name, owner_display_name, internal_reference,
      public_reference, internal_note, callback_note, status, allow_replies,
      allow_callback, max_submissions, max_total_bytes, submission_count,
      total_bytes, created_by_email, created_at, updated_at, expires_at,
      exported_at, closed_at FROM transfer_cases WHERE id = ? LIMIT 1`,
  ).bind(caseId).first<Record<string, unknown>>();
  if (!row) return transferError(context.requestId, 404, "not_found", "Not found");
  const [submissions, files, links, replies, tokens, audit] = await Promise.all([
    database.prepare(`SELECT id, title, message, observed_since, urgency, callback_requested, callback_phone, notification_email, status, created_at, finalized_at, updated_at FROM transfer_submissions WHERE case_id = ? ORDER BY created_at ASC`).bind(caseId).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, submission_id, original_name, declared_media_type, verified_media_type, expected_size, stored_size, state, inline_safe, created_at, uploaded_at FROM transfer_files WHERE case_id = ? ORDER BY created_at ASC`).bind(caseId).all<Record<string, unknown>>(),
    database.prepare(`SELECT l.id, l.submission_id, l.url, l.label, l.created_at FROM transfer_links AS l INNER JOIN transfer_submissions AS s ON s.id = l.submission_id WHERE s.case_id = ? ORDER BY l.created_at ASC`).bind(caseId).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, submission_id, body, created_by_email, created_at FROM transfer_replies WHERE case_id = ? ORDER BY created_at ASC`).bind(caseId).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, token_version, token_hint, created_at, expires_at, revoked_at, last_used_at, use_count FROM transfer_tokens WHERE case_id = ? ORDER BY created_at DESC`).bind(caseId).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, event_type, actor_type, actor_reference, details_json, created_at FROM transfer_audit_events WHERE case_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`).bind(caseId).all<Record<string, unknown>>(),
  ]);
  return json({
    ok: true, case: adminCaseDetail(row),
    submissions: submissions.results.map(mapSubmission),
    files: files.results.map(mapFile), links: links.results.map(mapLink),
    replies: replies.results.map(mapReply), tokens: tokens.results.map(mapToken),
    audit: audit.results.map(mapAudit),
  });
}

function validateExactBody(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new AdminInputError("body");
  return value;
}

async function createToken(context: DevelopmentRouteContext, admin: VerifiedAdminIdentity, caseId: string): Promise<Response> {
  const body = validateExactBody(await readJson(context), ["revokeExisting", "expiresInDays"]);
  const revokeExisting = optionalBoolean(body.revokeExisting, false, "revokeExisting");
  const expiresInDays = boundedInteger(body.expiresInDays, 14, 1, 30, "expiresInDays");
  const database = context.env.TRANSFER_DB;
  const transferCase = await database.prepare("SELECT id, public_id, status, expires_at FROM transfer_cases WHERE id = ? LIMIT 1").bind(caseId).first<{ id: string; public_id: string; status: string; expires_at: string }>();
  if (!transferCase) return transferError(context.requestId, 404, "not_found", "Not found");
  if (transferCase.status !== "open" || Date.parse(transferCase.expires_at) <= Date.now()) return transferError(context.requestId, 409, "invalid_state", "Invalid state");
  const generated = await generateTransferTokenForPublicCaseId(transferCase.public_id, context.env.TOKEN_PEPPER);
  const tokenId = crypto.randomUUID();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = new Date(Math.min(Date.parse(transferCase.expires_at), Date.parse(isoAfter(nowDate, expiresInDays)))).toISOString();
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO transfer_tokens (id, case_id, token_version, token_hmac, token_hint, created_at, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM transfer_cases
        WHERE id = ? AND status = 'open' AND expires_at > ?
      )`).bind(
      tokenId, caseId, generated.storage.version, generated.storage.tokenHmac, generated.storage.tokenHint, now, expiresAt,
      caseId, now,
    ),
    database.prepare(`INSERT INTO transfer_audit_events
      (id, case_id, event_type, actor_type, actor_reference, details_json, created_at)
      SELECT ?, case_id, ?, 'admin', ?, ?, ?
      FROM transfer_cases
      WHERE id = ? AND status = 'open' AND expires_at > ? AND EXISTS (
        SELECT 1 FROM transfer_tokens WHERE id = ? AND case_id = ?
      )`).bind(
      crypto.randomUUID(),
      revokeExisting ? "token_rotated" : "token_created",
      admin.subject,
      auditDetails(admin),
      now,
      caseId,
      now,
      tokenId,
      caseId,
    ),
  ];
  if (revokeExisting) {
    statements.push(
      database.prepare(`UPDATE transfer_tokens SET revoked_at = ? WHERE case_id = ? AND id <> ? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM transfer_tokens WHERE id = ? AND case_id = ?)`).bind(now, caseId, tokenId, tokenId, caseId),
      database.prepare(`UPDATE transfer_sessions SET revoked_at = ? WHERE case_id = ? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM transfer_tokens WHERE id = ? AND case_id = ?)`).bind(now, caseId, tokenId, caseId),
    );
  }
  const results = await database.batch(statements);
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    return transferError(context.requestId, 409, "invalid_state", "Invalid state");
  }
  return json({ ok: true, tokenId, token: generated.token, shareUrl: `/datentransfer/#token=${generated.token}`, expiresAt }, 201);
}

async function revokeToken(context: DevelopmentRouteContext, admin: VerifiedAdminIdentity, tokenId: string): Promise<Response> {
  validateExactBody(await readJson(context), []);
  const database = context.env.TRANSFER_DB;
  const now = new Date().toISOString();
  await database.batch([
    database.prepare("UPDATE transfer_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, tokenId),
    database.prepare("UPDATE transfer_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_id = ?").bind(now, tokenId),
    database.prepare(`INSERT INTO transfer_audit_events (id, case_id, event_type, actor_type, actor_reference, details_json, created_at) SELECT ?, case_id, 'token_revoked', 'admin', ?, ?, ? FROM transfer_tokens WHERE id = ? AND revoked_at = ?`).bind(crypto.randomUUID(), admin.subject, auditDetails(admin), now, tokenId, now),
  ]);
  return json({ ok: true });
}

async function updateStatus(context: DevelopmentRouteContext, admin: VerifiedAdminIdentity, caseId: string): Promise<Response> {
  const body = validateExactBody(await readJson(context), ["status"]);
  if (body.status !== "open" && body.status !== "closed") throw new AdminInputError("status");
  const database = context.env.TRANSFER_DB;
  const current = await database.prepare("SELECT status FROM transfer_cases WHERE id = ? LIMIT 1").bind(caseId).first<{ status: string }>();
  if (!current) return transferError(context.requestId, 404, "not_found", "Not found");
  const from = body.status === "closed" ? "open" : "closed";
  if (current.status !== from) return transferError(context.requestId, 409, "invalid_state", "Invalid state");
  const now = new Date().toISOString();
  const results = await database.batch([
    database.prepare(`UPDATE transfer_cases SET status = ?, updated_at = ?, closed_at = ? WHERE id = ? AND status = '${from}'`).bind(body.status, now, body.status === "closed" ? now : null, caseId),
    database.prepare(`INSERT INTO transfer_audit_events
      (id, case_id, event_type, actor_type, actor_reference, details_json, created_at)
      SELECT ?, id, ?, 'admin', ?, ?, ? FROM transfer_cases
      WHERE id = ? AND status = ? AND updated_at = ?`).bind(
        crypto.randomUUID(), body.status === "closed" ? "case_closed" : "case_reopened",
        admin.subject, auditDetails(admin), now, caseId, body.status, now,
      ),
  ]);
  if ((results[0]?.meta.changes ?? 0) !== 1) return transferError(context.requestId, 409, "invalid_state", "Invalid state");
  return json({ ok: true, status: body.status });
}

async function markExported(context: DevelopmentRouteContext, admin: VerifiedAdminIdentity, caseId: string): Promise<Response> {
  validateExactBody(await readJson(context), []);
  const database = context.env.TRANSFER_DB;
  const current = await database.prepare("SELECT exported_at FROM transfer_cases WHERE id = ? LIMIT 1").bind(caseId).first<{ exported_at: string | null }>();
  if (!current) return transferError(context.requestId, 404, "not_found", "Not found");
  if (current.exported_at) return json({ ok: true, exportedAt: current.exported_at });
  const now = new Date().toISOString();
  const results = await database.batch([
    database.prepare("UPDATE transfer_cases SET exported_at = ?, updated_at = ? WHERE id = ? AND exported_at IS NULL").bind(now, now, caseId),
    database.prepare(`INSERT INTO transfer_audit_events
      (id, case_id, event_type, actor_type, actor_reference, details_json, created_at)
      SELECT ?, id, 'case_exported', 'admin', ?, ?, ? FROM transfer_cases
      WHERE id = ? AND exported_at IS NULL`).bind(crypto.randomUUID(), admin.subject, auditDetails(admin), now, caseId),
  ]);
  if ((results[0]?.meta.changes ?? 0) !== 1) return transferError(context.requestId, 409, "invalid_state", "Invalid state");
  return json({ ok: true, exportedAt: now });
}

export async function handleAdminCaseApi(context: DevelopmentRouteContext, admin: VerifiedAdminIdentity): Promise<Response | null> {
  const { pathname } = context.url;
  try {
    if (pathname === "/api/admin/cases" && context.request.method === "POST") return await createCase(context, admin);
    if (pathname === "/api/admin/cases" && context.request.method === "GET") return await listCases(context);
    const tokenRevoke = pathname.match(/^\/api\/admin\/tokens\/([^/]+)\/revoke$/u)?.[1];
    if (tokenRevoke && idPattern.test(tokenRevoke) && context.request.method === "POST") return await revokeToken(context, admin, tokenRevoke);
    const caseAction = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/(tokens|status|mark-exported)$/u);
    if (caseAction?.[1] && idPattern.test(caseAction[1])) {
      if (caseAction[2] === "tokens" && context.request.method === "POST") return await createToken(context, admin, caseAction[1]);
      if (caseAction[2] === "status" && context.request.method === "PATCH") return await updateStatus(context, admin, caseAction[1]);
      if (caseAction[2] === "mark-exported" && context.request.method === "POST") return await markExported(context, admin, caseAction[1]);
    }
    const detailId = pathname.match(/^\/api\/admin\/cases\/([^/]+)$/u)?.[1];
    if (detailId && idPattern.test(detailId) && context.request.method === "GET") return await caseDetail(context, detailId);
    return null;
  } catch (error) {
    if (error instanceof AdminInputError) {
      return transferError(context.requestId, error.field === "contentType" ? 415 : 400, "invalid_request", "Invalid request", [error.field]);
    }
    return transferError(context.requestId, 503, "service_unavailable", "Service unavailable");
  }
}
