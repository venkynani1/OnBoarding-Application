import { handler, json } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { q, setting } from '@/lib/db';
import { counts } from '@/lib/participants';
export const dynamic = 'force-dynamic';
export const GET = handler(async () => {
  await requireAdmin();
  const [c, byLoc, byDate, pin, recent] = await Promise.all([
    counts(),
    q<{ location: string | null; total: number; collected: number }>(
      `select location, count(*)::int total, count(collected_at)::int collected from onboard.participants group by 1 order by 1 nulls last`),
    q<{ d: string | null; total: number; collected: number }>(
      `select coalesce(to_char(onboarded_on,'YYYY-MM-DD'), onboarded_raw) d, count(*)::int total, count(collected_at)::int collected
         from onboard.participants group by 1 order by 1 nulls last`),
    setting('desk_pin'),
    q(`select at, emp_id, action, actor, detail from onboard.activity order by id desc limit 15`),
  ]);
  return json({ ...c, by_location: byLoc, by_date: byDate, desk_pin: pin, activity: recent });
});
