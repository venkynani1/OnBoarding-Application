import type { NextRequest } from 'next/server';
import { AppError, body, handler, json, normEmp } from '@/lib/http';
import { requireDesk } from '@/lib/auth';
import { markCollected, skip, undoCollected } from '@/lib/participants';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req: NextRequest) => {
  const b = await body<{ employee_id?: string; action?: string }>(req);
  const d = await requireDesk();
  const emp = normEmp(b.employee_id);
  if (!emp) throw new AppError(400, 'Employee ID missing');
  if (b.action === 'collect') await markCollected(emp, d.name);
  else if (b.action === 'undo') await undoCollected(emp, d.name);
  else if (b.action === 'skip') await skip(emp, d.name);
  else throw new AppError(400, 'Unknown action');
  return json({ ok: true });
});
