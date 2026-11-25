import type { NextRequest } from 'next/server';
import { AppError, body, handler, json, normEmp } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { markCollected, undoCollected, view } from '@/lib/participants';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req: NextRequest) => {
  const b = await body<{ employee_id?: string; action?: string }>(req);
  await requireAdmin();
  const emp = normEmp(b.employee_id);
  if (!emp) throw new AppError(400, 'Employee ID missing');
  const p = b.action === 'undo' ? await undoCollected(emp, 'Organizer', true) : await markCollected(emp, 'Organizer');
  return json(view(p, emp));
});
