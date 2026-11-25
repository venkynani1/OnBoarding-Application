import { NextResponse, type NextRequest } from 'next/server';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });

/** Wrap a route handler: AppError -> its status, anything else -> 500 (logged). */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AppError) return json({ error: { message: e.message } }, e.status);
      console.error('[onboard]', e);
      return json({ error: { message: 'Something went wrong. Please try again.' } }, 500);
    }
  };
}

/** Reject cross-site POSTs (cookies are SameSite=Lax, this is belt and braces). */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (new URL(origin).host !== host) throw new AppError(403, 'Bad origin');
}

export async function body<T>(req: NextRequest): Promise<T> {
  sameOrigin(req);
  try { return (await req.json()) as T; } catch { throw new AppError(400, 'Invalid request'); }
}

export function clientIp(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}

export const IST = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export const DATE = (d: Date | string | null | undefined) =>
  d ? new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00Z' : d)
    .toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-') : '';

/** Employee IDs: trim, drop spaces, upper-case; Excel numbers like 12345.0 -> "12345". */
export function normEmp(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v);
  s = s.replace(/\s+/g, '').toUpperCase();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.slice(0, 40);
}
