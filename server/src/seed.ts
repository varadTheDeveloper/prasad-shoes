// npm run seed -- --name "Owner" --mobile 7020861805 --password "your-password"
// Creates (or resets) an owner (ADMIN) account. Safe to run again.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { env } from './env';
import { normaliseMobile } from '../../shared/parser';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : process.env[`OWNER_${name.toUpperCase()}`];
}

async function main() {
  const name = arg('name') ?? 'Owner';
  const mobile = normaliseMobile(arg('mobile') ?? '');
  const password = arg('password') ?? '';
  if (!mobile) throw new Error('Give a 10-digit mobile: --mobile 7020861805');
  if (password.length < 6) throw new Error('Give a password of at least 6 characters: --password "..."');

  const client = new pg.Client({ connectionString: env.databaseUrl });
  await client.connect();
  const hash = await bcrypt.hash(password, 10);
  const r = await client.query(
    `INSERT INTO users (name, mobile, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 'ADMIN', FALSE)
     ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
       role = 'ADMIN', is_active = TRUE, must_change_password = FALSE, failed_logins = 0, locked_until = NULL, updated_at = now()
     RETURNING id`,
    [name, mobile, hash],
  );
  console.log(`Owner account ready: ${name} (${mobile}), id ${r.rows[0].id}`);
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
