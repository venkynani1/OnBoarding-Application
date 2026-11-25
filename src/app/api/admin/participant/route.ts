import type { NextRequest } from 'next/server';
import { AppError, body, handler, json, normEmp } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { q, log } from '@/lib/db';
import { parseDate } from '@/lib/excel';
export const dynamic = 'force-dynamic';
/** Add one person (e.g. a late joiner at the desk) or delete one who hasn't collected. */
export const POST = handler(async (req: NextRequest) => {
  const b = await body<{ action?: string; employee_id?: string; name?: string; date?: string; location?: string }>(req);
  await requireAdmin();
  const emp = normEmp(b.employee_id);
  if (!emp) throw new AppError(400, 'Employee ID missing');
  if (b.action === 'delete') {
    const r = await q(`delete from onboard.participants where emp_id = $1 and collected_at is null returning emp_id`, [emp]);
    if (!r.length) throw new AppError(409, 'Not found, or already collected (undo the collection first)');
    await log('delete', emp, 'Organizer');
    return json({ ok: true });
  }
  const name = (b.name ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2) throw new AppError(400, 'Enter the employee name');
  const d = parseDate(b.date?.trim() || null);
  await q(`insert into onboard.participants (emp_id, emp_name, onboarded_on, onboarded_raw, location) values ($1,$2,$3,$4,$5)
           on conflict (emp_id) do update set emp_name = excluded.emp_name, onboarded_on = excluded.onboarded_on,
             onboarded_raw = excluded.onboarded_raw, location = excluded.location, updated_at = now()`,
    [emp, name.slice(0, 120), d.on, d.raw, (b.location ?? '').trim().slice(0, 80) || null]);
  await log('add', emp, 'Organizer', name);
  return json({ ok: true });
});
