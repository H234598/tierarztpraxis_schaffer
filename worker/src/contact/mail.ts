import type { Env } from "../env";
import {
  isValidEmail,
  type ContactCategory,
  type ContactSubmission,
} from "./validation";

const labels: Record<ContactCategory, string> = {
  appointment: "Terminanfrage",
  general: "Allgemeine Frage",
  feedback: "Rückmeldung zur Website",
  accessibility: "Barriere gemeldet",
  other: "Sonstiges Anliegen",
};

export async function resolveRecipient(env: Env): Promise<string> {
  const configured = (await env.CONTACT_CONFIG.get(env.CONTACT_RECIPIENT_KEY))
    ?.trim()
    .toLowerCase();

  if (configured && isValidEmail(configured)) return configured;

  if (env.ENVIRONMENT === "development" && isValidEmail(env.TEST_CONTACT_RECIPIENT)) {
    return env.TEST_CONTACT_RECIPIENT.toLowerCase();
  }

  throw new Error("recipient_not_configured");
}

export async function sendMail(
  submission: ContactSubmission,
  recipient: string,
  requestId: string,
  env: Env,
): Promise<void> {
  if (!isValidEmail(env.MAIL_FROM)) {
    throw new Error("sender_not_configured");
  }

  const mail = {
    to: recipient,
    from: env.MAIL_FROM,
    subject: `[Website] ${labels[submission.category]} – ${requestId}`,
    text: [
      "Neue Nachricht über die Praxis-Website",
      "",
      `Anfrage-ID: ${requestId}`,
      `Umgebung: ${env.ENVIRONMENT}`,
      `Anliegen: ${labels[submission.category]}`,
      `Name: ${submission.name}`,
      submission.email ? `E-Mail: ${submission.email}` : "E-Mail: nicht angegeben",
      submission.phone ? `Telefon: ${submission.phone}` : "Telefon: nicht angegeben",
      "",
      "Nachricht:",
      submission.message,
    ].join("\n"),
    ...(submission.email ? { replyTo: submission.email } : {}),
  };

  await env.EMAIL.send(mail);
}
