import { q, log } from './db';
import { AppError } from './http';

export interface Row {
  emp_id: string; emp_name: string; onboarded_on: string | null; onboarded_raw: string | null; location: string | null;
  checked_in_at: Date | null; collected_at: Date | null; collected_by: string | null;
}
const COLS = `emp_id, emp_name, to_char(onboarded_on, 'YYYY-MM-DD') as onboarded_on, onboarded_raw, location, checked_in_at, collected_at, collected_by`;

export async function find(emp: string): Promise<Row | null> {
  const r = await q<Row>(`select ${COLS} from onboard.participants where emp_id = $1`, [emp]);
  return r[0] ?? null;
}

/** What a phone / desk lookup sees for one person. */
export function view(p: Row | null, emp: string) {
  if (!p) return { status: 'not_found' as const, employee_id: emp, name: null };
  return {
    status: p.collected_at ? ('collected' as const) : ('pending' as const),
    employee_id: p.emp_id, name: p.emp_name, location: p.location,
    onboarded_on: p.onboarded_on ?? p.onboarded_raw,
    collected_at: p.collected_at, collected_by: p.collected_by,
    in_queue: !!p.checked_in_at && !p.collected_at,
  };
}

/** Participant scanned the QR and entered their ID: join the shared queue (if not collected yet). */
export async function checkIn(emp: string) {
  const r = await q<Row>(
    `update onboard.participants set checked_in_at = coalesce(checked_in_at, now()), updated_at = now()
      where emp_id = $1 and collected_at is null returning ${COLS}`, [emp]);
  if (r[0]) return r[0];
  return find(emp);
}

/** Only the first "Collected" tap counts. */
export async function markCollected(emp: string, by: string) {
  const r = await q<Row>(
    `update onboard.participants set collected_at = now(), collected_by = $2, checked_in_at = coalesce(checked_in_at, now()), updated_at = now()
      where emp_id = $1 and collected_at is null returning ${COLS}`, [emp, by]);
  if (r[0]) { await log('collected', emp, by); return r[0]; }
  const p = await find(emp);
  if (!p) throw new AppError(404, `${emp} is not on the onboarding list`);
  const at = p.collected_at ? new Date(p.collected_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '';
  throw new AppError(409, `${p.emp_name} already collected at ${at}${p.collected_by ? ` (by ${p.collected_by})` : ''}`);
}

/** Undo a "Collected" tap; desks may only undo within 15 minutes, organizers any time. Person goes back in the queue. */
export async function undoCollected(emp: string, by: string, anyTime = false) {
  const r = await q<Row>(
    `update onboard.participants set collected_at = null, collected_by = null, checked_in_at = now(), updated_at = now()
      where emp_id = $1 and collected_at is not null ${anyTime ? '' : "and collected_at > now() - interval '15 minutes'"} returning ${COLS}`, [emp]);
  if (!r[0]) throw new AppError(409, anyTime ? 'Nothing to undo' : 'Can only undo within 15 minutes — ask an organizer');
  await log('undo', emp, by);
  return r[0];
}

/** Remove from the queue without collecting (e.g. walked away). They can scan again later. */
export async function skip(emp: string, by: string) {
  await q(`update onboard.participants set checked_in_at = null, updated_at = now() where emp_id = $1 and collected_at is null`, [emp]);
  await log('skip', emp, by);
}

export async function counts(location?: string | null) {
  const r = await q<{ total: string; collected: string; waiting: string }>(
    `select count(*) total, count(collected_at) collected,
            count(*) filter (where checked_in_at is not null and collected_at is null) waiting
       from onboard.participants where ($1::text is null or location = $1)`, [location || null]);
  return { total: Number(r[0].total), collected: Number(r[0].collected), waiting: Number(r[0].waiting) };
}

export async function locations(): Promise<string[]> {
  const r = await q<{ location: string }>(`select distinct location from onboard.participants where location is not null and location <> '' order by 1`);
  return r.map((x) => x.location);
}
