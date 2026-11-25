import { handler } from '@/lib/http';
import { requireDeskOrAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { reportXlsx, xlsxResponse, type ReportPerson } from '@/lib/excel';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = handler(async () => {
  const by = await requireDeskOrAdmin();
  const people = await q<ReportPerson>(`select emp_id, emp_name, to_char(onboarded_on,'YYYY-MM-DD') onboarded_on, onboarded_raw, location, checked_in_at, collected_at, collected_by
      from onboard.participants order by location nulls last, emp_name`);
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 16).replace(/[: ]/g, '-');
  return xlsxResponse(await reportXlsx(people, by), `onboard-goodies-report-${stamp}.xlsx`);
});
