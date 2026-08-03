export interface ContactResult {
  readonly accepted?: boolean;
  readonly error?: string;
  readonly requestId?: string;
}

export interface TurnstileClient {
  reset(widget?: string | HTMLElement): void;
}

export interface ContactFormSetupOptions {
  readonly root?: Document;
  readonly fetchImpl?: typeof fetch;
  readonly formDataFactory?: (form: HTMLFormElement) => FormData;
  readonly turnstile?: TurnstileClient;
  readonly now?: () => number;
}

export class ContactRequestError extends Error {
  readonly code: string;
  readonly requestId?: string;

  constructor(code: string, requestId?: string) {
    super(code);
    this.name = "ContactRequestError";
    this.code = code;
    if (requestId) this.requestId = requestId;
  }
}

export function diagnosticSuffix(requestId?: string): string {
  return requestId ? ` Vorgangskennung: ${requestId}` : "";
}

export function contactErrorMessage(error: unknown): string {
  if (!(error instanceof ContactRequestError)) {
    return "Die Nachricht konnte gerade nicht gesendet werden. Bitte versuchen Sie es später erneut oder rufen Sie uns an.";
  }

  const suffix = diagnosticSuffix(error.requestId);

  switch (error.code) {
    case "security_check_failed":
      return `Die Sicherheitsprüfung wurde abgelehnt. Bitte laden Sie die Seite neu und versuchen Sie es erneut.${suffix}`;
    case "too_many_requests":
      return `Es wurden zu viele Anfragen gesendet. Bitte warten Sie eine Minute und versuchen Sie es erneut.${suffix}`;
    case "invalid_form":
    case "invalid_json":
    case "invalid_payload":
      return `Mindestens eine Eingabe konnte nicht verarbeitet werden. Bitte prüfen Sie das Formular.${suffix}`;
    case "temporarily_unavailable":
      return `Der Maildienst ist derzeit nicht verfügbar. Bitte verwenden Sie vorerst die Telefonnummer.${suffix}`;
    default:
      return `Die Nachricht konnte gerade nicht gesendet werden. Bitte versuchen Sie es später erneut oder rufen Sie uns an.${suffix}`;
  }
}

export function setupContactForm(
  options: ContactFormSetupOptions = {},
): void {
  const root = options.root ?? document;
  const fetchImpl = options.fetchImpl ?? fetch;
  const formDataFactory =
    options.formDataFactory ?? ((form: HTMLFormElement) => new FormData(form));
  const now = options.now ?? Date.now;
  const turnstile = options.turnstile ?? window.turnstile;

  const form = root.querySelector<HTMLFormElement>("[data-contact-form]");
  const status = form?.querySelector<HTMLElement>("[data-form-status]");
  const startedAt = form?.querySelector<HTMLInputElement>("[data-started-at]");

  if (!form || !status) return;

  function resetStartedAt(): void {
    if (startedAt) startedAt.value = String(now());
  }

  resetStartedAt();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = formDataFactory(form);
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const token = String(data.get("cf-turnstile-response") ?? "");

    if (!email && !phone) {
      status.textContent =
        "Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.";
      return;
    }
    if (!token) {
      status.textContent = "Bitte schließen Sie die Sicherheitsprüfung ab.";
      return;
    }

    const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (button) button.disabled = true;
    status.textContent = "Nachricht wird sicher versendet …";

    const payload = {
      name: String(data.get("name") ?? ""),
      email,
      phone,
      category: String(data.get("category") ?? ""),
      message: String(data.get("message") ?? ""),
      companyWebsite: String(data.get("companyWebsite") ?? ""),
      privacyAccepted: data.get("privacyAccepted") === "true",
      startedAt: Number(data.get("startedAt") ?? 0),
      turnstileToken: token,
    };

    try {
      const endpoint = form.dataset.endpoint;
      if (!endpoint) throw new ContactRequestError("missing_endpoint");

      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as ContactResult;

      if (!response.ok || !result.accepted) {
        throw new ContactRequestError(
          result.error ?? "request_failed",
          result.requestId,
        );
      }

      form.reset();
      resetStartedAt();
      turnstile?.reset();
      status.textContent =
        `Vielen Dank. Ihre Nachricht wurde angenommen. Eine Terminanfrage ist erst nach Rückmeldung der Praxis bestätigt.` +
        diagnosticSuffix(result.requestId);
    } catch (error) {
      turnstile?.reset();
      status.textContent = contactErrorMessage(error);
    } finally {
      if (button) button.disabled = false;
    }
  });
}
