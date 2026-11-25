import type { NextRequest } from 'next/server';
import { AppError, handler, json, normEmp } from '@/lib/http';
import { checkCollectToken } from '@/lib/auth';
import { find, view } from '@/lib/participants';
export const dynamic = 'force-dynamic';
/** The waiting phone polls this to flip to "Collected" when the desk taps it. */
export const GET = handler(async (req: NextRequest) => {
  const emp = normEmp(req.nextUrl.searchParams.get('emp'));
  if (!checkCollectToken(emp, req.nextUrl.searchParams.get('t') ?? '')) throw new AppError(401, 'Please enter your employee ID again');
  return json(view(await find(emp), emp));
});
