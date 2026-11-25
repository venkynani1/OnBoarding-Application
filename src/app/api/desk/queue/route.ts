import type { NextRequest } from 'next/server';
import { handler, json, normEmp } from '@/lib/http';
import { requireDesk } from '@/lib/auth';
import { q } from '@/lib/db';
import { counts, find, locations, view } from '@/lib/participants';
export const dynamic = 'force-dynamic';
/** Shared live queue for every distributor (polled every few seconds). ?emp= looks one person up. */
export const GET = handler(async (req: NextRequest) => {
  await requireDesk();
  const sp = req.nextUrl.searchParams;
  const emp = sp.get('emp');
  if (emp !== null) { const e = normEmp(emp); return json({ person: view(await find(e), e) }); }
  const loc = sp.get('location') || null;
  const [queue, recent, c, locs] = await Promise.all([
    q(`select emp_id employee_id, emp_name name, location, coalesce(to_char(onboarded_on,'YYYY-MM-DD'), onboarded_raw) onboarded_on, checked_in_at
         from onboard.participants where checked_in_at is not null and collected_at is null and ($1::text is null or location = $1)
        order by checked_in_at limit 200`, [loc]),
    q(`select emp_id employee_id, emp_name name, location, collected_at, collected_by
         from onboard.participants where collected_at is not null and ($1::text is null or location = $1)
        order by collected_at desc limit 12`, [loc]),
    counts(loc),
    locations(),
  ]);
  return json({ queue, recent, ...c, locations: locs, at: new Date().toISOString() });
});
