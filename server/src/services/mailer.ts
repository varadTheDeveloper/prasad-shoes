// Sends email through Resend (https://resend.com) with a plain HTTPS request – no extra package.
// Settings come only from server/.env and are never sent to the app:
//   OWNER_EMAIL     – the fixed recipient(s), comma-separated (the app never sends a recipient)
//   RESEND_API_KEY  – Resend → API Keys ("Sending access" is enough)
//   EMAIL_FROM      – e.g. "Prasad Shoes <orders@your-verified-domain.com>" (domain verified in Resend)
//   RESEND_API_URL  – optional, only for tests (default https://api.resend.com)
import { env } from '../env';

/** Everything needed to send is set in server/.env. */
export function mailReady(): boolean {
  const m = env.mail;
  return Boolean(m.ownerEmails.length && m.resendKey && m.from);
}

/**
 * Sends one email with one Word attachment to the OWNER_EMAIL address(es). Resolves only when Resend has accepted the
 * message (it answers with a message id); throws otherwise. `idempotencyKey`: Resend sends a repeated
 * request with the same key only once.
 */
export async function sendToOwner(mail: { subject: string; text: string; fileName: string; file: Buffer; idempotencyKey?: string }) {
  const m = env.mail;
  const res = await fetch(`${m.resendUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${m.resendKey}`,
      'Content-Type': 'application/json',
      ...(mail.idempotencyKey ? { 'Idempotency-Key': mail.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: m.from,
      to: m.ownerEmails,
      subject: mail.subject,
      text: mail.text,
      attachments: [{ filename: mail.fileName, content: mail.file.toString('base64') }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  let data: { id?: string; message?: string; name?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  if (!res.ok || !data.id) {
    // Only Resend's own error text – never the email content.
    throw Object.assign(new Error(data.message ?? `Resend answered ${res.status}`), { responseCode: res.status, code: data.name });
  }
  return { to: m.ownerEmails.join(', '), messageId: data.id };
}
