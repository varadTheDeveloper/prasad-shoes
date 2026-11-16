import 'dotenv/config';

function need(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name} (see server/.env.example)`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: need('DATABASE_URL'),
  /** Used only by `npm run migrate` (owner role that may CREATE / ALTER). Falls back to DATABASE_URL. */
  migrateDatabaseUrl: process.env.MIGRATE_DATABASE_URL || need('DATABASE_URL'),
  jwtSecret: need('JWT_SECRET'),
  jwtDays: Number(process.env.JWT_DAYS ?? 7),
  /** Comma-separated origins allowed to call the API from a browser (only needed in development). */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  isProd: process.env.NODE_ENV === 'production',
  /** The website's own address, e.g. https://144-24-139-223.sslip.io – used in the "Forgot password?" email link.
   *  Fixed here (never taken from the request) so a fake Host header cannot send the owner a link to another site. */
  publicUrl: (process.env.PUBLIC_URL ?? '').trim().replace(/\/+$/, ''),
  /** "Send to Owner" email (optional: without it the button answers "Email is not set up"). Server only. */
  mail: {
    /** One or more addresses, comma-separated: OWNER_EMAIL=owner@gmail.com,tester@gmail.com */
    ownerEmails: (process.env.OWNER_EMAIL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)),
    resendKey: (process.env.RESEND_API_KEY ?? '').trim(),
    resendUrl: (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/+$/, ''),
    from: (process.env.EMAIL_FROM ?? '').trim(),
  },
};
