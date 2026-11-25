import { NextResponse, type NextRequest } from 'next/server';
import { AppError, body, clientIp, handler, json } from '@/lib/http';
import { checkAdminPassword, isAdmin, setAdmin } from '@/lib/auth';
import { rateLimit } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const GET = handler(async () => json({ signed_in: await isAdmin() }));
export const POST = handler(async (req: NextRequest) => {
  const { password } = await body<{ password?: string }>(req);
  if (!(await rateLimit(`admin:${clientIp(req)}`, 10, 900))) throw new AppError(429, 'Too many attempts. Wait 15 minutes.');
  if (!password || !checkAdminPassword(password)) throw new AppError(401, 'Wrong password');
  const res = NextResponse.json({ ok: true });
  setAdmin(res);
  return res;
});
