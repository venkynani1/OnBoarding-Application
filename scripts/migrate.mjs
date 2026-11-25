// Runs on every Vercel build: creates/updates the tables (safe to re-run).
import pg from 'pg';
import { readFileSync } from 'node:fs';

const url = process.env.NEON_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_UNPOOLED
  || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.log('[migrate] no database URL set — skipping'); process.exit(0); }

const u = new URL(url);
u.searchParams.delete('sslmode');
const local = ['localhost', '127.0.0.1'].includes(u.hostname);
const client = new pg.Client({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const r = await client.query('select count(*)::int n from onboard.participants');
console.log(`[migrate] schema ready on ${u.hostname} — ${r.rows[0].n} participants`);
await client.end();
