import { NextResponse, type NextRequest } from 'next/server';
import { AppError, body, clientIp, handler, json } from '@/lib/http';
import { currentDesk, setDesk } from '@/lib/auth';
import { rateLimit, setting, log } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const GET = handler(async () => {
  const d = await currentDesk();
  return json({ signed_in: !!d, name: d?.name ?? null, finished: d?.finished ?? false });
});
export const POST = handler(async (req: NextRequest) => {
  const b = await body<{ name?: string; pin?: string }>(req);
  const name = (b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (name.length < 2) throw new AppError(400, 'Enter your name');
  if (!(await rateLimit(`desk:${clientIp(req)}`, 10, 900))) throw new AppError(429, 'Too many wrong PINs. Wait 15 minutes.');
  const [pin, version] = await Promise.all([setting('desk_pin'), setting('desk_pin_version')]);
  if (!pin || b.pin !== pin) throw new AppError(401, 'Wrong desk PIN');
  const res = NextResponse.json({ ok: true });
  setDesk(res, name, version ?? '1');
  await log('desk_sign_in', null, name);
  return res;
});
