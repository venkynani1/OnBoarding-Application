import type { NextRequest } from 'next/server';
import { AppError, handler, json, sameOrigin } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { db, log } from '@/lib/db';
import { parseImport } from '@/lib/excel';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Upload the onboarded list. mode=merge adds new people and updates existing ones (collected status is kept).
 *  mode=replace also removes people who are not in the file — except those who already collected. */
export const POST = handler(async (req: NextRequest) => {
  sameOrigin(req);
  await requireAdmin();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const mode = form?.get('mode') === 'replace' ? 'replace' : 'merge';
  const dry = form?.get('dry') === '1';
  if (!(file instanceof File)) throw new AppError(400, 'Choose an Excel file to upload');
  if (file.size > 8 * 1024 * 1024) throw new AppError(400, 'File is too large (max 8 MB)');
  let parsed;
  try { parsed = await parseImport(Buffer.from(await file.arrayBuffer()), file.name); }
  catch (e) { throw new AppError(400, (e as Error).message); }
  const { rows, problems, columns } = parsed;
  if (!rows.length) throw new AppError(400, problems.length ? `No usable rows. ${problems.slice(0, 3).map((p) => `Row ${p.row}: ${p.reason}`).join('; ')}` : 'The file has no rows under the header');

  const client = await db().connect();
  try {
    await client.query('begin');
    const up = await client.query<{ inserted: boolean }>(
      `insert into onboard.participants (emp_id, emp_name, onboarded_on, onboarded_raw, location)
       select * from unnest($1::text[], $2::text[], $3::date[], $4::text[], $5::text[])
       on conflict (emp_id) do update set emp_name = excluded.emp_name, onboarded_on = excluded.onboarded_on,
         onboarded_raw = excluded.onboarded_raw, location = excluded.location, updated_at = now()
       where (participants.emp_name, participants.onboarded_on, participants.onboarded_raw, participants.location)
         is distinct from (excluded.emp_name, excluded.onboarded_on, excluded.onboarded_raw, excluded.location)
       returning (xmax = 0) as inserted`,
      [rows.map((r) => r.emp_id), rows.map((r) => r.emp_name), rows.map((r) => r.onboarded_on), rows.map((r) => r.onboarded_raw), rows.map((r) => r.location)]);
    const added = up.rows.filter((r) => r.inserted).length;
    const updated = up.rows.length - added;
    let removed = 0, keptCollected = 0;
    if (mode === 'replace') {
      const del = await client.query(`delete from onboard.participants where collected_at is null and not (emp_id = any($1::text[]))`, [rows.map((r) => r.emp_id)]);
      removed = del.rowCount ?? 0;
      const k = await client.query<{ n: number }>(`select count(*)::int n from onboard.participants where not (emp_id = any($1::text[]))`, [rows.map((r) => r.emp_id)]);
      keptCollected = k.rows[0].n;
    }
    const total = (await client.query<{ n: number }>('select count(*)::int n from onboard.participants')).rows[0].n;
    if (dry) { await client.query('rollback'); }
    else {
      await client.query('commit');
      await log('import', null, 'Organizer', `${file.name}: ${rows.length} rows, +${added} new, ${updated} updated${mode === 'replace' ? `, ${removed} removed` : ''}`);
    }
    return json({ dry, mode, file: file.name, columns, rows: rows.length, added, updated, unchanged: rows.length - added - updated, removed, kept_collected: keptCollected, total, problems: problems.slice(0, 200), problem_count: problems.length });
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally { client.release(); }
});
