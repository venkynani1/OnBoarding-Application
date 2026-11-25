import pg from 'pg';

let pool: pg.Pool | null = null;

/** Shared connection pool. DATABASE_URL points at the Supabase transaction pooler as the onboard_app role. */
export function db(): pg.Pool {
  if (pool) return pool;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');
  const url = new URL(raw);
  const local = process.env.DB_SSL === 'off' || ['localhost', '127.0.0.1'].includes(url.hostname) || url.hostname.startsWith('/');
  url.searchParams.delete('sslmode');
  pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (e) => console.error('[onboard] pg pool error', e.message));
  return pool;
}

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db().query<T>(sql, params);
  return r.rows;
}

export async function setting(k: string): Promise<string | null> {
  const r = await q<{ v: string }>('select v from onboard.settings where k = $1', [k]);
  return r[0]?.v ?? null;
}

export async function log(action: string, empId: string | null, actor: string | null, detail?: string) {
  await q('insert into onboard.activity (action, emp_id, actor, detail) values ($1, $2, $3, $4)', [action, empId, actor, detail ?? null]);
}

/** Fixed-window rate limit kept in the database (works across serverless instances). */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const r = await q<{ n: number }>(
    `insert into onboard.rate (k, n, window_start) values ($1, 1, now())
     on conflict (k) do update set
       n = case when onboard.rate.window_start < now() - make_interval(secs => $2) then 1 else onboard.rate.n + 1 end,
       window_start = case when onboard.rate.window_start < now() - make_interval(secs => $2) then now() else onboard.rate.window_start end
     returning n`, [key, windowSec]);
  return (r[0]?.n ?? 0) <= max;
}
