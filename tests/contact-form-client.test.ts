import { describe, expect, it, vi } from "vitest";

import { setupContactForm } from "../src/scripts/contact-form";

class FakeForm {
  readonly dataset = {
    endpoint:
      "https://api.tierarztpraxis-schaffer.telacore.org/v1/contact",
  };
  readonly status = { textContent: "" };
  readonly startedAt = { value: "" };
  readonly button = { disabled: false };
  readonly reset = vi.fn();
  private submitHandler?: (event: SubmitEvent) => void | Promise<void>;

  querySelector<T>(selector: string): T | null {
    const elements: Record<string, unknown> = {
      "[data-form-status]": this.status,
      "[data-started-at]": this.startedAt,
      "button[type='submit']": this.button,
    };

    return (elements[selector] ?? null) as T | null;
  }

  addEventListener(
    type: string,
    handler: EventListenerOrEventListenerObject,
  ): void {
    if (type !== "submit" || typeof handler !== "function") return;
    this.submitHandler = handler as (
      event: SubmitEvent,
    ) => void | Promise<void>;
  }

  async submit(): Promise<void> {
    if (!this.submitHandler) throw new Error("Submit-Handler fehlt.");

    await this.submitHandler({
      preventDefault: vi.fn(),
    } as unknown as SubmitEvent);
  }
}

class FakeDocument {
  constructor(private readonly form: FakeForm) {}

  querySelector<T>(selector: string): T | null {
    return selector === "[data-contact-form]"
      ? (this.form as unknown as T)
      : null;
  }
}

function validFormData(): FormData {
  const data = new FormData();
  data.set("name", "Max Mustermann");
  data.set("email", "max@example.org");
  data.set("phone", "");
  data.set("category", "general");
  data.set("message", "Dies ist eine ausreichend lange Testnachricht.");
  data.set("companyWebsite", "");
  data.set("privacyAccepted", "true");
  data.set("startedAt", String(Date.now() - 5_000));
  data.set("cf-turnstile-response", "test-token");
  return data;
}

function rejectedFetch(
  error: string,
  requestId: string,
  status: number,
): typeof fetch {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        accepted: false,
        error,
        requestId,
      }),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    ),
  ) as unknown as typeof fetch;
}

describe("Kontaktformular-Client", () => {
  it.each([
    {
      code: "security_check_failed",
      status: 400,
      requestId: "req-security",
      message: "Die Sicherheitsprüfung wurde abgelehnt",
    },
    {
      code: "temporarily_unavailable",
      status: 503,
      requestId: "req-mail",
      message: "Der Maildienst ist derzeit nicht verfügbar",
    },
  ])(
    "zeigt die Worker-Antwort $code tatsächlich im Statusfeld an",
    async ({ code, status, requestId, message }) => {
      const form = new FakeForm();
      const turnstile = { reset: vi.fn() };

      setupContactForm({
        root: new FakeDocument(form) as unknown as Document,
        fetchImpl: rejectedFetch(code, requestId, status),
        formDataFactory: validFormData,
        turnstile,
      });

      await form.submit();

      expect(form.status.textContent).toContain(message);
      expect(form.status.textContent).toContain(requestId);
      expect(form.button.disabled).toBe(false);
      expect(turnstile.reset).toHaveBeenCalledOnce();
    },
  );
});
