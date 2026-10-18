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
};
