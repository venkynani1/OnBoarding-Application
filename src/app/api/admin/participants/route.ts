import type { NextRequest } from 'next/server';
import { handler, json } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { locations } from '@/lib/participants';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req: NextRequest) => {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const search = (sp.get('q') ?? '').trim();
  const status = sp.get('status') ?? 'all';
  const loc = sp.get('location') || null;
  const page = Math.max(0, Number(sp.get('page')) || 0);
  const where = `where ($1 = '' or emp_id ilike '%' || $1 || '%' or emp_name ilike '%' || $1 || '%')
      and ($2 = 'all' or ($2 = 'collected' and collected_at is not null) or ($2 = 'pending' and collected_at is null)
           or ($2 = 'waiting' and collected_at is null and checked_in_at is not null))
      and ($3::text is null or location = $3)`;
  const [rows, total, locs] = await Promise.all([
    q(`select emp_id, emp_name, to_char(onboarded_on,'YYYY-MM-DD') onboarded_on, onboarded_raw, location, checked_in_at, collected_at, collected_by
         from onboard.participants ${where} order by collected_at desc nulls last, emp_name limit 50 offset $4`, [search, status, loc, page * 50]),
    q<{ n: number }>(`select count(*)::int n from onboard.participants ${where}`, [search, status, loc]),
    locations(),
  ]);
  return json({ rows, total: total[0].n, page, locations: locs });
});
