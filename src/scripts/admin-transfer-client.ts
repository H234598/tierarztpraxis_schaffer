export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

interface AdminRequestOptions {
  readonly method?: "GET" | "POST" | "PATCH";
  readonly body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function requestAdminJson<T = Record<string, unknown>>(
  path: string,
  options: AdminRequestOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  if (!path.startsWith("/api/admin/") || path.startsWith("//"))
    throw new TypeError("Admin-API-Pfad muss same-origin sein.");
  const response = await fetchImpl(path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: options.body === undefined ? {} : { "Content-Type": "application/json" },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const requestId = typeof error?.requestId === "string" ? error.requestId : undefined;
  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    const base =
      response.status === 401
        ? "Admin-Zugang erforderlich."
        : "Anfrage fehlgeschlagen.";
    throw new AdminRequestError(
      `${base}${requestId ? ` Vorgangskennung: ${requestId}` : ""}`,
      response.status,
      requestId,
    );
  }
  return payload as T;
}

function element<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Admin-Oberfläche unvollständig: ${selector}`);
  return found;
}

function text(parent: HTMLElement, value: unknown): void {
  parent.textContent = String(value ?? "—");
}
function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function setupAdminTransferClient(): void {
  const root = document.querySelector<HTMLElement>("[data-admin-transfer-root]");
  if (!root) return;
  const status = element<HTMLElement>(root, "[data-admin-status]");
  const authRequired = element<HTMLElement>(root, "[data-admin-auth-required]");
  const workspace = element<HTMLElement>(root, "[data-admin-workspace]");
  const identity = element<HTMLElement>(root, "[data-admin-identity]");
  const createForm = element<HTMLFormElement>(root, "[data-admin-create-form]");
  const filterForm = element<HTMLFormElement>(root, "[data-admin-filter-form]");
  const list = element<HTMLElement>(root, "[data-admin-case-list]");
  const detail = element<HTMLElement>(root, "[data-admin-case-detail]");
  const detailHeading = element<HTMLElement>(root, "[data-admin-detail-heading]");
  const facts = element<HTMLElement>(root, "[data-admin-case-facts]");
  const noteSection = element<HTMLElement>(root, "[data-admin-internal-note-section]");
  const note = element<HTMLElement>(root, "[data-admin-internal-note]");
  const tokenList = element<HTMLUListElement>(root, "[data-admin-token-list]");
  const submissionList = element<HTMLUListElement>(
    root,
    "[data-admin-submission-list]",
  );
  const auditList = element<HTMLUListElement>(root, "[data-admin-audit-list]");
  const replyEditor = element<HTMLElement>(root, "[data-admin-reply-editor]");
  const replyForm = element<HTMLFormElement>(root, "[data-admin-reply-form]");
  const replySubmission = element<HTMLSelectElement>(
    root,
    "[data-admin-reply-submission]",
  );
  const replyBody = element<HTMLTextAreaElement>(root, "[data-admin-reply-body]");
  const callbackPlanned = element<HTMLInputElement>(
    root,
    "[data-admin-callback-planned]",
  );
  const callbackNote = element<HTMLTextAreaElement>(root, "[data-admin-callback-note]");
  const replyStatus = element<HTMLElement>(root, "[data-admin-reply-status]");
  const dialog = element<HTMLDialogElement>(document, "[data-admin-token-dialog]");
  const shareUrl = element<HTMLTextAreaElement>(dialog, "[data-admin-share-url]");
  const tokenExpiry = element<HTMLElement>(dialog, "[data-admin-token-expiry]");
  const tokenCaseId = element<HTMLElement>(dialog, "[data-admin-token-case-id]");
  const tokenPetName = element<HTMLElement>(dialog, "[data-admin-token-pet-name]");
  const previous = element<HTMLButtonElement>(root, "[data-admin-previous-page]");
  const next = element<HTMLButtonElement>(root, "[data-admin-next-page]");
  const pageLabel = element<HTMLElement>(root, "[data-admin-page]");
  let page = 1;
  let total = 0;
  let selectedCaseId = "";
  let selectedStatus = "";

  const setStatus = (message: string): void => {
    status.textContent = message;
  };
  const failClosed = (error: unknown): void => {
    if (error instanceof AdminRequestError && error.status === 401) {
      workspace.hidden = true;
      authRequired.hidden = false;
      detail.hidden = true;
      list.replaceChildren();
      facts.replaceChildren();
      tokenList.replaceChildren();
      identity.textContent = "";
      selectedCaseId = "";
      selectedStatus = "";
      shareUrl.value = "";
      if (dialog.open) dialog.close();
    }
    setStatus(error instanceof Error ? error.message : "Anfrage fehlgeschlagen.");
  };
  const setBusy = (control: HTMLButtonElement, busy: boolean): void => {
    control.disabled = busy;
  };
  const appendFact = (label: string, value: unknown): void => {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    text(term, label);
    text(description, value);
    wrapper.append(term, description);
    facts.append(wrapper);
  };
  const showToken = (payload: Record<string, unknown>): void => {
    const transferCase = isRecord(payload.case) ? payload.case : null;
    shareUrl.value = string(payload.shareUrl);
    text(tokenCaseId, transferCase?.id ?? selectedCaseId);
    text(
      tokenPetName,
      transferCase?.petName ?? detailHeading.textContent?.replace(/^Fall für /u, ""),
    );
    text(
      tokenExpiry,
      payload.expiresAt
        ? `Gültig bis ${string(payload.expiresAt)}`
        : "Token gehört zum neu angelegten Fall.",
    );
    dialog.showModal();
    shareUrl.focus();
    shareUrl.select();
  };

  const loadCases = async (): Promise<void> => {
    const data = new FormData(filterForm);
    const query = new URLSearchParams({ page: String(page) });
    const selected = string(data.get("status"));
    const search = string(data.get("q")).trim();
    if (selected) query.set("status", selected);
    if (search) query.set("q", search);
    const payload = await requestAdminJson(`/api/admin/cases?${query}`);
    const cases = records(payload.cases);
    total = Number(payload.total) || 0;
    list.replaceChildren();
    if (cases.length === 0) {
      const empty = document.createElement("p");
      text(empty, "Keine Fälle gefunden.");
      list.append(empty);
    }
    for (const transferCase of cases) {
      const article = document.createElement("article");
      article.className = "admin-case-row";
      const heading = document.createElement("h3");
      text(heading, string(transferCase.petName) || "Unbenannter Fall");
      const meta = document.createElement("p");
      text(
        meta,
        `${string(transferCase.status)} · ${string(transferCase.internalReference) || "ohne interne Referenz"}`,
      );
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--secondary";
      text(button, "Details öffnen");
      button.addEventListener("click", () => {
        void loadDetail(string(transferCase.id));
      });
      article.append(heading, meta, button);
      list.append(article);
    }
    pageLabel.textContent = `Seite ${page}`;
    previous.disabled = page <= 1;
    next.disabled = page * 20 >= total;
    setStatus(`${total} Fall/Fälle geladen.`);
  };

  const loadDetail = async (caseId: string): Promise<void> => {
    try {
      const payload = await requestAdminJson(
        `/api/admin/cases/${encodeURIComponent(caseId)}`,
      );
      if (!isRecord(payload.case)) throw new Error("Falldaten fehlen.");
      const transferCase = payload.case;
      selectedCaseId = string(transferCase.id);
      selectedStatus = string(transferCase.status);
      text(detailHeading, `Fall für ${string(transferCase.petName)}`);
      facts.replaceChildren();
      appendFact("Status", selectedStatus);
      appendFact("Interne Referenz", transferCase.internalReference);
      appendFact("Anzeigename", transferCase.ownerDisplayName);
      appendFact("Ablauf", transferCase.expiresAt);
      appendFact("Einsendungen", transferCase.submissionCount);
      appendFact("Bytes", transferCase.totalBytes);
      const internalNote = string(transferCase.internalNote);
      noteSection.hidden = !internalNote;
      text(note, internalNote);
      tokenList.replaceChildren();
      for (const token of records(payload.tokens)) {
        const item = document.createElement("li");
        const label = document.createElement("span");
        text(
          label,
          `Token …${string(token.hint)} · ${token.revokedAt ? "widerrufen" : "aktiv"}`,
        );
        item.append(label);
        if (!token.revokedAt) {
          const revoke = document.createElement("button");
          revoke.type = "button";
          revoke.className = "button button--secondary";
          text(revoke, "Token widerrufen");
          revoke.addEventListener(
            "click",
            () =>
              void mutate(
                revoke,
                `/api/admin/tokens/${encodeURIComponent(string(token.id))}/revoke`,
                "POST",
                {},
                true,
              ),
          );
          item.append(" ", revoke);
        }
        tokenList.append(item);
      }
      submissionList.replaceChildren();
      const submissions = records(payload.submissions);
      replySubmission.replaceChildren();
      const caseOption = document.createElement("option");
      caseOption.value = "";
      text(caseOption, "Fallweite Antwort");
      replySubmission.append(caseOption);
      for (const submission of submissions) {
        const item = document.createElement("li");
        text(item, `${string(submission.title)} · ${string(submission.status)}`);
        submissionList.append(item);
        const option = document.createElement("option");
        option.value = string(submission.id);
        text(option, `${string(submission.title)} · ${string(submission.status)}`);
        replySubmission.append(option);
      }
      const fileList = element<HTMLUListElement>(root, "[data-admin-file-list]");
      fileList.replaceChildren();
      for (const file of records(payload.files)) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `/api/admin/files/${encodeURIComponent(string(file.id))}`;
        text(link, `${string(file.originalName)} · ${string(file.state)}`);
        item.append(link);
        fileList.append(item);
      }
      const linkList = element<HTMLUListElement>(root, "[data-admin-link-list]");
      linkList.replaceChildren();
      for (const external of records(payload.links)) {
        const item = document.createElement("li");
        text(item, `${string(external.label) || "Link"}: ${string(external.url)}`);
        linkList.append(item);
      }
      const replyList = element<HTMLUListElement>(root, "[data-admin-reply-list]");
      replyList.replaceChildren();
      for (const reply of records(payload.replies)) {
        const item = document.createElement("li");
        text(item, `${string(reply.body)} · ${string(reply.createdAt)}`);
        replyList.append(item);
      }
      auditList.replaceChildren();
      for (const event of records(payload.audit)) {
        const item = document.createElement("li");
        text(item, `${string(event.eventType)} · ${string(event.createdAt)}`);
        auditList.append(item);
      }
      const toggle = element<HTMLButtonElement>(detail, "[data-admin-toggle-status]");
      text(toggle, selectedStatus === "open" ? "Fall schließen" : "Fall wieder öffnen");
      replyEditor.hidden = false;
      replyStatus.textContent = "";
      detail.hidden = false;
      detailHeading.focus();
      setStatus("Falldetail geladen.");
    } catch (error) {
      failClosed(error);
    }
  };

  const mutate = async (
    button: HTMLButtonElement,
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    refreshDetail = false,
  ): Promise<Record<string, unknown> | null> => {
    setBusy(button, true);
    try {
      const payload = await requestAdminJson(path, { method, body });
      setStatus("Änderung gespeichert.");
      if (refreshDetail && selectedCaseId) await loadDetail(selectedCaseId);
      await loadCases();
      return payload;
    } catch (error) {
      failClosed(error);
      return null;
    } finally {
      setBusy(button, false);
    }
  };

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element<HTMLButtonElement>(createForm, "button[type='submit']");
    setBusy(submit, true);
    const data = new FormData(createForm);
    try {
      const payload = await requestAdminJson("/api/admin/cases", {
        method: "POST",
        body: {
          petName: string(data.get("petName")).trim(),
          ownerDisplayName: string(data.get("ownerDisplayName")).trim(),
          internalReference: string(data.get("internalReference")).trim(),
          internalNote: string(data.get("internalNote")).trim(),
          expiresInDays: Number(data.get("expiresInDays")),
          maxSubmissions: Number(data.get("maxSubmissions")),
          maxTotalBytes: Number(data.get("maxTotalMib")) * 1_024 * 1_024,
          allowReplies: data.has("allowReplies"),
          allowCallback: data.has("allowCallback"),
        },
      });
      showToken(payload);
      createForm.reset();
      await loadCases();
    } catch (error) {
      failClosed(error);
    } finally {
      setBusy(submit, false);
    }
  });
  filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    page = 1;
    void loadCases().catch(failClosed);
  });
  previous.addEventListener("click", () => {
    if (page > 1) {
      page -= 1;
      void loadCases().catch(failClosed);
    }
  });
  next.addEventListener("click", () => {
    if (page * 20 < total) {
      page += 1;
      void loadCases().catch(failClosed);
    }
  });
  const clearOneTimeToken = (): void => {
    shareUrl.value = "";
    tokenCaseId.textContent = "";
    tokenPetName.textContent = "";
  };
  dialog.addEventListener("close", clearOneTimeToken);
  element<HTMLButtonElement>(dialog, "[data-admin-close-token]").addEventListener(
    "click",
    () => dialog.close(),
  );
  element<HTMLButtonElement>(dialog, "[data-admin-copy-token]").addEventListener(
    "click",
    async () => {
      await navigator.clipboard.writeText(shareUrl.value);
      setStatus("Freigabelink kopiert.");
    },
  );
  element<HTMLButtonElement>(dialog, "[data-admin-print-token]").addEventListener(
    "click",
    () => window.print(),
  );
  element<HTMLButtonElement>(detail, "[data-admin-new-token]").addEventListener(
    "click",
    async (event) => {
      const payload = await mutate(
        event.currentTarget as HTMLButtonElement,
        `/api/admin/cases/${encodeURIComponent(selectedCaseId)}/tokens`,
        "POST",
        { revokeExisting: false },
      );
      if (payload) showToken(payload);
    },
  );
  element<HTMLButtonElement>(detail, "[data-admin-rotate-token]").addEventListener(
    "click",
    async (event) => {
      const payload = await mutate(
        event.currentTarget as HTMLButtonElement,
        `/api/admin/cases/${encodeURIComponent(selectedCaseId)}/tokens`,
        "POST",
        { revokeExisting: true },
        true,
      );
      if (payload) showToken(payload);
    },
  );
  element<HTMLButtonElement>(detail, "[data-admin-toggle-status]").addEventListener(
    "click",
    (event) =>
      void mutate(
        event.currentTarget as HTMLButtonElement,
        `/api/admin/cases/${encodeURIComponent(selectedCaseId)}/status`,
        "PATCH",
        { status: selectedStatus === "open" ? "closed" : "open" },
        true,
      ),
  );
  element<HTMLButtonElement>(detail, "[data-admin-mark-exported]").addEventListener(
    "click",
    (event) =>
      void mutate(
        event.currentTarget as HTMLButtonElement,
        `/api/admin/cases/${encodeURIComponent(selectedCaseId)}/mark-exported`,
        "POST",
        {},
        true,
      ),
  );
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element<HTMLButtonElement>(replyForm, "button[type='submit']");
    const body = replyBody.value.trim();
    if (!body && !callbackPlanned.checked) {
      replyStatus.textContent =
        "Bitte eine Antwort schreiben oder Rückruf geplant markieren.";
      replyBody.focus();
      return;
    }
    const payload = await mutate(
      submit,
      `/api/admin/cases/${encodeURIComponent(selectedCaseId)}/replies`,
      "POST",
      {
        submissionId: replySubmission.value || null,
        body,
        callbackPlanned: callbackPlanned.checked,
        callbackNote: callbackNote.value.trim(),
      },
      true,
    );
    if (payload) {
      replyForm.reset();
      replyStatus.textContent = "Antwort oder Rückrufstatus gespeichert.";
    }
  });

  void requestAdminJson("/api/admin/session")
    .then((payload) => {
      if (!isRecord(payload.admin)) throw new Error("Admin-Sitzung unvollständig.");
      text(identity, `Angemeldet als ${string(payload.admin.email)}`);
      authRequired.hidden = true;
      workspace.hidden = false;
      return loadCases();
    })
    .catch(failClosed);
}
