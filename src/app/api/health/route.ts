import { q } from '@/lib/db';
import { json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await q('select 1 from onboard.settings limit 1'); return json({ ok: true, db: 'ok' }); }
  catch (e) { console.error('[onboard] health', e); return json({ ok: false, db: 'error', message: (e as Error).message }, 503); }
}
