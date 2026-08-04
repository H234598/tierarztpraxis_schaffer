export const CSRF_STORAGE_KEY = "tierarztpraxis:datentransfer:csrf";
const MEBIBYTE = 1024 * 1024;
const MAXIMUM_FILES = 8;
const maximumBytesByMediaType = new Map<string, number>([
  ["image/jpeg", 12 * MEBIBYTE],
  ["image/png", 12 * MEBIBYTE],
  ["image/webp", 12 * MEBIBYTE],
  ["image/heic", 12 * MEBIBYTE],
  ["image/heif", 12 * MEBIBYTE],
  ["video/mp4", 50 * MEBIBYTE],
  ["video/quicktime", 50 * MEBIBYTE],
  ["video/webm", 50 * MEBIBYTE],
]);

export interface TransferFileDescriptor {
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
}

export interface TransferSubmissionPayload {
  readonly title: string;
  readonly message: string;
  readonly observedSince?: string;
  readonly urgency: "normal" | "callback_requested";
  readonly callbackRequested: boolean;
  readonly callbackPhone?: string;
  readonly notificationEmail?: string;
  readonly links: readonly { readonly url: string }[];
  readonly files: readonly TransferFileDescriptor[];
  readonly notEmergencyConfirmed: true;
}

export interface TransferUploadSlot {
  readonly fileId: string;
  readonly uploadUrl: string;
}

export interface TransferUploadFailure {
  readonly index: number;
  readonly retryable: boolean;
  readonly status?: number;
  readonly requestId?: string;
}

export class TransferUploadError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(`Dateiübertragung fehlgeschlagen.${requestSuffix(requestId)}`);
    this.name = "TransferUploadError";
  }
}

export class TransferRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "TransferRequestError";
  }
}

export class TransferProtocolError extends Error {
  constructor() {
    super("Die Serverantwort konnte nicht verarbeitet werden.");
    this.name = "TransferProtocolError";
  }
}

interface TransferRequestOptions {
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
  readonly csrfToken?: string;
  readonly storage?: Storage;
  readonly fetchImpl?: typeof fetch;
}

interface TransferLocation {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

interface TransferHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export function consumeFragmentToken(
  location: TransferLocation,
  history: TransferHistory,
): string {
  const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  if (location.hash) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  return token;
}

export function storeCsrfToken(storage: Storage, token: string): void {
  storage.setItem(CSRF_STORAGE_KEY, token);
}

export function clearTransferSession(storage: Storage): void {
  storage.removeItem(CSRF_STORAGE_KEY);
}

export function readCsrfToken(storage: Storage): string {
  return storage.getItem(CSRF_STORAGE_KEY) ?? "";
}

function requestSuffix(requestId?: string): string {
  return requestId ? ` Vorgangskennung: ${requestId}` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function requestTransferJson<T = Record<string, unknown>>(
  path: string,
  options: TransferRequestOptions = {},
): Promise<T> {
  if (!path.startsWith("/api/transfers/")) {
    throw new TypeError("Datentransfer-API-Pfad muss same-origin sein.");
  }
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.csrfToken) {
    headers["X-Datentransfer-CSRF"] = options.csrfToken;
  }
  const response = await (options.fetchImpl ?? fetch)(path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const result: unknown = await response.json().catch(() => null);
  const error = isRecord(result) && isRecord(result.error) ? result.error : null;
  const requestId = typeof error?.requestId === "string"
    ? error.requestId
    : undefined;
  if (!response.ok || !isRecord(result) || result.ok !== true) {
    if (response.status === 401 && options.storage) {
      clearTransferSession(options.storage);
    }
    const message =
      response.status === 401
        ? `Die Sitzung ist abgelaufen.${requestSuffix(requestId)}`
        : `Die Anfrage konnte nicht verarbeitet werden.${requestSuffix(requestId)}`;
    throw new TransferRequestError(message, response.status, requestId);
  }
  return result as T;
}

export async function logoutTransferSession(
  storage: Storage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const csrfToken = readCsrfToken(storage);
  try {
    await requestTransferJson("/api/transfers/session/logout", {
      method: "POST",
      body: {},
      csrfToken,
      storage,
      fetchImpl,
    });
  } finally {
    clearTransferSession(storage);
  }
}

export function parseHttpsLinks(value: string): readonly { readonly url: string }[] {
  const links = value
    .split(/\r?\n/u)
    .map((url) => url.trim())
    .filter(Boolean);
  if (links.length > 8) {
    throw new TypeError("Es sind höchstens acht Links erlaubt.");
  }

  return links.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new TypeError("Links müssen gültige HTTPS-Adressen sein.");
    }
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      value.length > 2_048
    ) {
      throw new TypeError("Links müssen gültige HTTPS-Adressen sein.");
    }
    return { url: value };
  });
}

export function validateTransferFiles(
  files: readonly File[],
  remainingBytes: number,
): readonly TransferFileDescriptor[] {
  if (files.length > MAXIMUM_FILES) {
    throw new TypeError("Es sind höchstens acht Dateien erlaubt.");
  }

  let totalBytes = 0;
  const descriptors = files.map((file) => {
    const maximumBytes = maximumBytesByMediaType.get(file.type);
    if (maximumBytes === undefined) {
      throw new TypeError(`Dateityp von ${file.name} ist nicht erlaubt.`);
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0) {
      throw new TypeError(`Dateigröße von ${file.name} ist ungültig.`);
    }
    if (file.size > maximumBytes) {
      const maximumMiB = maximumBytes / MEBIBYTE;
      throw new TypeError(`${file.name} überschreitet ${maximumMiB} MiB.`);
    }
    totalBytes += file.size;
    return { name: file.name, mediaType: file.type, size: file.size };
  });

  if (!Number.isSafeInteger(totalBytes) || totalBytes > remainingBytes) {
    throw new TypeError("Dateien überschreiten das Restkontingent des Falls.");
  }
  return descriptors;
}

export function buildSubmissionPayload(
  data: FormData,
  files: readonly File[],
  remainingBytes: number,
  allowCallback: boolean,
): TransferSubmissionPayload {
  const title = String(data.get("title") ?? "").trim();
  const message = String(data.get("message") ?? "").trim();
  const observedSince = String(data.get("observedSince") ?? "").trim();
  const urgency = String(data.get("urgency") ?? "");
  const callbackPhone = String(data.get("callbackPhone") ?? "").trim();
  const notificationEmail = String(
    data.get("notificationEmail") ?? "",
  ).trim();

  if (title.length < 3 || title.length > 120) {
    throw new TypeError("Überschrift muss 3 bis 120 Zeichen lang sein.");
  }
  if (message.length < 20 || message.length > 8_000) {
    throw new TypeError("Bericht muss 20 bis 8.000 Zeichen lang sein.");
  }
  if (observedSince.length > 200) {
    throw new TypeError("Angabe seit wann ist zu lang.");
  }
  if (urgency !== "normal" && urgency !== "callback_requested") {
    throw new TypeError("Bitte wählen Sie eine Dringlichkeit.");
  }
  const callbackRequested = urgency === "callback_requested";
  if (callbackRequested && !allowCallback) {
    throw new TypeError("Ein Rückruf ist für diesen Fall nicht freigegeben.");
  }
  if (callbackRequested && !callbackPhone) {
    throw new TypeError("Bitte geben Sie eine Telefonnummer für den Rückruf an.");
  }
  if (callbackPhone.length > 40) {
    throw new TypeError("Telefonnummer ist zu lang.");
  }
  if (
    notificationEmail &&
    (notificationEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(notificationEmail))
  ) {
    throw new TypeError("Benachrichtigungs-E-Mail ist ungültig.");
  }
  if (data.get("privacyAccepted") !== "true") {
    throw new TypeError("Bitte bestätigen Sie den Datenschutzhinweis.");
  }
  if (data.get("notEmergencyConfirmed") !== "true") {
    throw new TypeError("Bitte bestätigen Sie ausdrücklich: Kein Notfall.");
  }

  return {
    title,
    message,
    ...(observedSince ? { observedSince } : {}),
    urgency,
    callbackRequested,
    ...(callbackRequested ? { callbackPhone } : {}),
    ...(notificationEmail ? { notificationEmail } : {}),
    links: parseHttpsLinks(String(data.get("links") ?? "")),
    files: validateTransferFiles(files, remainingBytes),
    notEmergencyConfirmed: true,
  };
}

export function uploadTransferFile(
  file: File,
  slot: TransferUploadSlot,
  csrfToken: string,
  onProgress: (percent: number) => void,
  createXhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = createXhr();
    xhr.open("PUT", slot.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-Datentransfer-CSRF", csrfToken);
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      let result: unknown = null;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        // Ungültige Antwort bleibt ein generischer Transportfehler.
      }
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        isRecord(result) &&
        result.ok === true
      ) {
        onProgress(100);
        resolve();
        return;
      }
      const error = isRecord(result) && isRecord(result.error)
        ? result.error
        : null;
      const requestId = typeof error?.requestId === "string"
        ? error.requestId
        : undefined;
      reject(
        new TransferUploadError(xhr.status >= 500, xhr.status, requestId),
      );
    });
    const rejectTransport = () => reject(new TransferUploadError(true));
    xhr.addEventListener("error", rejectTransport);
    xhr.addEventListener("timeout", rejectTransport);
    xhr.addEventListener("abort", rejectTransport);
    xhr.send(file);
  });
}

export async function uploadPendingFiles(
  files: readonly File[],
  slots: readonly TransferUploadSlot[],
  completed: Set<number>,
  upload: (
    file: File,
    slot: TransferUploadSlot,
    index: number,
  ) => Promise<void>,
): Promise<readonly TransferUploadFailure[]> {
  const failures: TransferUploadFailure[] = [];
  for (const [index, file] of files.entries()) {
    if (completed.has(index)) continue;
    const slot = slots[index];
    if (!slot) {
      failures.push({ index, retryable: false });
      continue;
    }
    try {
      await upload(file, slot, index);
      completed.add(index);
    } catch (error) {
      failures.push({
        index,
        retryable:
          error instanceof TransferUploadError && error.retryable,
        ...(error instanceof TransferUploadError && error.status !== undefined
          ? { status: error.status }
          : {}),
        ...(error instanceof TransferUploadError && error.requestId
          ? { requestId: error.requestId }
          : {}),
      });
    }
  }
  return failures;
}

export async function finalizeWhenAllUploaded(
  total: number,
  completed: ReadonlySet<number>,
  finalize: () => Promise<void>,
): Promise<boolean> {
  if (completed.size !== total) return false;
  await finalize();
  return true;
}

interface PublicTransferCase {
  readonly publicId: string;
  readonly petName: string;
  readonly publicReference: string | null;
  readonly expiresAt: string;
  readonly remainingSubmissions: number;
  readonly remainingBytes: number;
  readonly allowReplies: boolean;
  readonly allowCallback: boolean;
}

interface PublicSubmission {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly observedSince: string | null;
  readonly urgency: string;
  readonly callbackRequested: boolean;
  readonly status: string;
  readonly createdAt: string;
  readonly finalizedAt: string | null;
}

interface PublicLink {
  readonly submissionId: string;
  readonly url: string;
  readonly label: string | null;
}

interface PublicFile {
  readonly id: string;
  readonly submissionId: string;
  readonly originalName: string;
  readonly expectedSize: number;
  readonly storedSize: number | null;
  readonly state: string;
}

interface PublicReply {
  readonly submissionId: string | null;
  readonly body: string;
  readonly createdAt: string;
}

interface TransferCaseSnapshot {
  readonly case: PublicTransferCase;
  readonly submissions: readonly PublicSubmission[];
  readonly links: readonly PublicLink[];
  readonly files: readonly PublicFile[];
  readonly replies: readonly PublicReply[];
}

interface TransferSessionResponse {
  readonly case: PublicTransferCase;
  readonly csrfToken: string;
}

interface TransferDraftResponse {
  readonly submissionId: string;
  readonly uploads: readonly TransferUploadSlot[];
}

interface UploadRow {
  readonly progress: HTMLProgressElement;
  readonly status: HTMLElement;
  readonly retry: HTMLButtonElement;
}

interface ActiveDraft {
  readonly submissionId: string;
  readonly files: readonly File[];
  readonly slots: readonly TransferUploadSlot[];
  readonly completed: Set<number>;
  phase: "uploading" | "finalizing" | "finalize_failed" | "finalized";
  retryInFlight: boolean;
}

type TransferUiState =
  | "entry"
  | "loading"
  | "ready"
  | "submitting"
  | "recovering"
  | "finalize_retry"
  | "expired";

function isPublicTransferCase(value: unknown): value is PublicTransferCase {
  return (
    isRecord(value) &&
    typeof value.publicId === "string" &&
    typeof value.petName === "string" &&
    (value.publicReference === null || typeof value.publicReference === "string") &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    Number.isSafeInteger(value.remainingSubmissions) &&
    Number(value.remainingSubmissions) >= 0 &&
    Number.isSafeInteger(value.remainingBytes) &&
    Number(value.remainingBytes) >= 0 &&
    typeof value.allowReplies === "boolean" &&
    typeof value.allowCallback === "boolean"
  );
}

function isPublicSubmission(value: unknown): value is PublicSubmission {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    (value.observedSince === null || typeof value.observedSince === "string") &&
    typeof value.urgency === "string" &&
    typeof value.callbackRequested === "boolean" &&
    typeof value.status === "string" &&
    typeof value.createdAt === "string" &&
    (value.finalizedAt === null || typeof value.finalizedAt === "string")
  );
}

function isPublicLink(value: unknown): value is PublicLink {
  return (
    isRecord(value) &&
    typeof value.submissionId === "string" &&
    typeof value.url === "string" &&
    (value.label === null || typeof value.label === "string")
  );
}

function isPublicFile(value: unknown): value is PublicFile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.submissionId === "string" &&
    typeof value.originalName === "string" &&
    Number.isSafeInteger(value.expectedSize) &&
    (value.storedSize === null || Number.isSafeInteger(value.storedSize)) &&
    typeof value.state === "string"
  );
}

function isPublicReply(value: unknown): value is PublicReply {
  return (
    isRecord(value) &&
    (value.submissionId === null || typeof value.submissionId === "string") &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string"
  );
}

export function parseTransferSessionResponse(
  value: unknown,
): TransferSessionResponse {
  if (
    !isRecord(value) ||
    value.ok !== true ||
    !isPublicTransferCase(value.case) ||
    typeof value.csrfToken !== "string" ||
    value.csrfToken.length === 0
  ) {
    throw new TransferProtocolError();
  }
  return value as unknown as TransferSessionResponse;
}

export function parseTransferDraftResponse(value: unknown): TransferDraftResponse {
  if (
    !isRecord(value) ||
    value.ok !== true ||
    typeof value.submissionId !== "string" ||
    value.submissionId.length === 0 ||
    !Array.isArray(value.uploads) ||
    !value.uploads.every(
      (slot) =>
        isRecord(slot) &&
        typeof slot.fileId === "string" &&
        slot.fileId.length > 0 &&
        typeof slot.uploadUrl === "string" &&
        /^\/api\/transfers\/uploads\/[^/?#]+$/u.test(slot.uploadUrl),
    )
  ) {
    throw new TransferProtocolError();
  }
  return value as unknown as TransferDraftResponse;
}

export function parseTransferCaseSnapshot(value: unknown): TransferCaseSnapshot {
  if (
    !isRecord(value) ||
    value.ok !== true ||
    !isPublicTransferCase(value.case) ||
    !Array.isArray(value.submissions) ||
    !value.submissions.every(isPublicSubmission) ||
    !Array.isArray(value.links) ||
    !value.links.every(isPublicLink) ||
    !Array.isArray(value.files) ||
    !value.files.every(isPublicFile) ||
    !Array.isArray(value.replies) ||
    !value.replies.every(isPublicReply)
  ) {
    throw new TransferProtocolError();
  }
  return value as unknown as TransferCaseSnapshot;
}

function formatTransferBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MEBIBYTE) return `${(bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KiB`;
  return `${(bytes / MEBIBYTE).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MiB`;
}

function formatTransferDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "–"
    : date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function appendTextElement(
  parent: HTMLElement,
  tag: "h3" | "h4" | "p" | "span",
  text: string,
  className?: string,
): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function safeExternalLink(link: PublicLink): HTMLAnchorElement | null {
  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const anchor = document.createElement("a");
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = link.label || link.url;
  return anchor;
}

export function setupTransferClient(): void {
  const root = document.querySelector<HTMLElement>("[data-transfer-root]");
  const entryForm = root?.querySelector<HTMLFormElement>("[data-transfer-entry]");
  const tokenInput = root?.querySelector<HTMLInputElement>("[data-transfer-token]");
  const sessionRegion = root?.querySelector<HTMLElement>("[data-transfer-session]");
  const sessionStatus = root?.querySelector<HTMLElement>("[data-transfer-status]");
  const reportForm = root?.querySelector<HTMLFormElement>("[data-transfer-report]");
  const finalStatus = root?.querySelector<HTMLElement>(
    "[data-transfer-final-status]",
  );
  const finalizeRetryButton = root?.querySelector<HTMLButtonElement>(
    "[data-transfer-finalize-retry]",
  );
  const uploadSection = root?.querySelector<HTMLElement>(
    "[data-transfer-uploads]",
  );
  const uploadList = root?.querySelector<HTMLElement>(
    "[data-transfer-upload-list]",
  );
  const uploadStatus = root?.querySelector<HTMLElement>(
    "[data-transfer-upload-status]",
  );
  const logoutButton = root?.querySelector<HTMLButtonElement>("[data-transfer-logout]");
  const caseRetryButton = root?.querySelector<HTMLButtonElement>(
    "[data-transfer-case-retry]",
  );
  const callbackPhone = root?.querySelector<HTMLElement>("[data-callback-phone]");
  const callbackPhoneInput = callbackPhone?.querySelector<HTMLInputElement>("input");
  const callbackRadio = root?.querySelector<HTMLInputElement>(
    "input[name='urgency'][value='callback_requested']",
  );
  const callbackChoice = root?.querySelector<HTMLElement>("[data-callback-choice]");
  const fileInput = reportForm?.querySelector<HTMLInputElement>("input[name='files']");
  const threadHeading = root?.querySelector<HTMLElement>("[data-thread-heading]");
  const caseHeading = root?.querySelector<HTMLElement>("[data-case-heading]");
  const reportHeading = root?.querySelector<HTMLElement>(
    "#transfer-report-heading",
  );

  if (
    !root ||
    !entryForm ||
    !tokenInput ||
    !sessionRegion ||
    !sessionStatus ||
    !reportForm ||
    !finalStatus ||
    !finalizeRetryButton ||
    !uploadSection ||
    !uploadList ||
    !uploadStatus ||
    !logoutButton ||
    !caseRetryButton ||
    !callbackPhone ||
    !callbackPhoneInput ||
    !callbackRadio ||
    !callbackChoice ||
    !fileInput ||
    !threadHeading ||
    !caseHeading ||
    !reportHeading
  ) {
    return;
  }

  let fragmentToken = consumeFragmentToken(window.location, window.history);
  if (fragmentToken) tokenInput.value = fragmentToken;
  let currentCase: PublicTransferCase | null = null;
  let activeDraft: ActiveDraft | null = null;
  let caseRecovery: "session" | "finalized" | null = null;
  let caseLoadGeneration = 0;
  const uploadRows = new Map<number, UploadRow>();

  const beginCaseLoad = (): number => ++caseLoadGeneration;

  const invalidateCaseLoads = (): void => {
    caseLoadGeneration += 1;
    caseRecovery = null;
  };

  const recoveryOwnsFocus = (...targets: readonly HTMLElement[]): boolean =>
    document.activeElement === document.body ||
    targets.includes(document.activeElement as HTMLElement);

  const setState = (state: TransferUiState): void => {
    root.dataset.state = state;
    entryForm.hidden =
      state === "ready" ||
      state === "submitting" ||
      state === "recovering" ||
      state === "finalize_retry";
    sessionRegion.hidden =
      state !== "ready" &&
      state !== "submitting" &&
      state !== "recovering" &&
      state !== "finalize_retry";
    for (const control of entryForm.elements) {
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLButtonElement
      ) {
        control.disabled = state === "loading";
      }
    }
    const sessionBusy =
      state === "submitting" ||
      state === "recovering" ||
      state === "finalize_retry";
    for (const control of reportForm.elements) {
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLButtonElement ||
        control instanceof HTMLSelectElement
      ) {
        control.disabled = sessionBusy;
      }
    }
    logoutButton.disabled = state === "loading" || state === "submitting";
    caseRetryButton.hidden = state !== "recovering";
    caseRetryButton.disabled = false;
    finalizeRetryButton.hidden = state !== "finalize_retry";
    finalizeRetryButton.disabled = false;
  };

  const expireSession = (message: string): void => {
    invalidateCaseLoads();
    clearTransferSession(sessionStorage);
    activeDraft = null;
    setState("expired");
    sessionStatus.textContent = message;
    tokenInput.focus();
  };

  const toggleCallback = (): void => {
    const enabled = callbackRadio.checked && !callbackRadio.disabled;
    callbackPhone.hidden = !enabled;
    callbackPhoneInput.required = enabled;
    if (!enabled) callbackPhoneInput.value = "";
  };

  const renderThread = (snapshot: TransferCaseSnapshot): void => {
    const caseReference = root.querySelector<HTMLElement>("[data-case-reference]");
    const caseStatus = root.querySelector<HTMLElement>("[data-case-status]");
    const caseExpiry = root.querySelector<HTMLElement>("[data-case-expiry]");
    const caseSubmissions = root.querySelector<HTMLElement>("[data-case-submissions]");
    const caseBytes = root.querySelector<HTMLElement>("[data-case-bytes]");
    const threadEmpty = root.querySelector<HTMLElement>("[data-thread-empty]");
    const thread = root.querySelector<HTMLOListElement>("[data-transfer-thread]");
    if (
      !caseHeading ||
      !caseReference ||
      !caseStatus ||
      !caseExpiry ||
      !caseSubmissions ||
      !caseBytes ||
      !threadEmpty ||
      !thread
    ) return;

    currentCase = snapshot.case;
    caseHeading.textContent = `Fall für ${snapshot.case.petName}`;
    caseReference.textContent = snapshot.case.publicReference ?? "";
    caseReference.hidden = !snapshot.case.publicReference;
    caseStatus.textContent = "Offen";
    caseExpiry.textContent = formatTransferDate(snapshot.case.expiresAt);
    caseSubmissions.textContent = String(snapshot.case.remainingSubmissions);
    caseBytes.textContent = formatTransferBytes(snapshot.case.remainingBytes);
    callbackRadio.disabled = !snapshot.case.allowCallback;
    callbackChoice.hidden = !snapshot.case.allowCallback;
    toggleCallback();

    thread.replaceChildren();
    threadEmpty.hidden = snapshot.submissions.length > 0 || snapshot.replies.length > 0;
    for (const submission of snapshot.submissions) {
      const item = document.createElement("li");
      item.className = "transfer-thread-item";
      appendTextElement(item, "h3", submission.title);
      appendTextElement(item, "p", submission.message);
      if (submission.observedSince) appendTextElement(item, "p", `Beobachtet: ${submission.observedSince}`);
      appendTextElement(item, "p", `Eingereicht: ${formatTransferDate(submission.finalizedAt ?? submission.createdAt)}`);
      appendTextElement(item, "p", submission.callbackRequested ? "Status: Rückruf erwünscht" : "Status: normale Bearbeitung");

      const links = snapshot.links.filter((link) => link.submissionId === submission.id);
      if (links.length > 0) {
        const section = document.createElement("div");
        section.className = "transfer-thread-links";
        appendTextElement(section, "h4", "Links");
        const list = document.createElement("ul");
        for (const link of links) {
          const anchor = safeExternalLink(link);
          if (!anchor) continue;
          const listItem = document.createElement("li");
          listItem.append(anchor);
          list.append(listItem);
        }
        section.append(list);
        item.append(section);
      }

      const files = snapshot.files.filter((file) => file.submissionId === submission.id);
      if (files.length > 0) {
        const section = document.createElement("div");
        section.className = "transfer-thread-files";
        appendTextElement(section, "h4", "Gespeicherte Dateien");
        for (const file of files) {
          if (file.state === "stored") {
            const anchor = document.createElement("a");
            anchor.href = `/api/transfers/files/${encodeURIComponent(file.id)}`;
            anchor.textContent = `${file.originalName} (${formatTransferBytes(file.storedSize ?? file.expectedSize)})`;
            section.append(anchor);
          } else {
            appendTextElement(section, "span", `${file.originalName}: nicht verfügbar`);
          }
        }
        item.append(section);
      }

      const replies = snapshot.replies.filter((reply) => reply.submissionId === submission.id);
      if (replies.length > 0) {
        const section = document.createElement("div");
        section.className = "transfer-thread-replies";
        appendTextElement(section, "h4", "Antwort der Praxis");
        for (const reply of replies) {
          appendTextElement(section, "p", reply.body);
          appendTextElement(section, "p", formatTransferDate(reply.createdAt));
        }
        item.append(section);
      }
      thread.append(item);
    }
    for (const reply of snapshot.replies.filter(
      ({ submissionId }) => submissionId === null,
    )) {
      const item = document.createElement("li");
      item.className = "transfer-thread-item";
      appendTextElement(item, "h3", "Antwort der Praxis zum Fall");
      appendTextElement(item, "p", reply.body);
      appendTextElement(item, "p", formatTransferDate(reply.createdAt));
      thread.append(item);
    }
  };

  const loadCase = async (): Promise<TransferCaseSnapshot> => {
    const value = await requestTransferJson("/api/transfers/case", {
      storage: sessionStorage,
    });
    return parseTransferCaseSnapshot(value);
  };

  const createUploadRows = (files: readonly File[]): void => {
    uploadList.replaceChildren();
    uploadRows.clear();
    files.forEach((file, index) => {
      const item = document.createElement("li");
      item.className = "transfer-upload-item";
      appendTextElement(item, "h3", file.name);
      appendTextElement(item, "p", formatTransferBytes(file.size), "transfer-upload-meta");
      const progress = document.createElement("progress");
      progress.max = 100;
      progress.value = 0;
      progress.setAttribute("aria-label", `Uploadfortschritt für ${file.name}`);
      const status = appendTextElement(item, "p", "Wartet auf Übertragung");
      status.setAttribute("aria-live", "polite");
      const retry = document.createElement("button");
      retry.className = "button button--secondary";
      retry.type = "button";
      retry.textContent = "Erneut versuchen";
      retry.hidden = true;
      item.append(progress, retry);
      uploadList.append(item);
      uploadRows.set(index, { progress, status, retry });
    });
    uploadSection.hidden = files.length === 0;
  };

  const uploadOne = async (draft: ActiveDraft, index: number): Promise<void> => {
    const file = draft.files[index];
    const slot = draft.slots[index];
    const row = uploadRows.get(index);
    if (!file || !slot || !row) throw new TransferUploadError(false);
    row.retry.hidden = true;
    row.retry.disabled = true;
    row.status.textContent = "Wird sicher übertragen …";
    await uploadTransferFile(file, slot, readCsrfToken(sessionStorage), (percent) => {
      row.progress.value = percent;
    });
    row.progress.value = 100;
    row.status.textContent = "Übertragen";
    row.retry.disabled = false;
  };

  const setRetryButtonsDisabled = (disabled: boolean): void => {
    for (const [index, row] of uploadRows) {
      if (!row.retry.hidden && !activeDraft?.completed.has(index)) {
        row.retry.disabled = disabled;
      }
    }
  };

  const uploadFailureMessage = (
    retryable: boolean,
    requestId?: string,
  ): string => `${retryable
    ? "Übertragung fehlgeschlagen. Erneuter Versuch ist möglich."
    : "Übertragung wurde abgelehnt."}${requestSuffix(requestId)}`;

  const abandonRejectedDraft = (): void => {
    activeDraft = null;
    setRetryButtonsDisabled(true);
    uploadStatus.textContent = "Mindestens eine Datei wurde abgelehnt.";
    finalStatus.textContent =
      "Die Einreichung konnte nicht abgeschlossen werden. Starten Sie mit korrigierten Dateien einen neuen Bericht.";
    setState("ready");
    reportHeading.focus();
  };

  const completeFinalizedDraft = (
    snapshot: TransferCaseSnapshot,
    returnFocus = true,
  ): void => {
    renderThread(snapshot);
    reportForm.reset();
    toggleCallback();
    activeDraft = null;
    caseRecovery = null;
    uploadSection.hidden = true;
    uploadStatus.textContent = "";
    finalStatus.textContent = "Bericht und Dateien wurden sicher übermittelt.";
    setState("ready");
    if (returnFocus) threadHeading.focus();
  };

  const recoverCase = async (): Promise<void> => {
    const recovery = caseRecovery;
    if (!recovery || caseRetryButton.disabled) return;
    const generation = beginCaseLoad();
    caseRetryButton.disabled = true;
    try {
      const snapshot = await loadCase();
      if (
        generation !== caseLoadGeneration ||
        root.dataset.state !== "recovering" ||
        caseRecovery !== recovery
      ) return;
      const returnFocus = recoveryOwnsFocus(caseRetryButton);
      if (recovery === "finalized") {
        const draft = activeDraft;
        if (!draft || draft.phase !== "finalized") return;
        completeFinalizedDraft(snapshot, returnFocus);
      } else {
        renderThread(snapshot);
        caseRecovery = null;
        setState("ready");
        sessionStatus.textContent = "Sichere Sitzung aktiv.";
        if (returnFocus) caseHeading.focus();
      }
    } catch (error) {
      if (
        generation !== caseLoadGeneration ||
        root.dataset.state !== "recovering" ||
        caseRecovery !== recovery
      ) return;
      if (error instanceof TransferRequestError && error.status === 401) {
        expireSession(error.message);
        return;
      }
      const returnFocus = recoveryOwnsFocus(caseRetryButton);
      const message = error instanceof TransferRequestError
        ? error.message
        : "Die Fallansicht konnte nicht geladen werden.";
      if (recovery === "finalized") finalStatus.textContent = message;
      else sessionStatus.textContent = message;
      caseRetryButton.disabled = false;
      if (returnFocus) caseRetryButton.focus();
    }
  };

  const loadFinalizedCase = async (draft: ActiveDraft): Promise<void> => {
    const generation = beginCaseLoad();
    try {
      const snapshot = await loadCase();
      if (
        generation !== caseLoadGeneration ||
        root.dataset.state !== "submitting" ||
        activeDraft !== draft ||
        draft.phase !== "finalized"
      ) return;
      completeFinalizedDraft(snapshot, recoveryOwnsFocus());
    } catch (error) {
      if (
        generation !== caseLoadGeneration ||
        root.dataset.state !== "submitting" ||
        activeDraft !== draft ||
        draft.phase !== "finalized"
      ) return;
      if (error instanceof TransferRequestError && error.status === 401) {
        expireSession(error.message);
        return;
      }
      const returnFocus = recoveryOwnsFocus();
      caseRecovery = "finalized";
      setState("recovering");
      finalStatus.textContent = error instanceof TransferRequestError
        ? error.message
        : "Die Einreichung wurde bestätigt, aber die Fallansicht konnte nicht geladen werden.";
      if (returnFocus) caseRetryButton.focus();
    }
  };

  const finishDraft = async (): Promise<void> => {
    const draft = activeDraft;
    if (
      !draft ||
      (draft.phase !== "uploading" && draft.phase !== "finalize_failed")
    ) return;
    if (draft.completed.size !== draft.files.length) return;
    draft.phase = "finalizing";
    setState("submitting");
    finalStatus.textContent = "Einreichung wird abgeschlossen …";
    try {
      await requestTransferJson(
        `/api/transfers/submissions/${encodeURIComponent(draft.submissionId)}/finalize`,
        {
          method: "POST",
          body: {},
          csrfToken: readCsrfToken(sessionStorage),
          storage: sessionStorage,
        },
      );
    } catch (error) {
      if (error instanceof TransferRequestError && error.status === 401) {
        expireSession(error.message);
        return;
      }
      draft.phase = "finalize_failed";
      setState("finalize_retry");
      finalStatus.textContent = error instanceof TransferRequestError
        ? error.message
        : "Die Einreichung konnte nicht abgeschlossen werden.";
      finalizeRetryButton.focus();
      return;
    }
    if (activeDraft !== draft) return;
    draft.phase = "finalized";
    await loadFinalizedCase(draft);
  };

  const retryUpload = async (index: number): Promise<void> => {
    const draft = activeDraft;
    const row = uploadRows.get(index);
    if (
      !draft ||
      !row ||
      draft.phase !== "uploading" ||
      draft.retryInFlight ||
      draft.completed.has(index)
    ) return;
    draft.retryInFlight = true;
    setRetryButtonsDisabled(true);
    try {
      await uploadOne(draft, index);
      draft.completed.add(index);
      uploadStatus.textContent = "Datei wurde beim erneuten Versuch übertragen.";
      await finishDraft();
    } catch (error) {
      if (error instanceof TransferUploadError && error.status === 401) {
        expireSession(
          `Die Sitzung ist abgelaufen.${requestSuffix(error.requestId)}`,
        );
        return;
      }
      const retryable = error instanceof TransferUploadError && error.retryable;
      const requestId = error instanceof TransferUploadError
        ? error.requestId
        : undefined;
      row.status.textContent = uploadFailureMessage(retryable, requestId);
      row.retry.hidden = !retryable;
      if (!retryable) abandonRejectedDraft();
    } finally {
      if (activeDraft === draft) {
        draft.retryInFlight = false;
        setRetryButtonsDisabled(false);
      }
    }
  };

  entryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(entryForm);
    const manualToken = tokenInput.value.trim();
    const token = manualToken || fragmentToken;
    const turnstileToken = String(data.get("cf-turnstile-response") ?? "");
    if (!token) {
      sessionStatus.textContent = "Bitte geben Sie den Datentransfer-Token ein.";
      return;
    }
    if (!turnstileToken) {
      sessionStatus.textContent = "Bitte schließen Sie die Sicherheitsprüfung ab.";
      return;
    }

    setState("loading");
    sessionStatus.textContent = "Sichere Sitzung wird aufgebaut …";
    let session: TransferSessionResponse;
    try {
      const sessionValue = await requestTransferJson(
        "/api/transfers/session",
        {
          method: "POST",
          body: { token, turnstileToken },
          storage: sessionStorage,
        },
      );
      session = parseTransferSessionResponse(sessionValue);
    } catch (error) {
      setState("entry");
      sessionStatus.textContent = error instanceof TransferRequestError
        ? error.message
        : "Die sichere Sitzung konnte nicht aufgebaut werden.";
      window.turnstile?.reset(
        entryForm.querySelector<HTMLElement>(".cf-turnstile") ?? undefined,
      );
      return;
    }
    storeCsrfToken(sessionStorage, session.csrfToken);
    tokenInput.value = "";
    fragmentToken = "";
    const generation = beginCaseLoad();
    try {
      const snapshot = await loadCase();
      if (
        generation !== caseLoadGeneration ||
        root.dataset.state !== "loading"
      ) return;
      const returnFocus = recoveryOwnsFocus();
      renderThread(snapshot);
      setState("ready");
      sessionStatus.textContent = "Sichere Sitzung aktiv.";
      if (returnFocus) caseHeading.focus();
    } catch (error) {
      if (
        generation !== caseLoadGeneration ||
        root.dataset.state !== "loading"
      ) return;
      if (error instanceof TransferRequestError && error.status === 401) {
        expireSession(error.message);
        return;
      }
      const returnFocus = recoveryOwnsFocus();
      caseRecovery = "session";
      setState("recovering");
      sessionStatus.textContent = error instanceof TransferRequestError
        ? error.message
        : "Die Fallansicht konnte nicht geladen werden.";
      if (returnFocus) caseRetryButton.focus();
    }
  });

  reportForm.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "urgency") {
      toggleCallback();
    }
  });

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentCase) return;
    const files = Array.from(fileInput.files ?? []);
    let payload: TransferSubmissionPayload;
    try {
      payload = buildSubmissionPayload(
        new FormData(reportForm),
        files,
        currentCase.remainingBytes,
        currentCase.allowCallback,
      );
    } catch (error) {
      finalStatus.textContent = error instanceof Error
        ? error.message
        : "Bitte prüfen Sie die Eingaben.";
      return;
    }

    setState("submitting");
    finalStatus.textContent = "Berichtsentwurf wird sicher angelegt …";
    createUploadRows(files);
    try {
      const draftValue = await requestTransferJson(
        "/api/transfers/submissions",
        {
          method: "POST",
          body: payload,
          csrfToken: readCsrfToken(sessionStorage),
          storage: sessionStorage,
        },
      );
      const draftResponse = parseTransferDraftResponse(draftValue);
      if (draftResponse.uploads.length !== files.length) {
        throw new TransferProtocolError();
      }
      activeDraft = {
        submissionId: draftResponse.submissionId,
        files,
        slots: draftResponse.uploads,
        completed: new Set(),
        phase: "uploading",
        retryInFlight: false,
      };
      const draft = activeDraft;
      const failures = await uploadPendingFiles(
        draft.files,
        draft.slots,
        draft.completed,
        async (_file, _slot, index) => uploadOne(draft, index),
      );
      for (const failure of failures) {
        const row = uploadRows.get(failure.index);
        if (!row) continue;
        row.status.textContent = uploadFailureMessage(
          failure.retryable,
          failure.requestId,
        );
        row.retry.hidden = !failure.retryable;
        row.retry.disabled = false;
        if (failure.status === 401) {
          expireSession(
            `Die Sitzung ist abgelaufen.${requestSuffix(failure.requestId)}`,
          );
          return;
        }
      }
      if (failures.some(({ retryable }) => !retryable)) {
        abandonRejectedDraft();
        return;
      }
      if (failures.length > 0) {
        uploadStatus.textContent = "Mindestens eine Datei konnte nicht übertragen werden.";
        finalStatus.textContent = "Die Einreichung wird erst nach allen erfolgreichen Uploads abgeschlossen.";
      }
      await finishDraft();
    } catch (error) {
      if (error instanceof TransferRequestError && error.status === 401) {
        expireSession(error.message);
        return;
      }
      finalStatus.textContent = error instanceof TransferRequestError
        ? error.message
        : "Der Bericht konnte nicht gesendet werden.";
      activeDraft = null;
      setState("ready");
    }
  });

  uploadList.addEventListener("click", (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) return;
    const index = [...uploadRows.entries()].find(([, row]) => row.retry === button)?.[0];
    if (index !== undefined) void retryUpload(index);
  });

  caseRetryButton.addEventListener("click", () => void recoverCase());
  finalizeRetryButton.addEventListener("click", () => void finishDraft());

  logoutButton.addEventListener("click", async () => {
    invalidateCaseLoads();
    logoutButton.disabled = true;
    try {
      await logoutTransferSession(sessionStorage);
      reportForm.reset();
      toggleCallback();
      currentCase = null;
      activeDraft = null;
      setState("expired");
      sessionStatus.textContent = "Sicher abgemeldet. Sie können einen neuen Token eingeben.";
      tokenInput.focus();
    } catch (error) {
      expireSession(
        error instanceof TransferRequestError
          ? error.message
          : "Lokal abgemeldet. Die Serverabmeldung konnte nicht bestätigt werden.",
      );
    }
  });

  setState("entry");
  toggleCallback();
  if (readCsrfToken(sessionStorage) && !fragmentToken) {
    setState("loading");
    sessionStatus.textContent = "Vorhandene sichere Sitzung wird geprüft …";
    const generation = beginCaseLoad();
    void loadCase()
      .then((snapshot) => {
        if (
          generation !== caseLoadGeneration ||
          root.dataset.state !== "loading"
        ) return;
        const returnFocus = recoveryOwnsFocus();
        renderThread(snapshot);
        setState("ready");
        sessionStatus.textContent = "Sichere Sitzung wiederhergestellt.";
        if (returnFocus) caseHeading.focus();
      })
      .catch((error: unknown) => {
        if (
          generation !== caseLoadGeneration ||
          root.dataset.state !== "loading"
        ) return;
        if (error instanceof TransferRequestError && error.status === 401) {
          expireSession(error.message);
          return;
        }
        const returnFocus = recoveryOwnsFocus();
        caseRecovery = "session";
        setState("recovering");
        sessionStatus.textContent = error instanceof TransferRequestError
          ? error.message
          : "Die Fallansicht konnte nicht geladen werden.";
        if (returnFocus) caseRetryButton.focus();
      });
  }
}
