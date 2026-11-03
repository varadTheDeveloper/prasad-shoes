// Sends email through SMTP (e.g. Gmail with an App Password). Settings come only from server/.env:
//   OWNER_EMAIL  – the one fixed recipient (the app never sends a recipient)
//   SMTP_HOST, SMTP_PORT (465 = TLS, 587 = STARTTLS), SMTP_USER, SMTP_PASS, EMAIL_FROM
// Nothing here is ever sent to the app.
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let transport: Transporter | null = null;

/** Everything needed to send is set in server/.env. */
export function mailReady(): boolean {
  const m = env.mail;
  return Boolean(m.ownerEmail && m.host && m.port && m.from);
}

function getTransport(): Transporter {
  if (transport) return transport;
  const m = env.mail;
  const local = m.host === 'localhost' || m.host === '127.0.0.1';
  transport = nodemailer.createTransport({
    host: m.host,
    port: m.port,
    secure: m.port === 465, // 465: TLS from the start; 587: STARTTLS (required below)
    requireTLS: !local && m.port !== 465,
    auth: m.user ? { user: m.user, pass: m.pass } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  return transport;
}

/**
 * Sends one email with one Word attachment to OWNER_EMAIL. Resolves only when the email provider
 * has accepted the message for OWNER_EMAIL; throws otherwise.
 */
export async function sendToOwner(mail: { subject: string; text: string; fileName: string; file: Buffer }) {
  const to = env.mail.ownerEmail;
  const info = await getTransport().sendMail({
    from: env.mail.from,
    to,
    subject: mail.subject,
    text: mail.text,
    attachments: [{ filename: mail.fileName, content: mail.file, contentType: DOCX }],
  });
  const accepted = (info.accepted ?? []).map((a) => (typeof a === 'string' ? a : a.address).toLowerCase());
  if (!accepted.includes(to.toLowerCase())) throw new Error('The email provider did not accept the recipient');
  return { to, messageId: info.messageId };
}

/** For tests: drop the cached connection settings. */
export function resetMailer() {
  transport = null;
}
