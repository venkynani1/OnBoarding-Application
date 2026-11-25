import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './http';
import { setting } from './db';

const ADMIN_COOKIE = 'og_admin';
const DESK_COOKIE = 'og_desk';
const HOURS = 14;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is not set');
  return s;
}
export const sign = (scope: string, body: string) => createHmac('sha256', secret()).update(`${scope}:${body}`).digest('base64url');

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function issue(res: NextResponse, name: string, scope: string, payload: object) {
  const body = Buffer.from(JSON.stringify({ ...payload, x: Math.floor(Date.now() / 1000) + HOURS * 3600 })).toString('base64url');
  res.cookies.set(name, `${body}.${sign(scope, body)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: HOURS * 3600,
  });
}
export function clear(res: NextResponse, which: 'admin' | 'desk') {
  res.cookies.set(which === 'admin' ? ADMIN_COOKIE : DESK_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

async function read<T>(name: string, scope: string): Promise<T | null> {
  const raw = (await cookies()).get(name)?.value ?? '';
  const [body, sig] = raw.split('.');
  if (!body || !sig || !safeEq(sig, sign(scope, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { x: number };
    return p.x > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

// ---- organizer (admin) ----
export function checkAdminPassword(pw: string) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want) throw new AppError(500, 'ADMIN_PASSWORD is not configured');
  return safeEq(sign('pw', pw), sign('pw', want));
}
export const setAdmin = (res: NextResponse) => issue(res, ADMIN_COOKIE, 'admin', { a: 1 });
export async function isAdmin() { return !!(await read<{ a: number }>(ADMIN_COOKIE, 'admin')); }
export async function requireAdmin() { if (!(await isAdmin())) throw new AppError(401, 'Please sign in again'); }

// ---- distribution desk: distributor name + shared desk PIN; changing the PIN signs everyone out ----
export const setDesk = (res: NextResponse, name: string, version: string, finished = false) =>
  issue(res, DESK_COOKIE, 'desk', { n: name, v: version, f: finished });

export async function currentDesk(): Promise<{ name: string; finished: boolean; version: string } | null> {
  const p = await read<{ n: string; v: string; f?: boolean }>(DESK_COOKIE, 'desk');
  if (!p) return null;
  if ((await setting('desk_pin_version')) !== p.v) return null;
  return { name: p.n, finished: !!p.f, version: p.v };
}
export async function requireDesk(opts: { allowFinished?: boolean } = {}) {
  const d = await currentDesk();
  if (!d) throw new AppError(401, 'Sign in to the desk again');
  if (d.finished && !opts.allowFinished) throw new AppError(403, 'You have finished distributing. Sign in again to continue.');
  return d;
}

/** Desk OR organizer — for the shared report download. */
export async function requireDeskOrAdmin() {
  if (await isAdmin()) return 'Organizer';
  const d = await requireDesk({ allowFinished: true });
  return d.name;
}

/** Short-lived token the participant's phone gets after check-in, so status polling can't be used to look up names. */
export const collectToken = (emp: string) => sign('collect', emp).slice(0, 22);
export const checkCollectToken = (emp: string, t: string) => safeEq(collectToken(emp), t || '');
