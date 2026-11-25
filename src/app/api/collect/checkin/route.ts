import type { NextRequest } from 'next/server';
import { AppError, body, clientIp, handler, json, normEmp } from '@/lib/http';
import { rateLimit } from '@/lib/db';
import { checkIn, view } from '@/lib/participants';
import { collectToken } from '@/lib/auth';
export const dynamic = 'force-dynamic';
/** Participant scanned the desk QR and typed their employee ID. */
export const POST = handler(async (req: NextRequest) => {
  const b = await body<{ employee_id?: string }>(req);
  const emp = normEmp(b.employee_id);
  if (emp.length < 2) throw new AppError(400, 'Enter your employee ID');
  // generous: a whole venue can share one Wi-Fi IP
  if (!(await rateLimit(`collect:${clientIp(req)}`, 400, 600))) throw new AppError(429, 'Too many tries from this network. Please wait a few minutes or go to the desk.');
  const p = await checkIn(emp);
  const v = view(p, emp);
  return json({ ...v, token: p ? collectToken(emp) : null });
});
