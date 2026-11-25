import type { NextRequest } from 'next/server';
import { AppError, body, handler, json } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { q, log } from '@/lib/db';
export const dynamic = 'force-dynamic';
/** Start over: delete the whole list (collected records included). Needs the word DELETE. */
export const POST = handler(async (req: NextRequest) => {
  const { confirm } = await body<{ confirm?: string }>(req);
  await requireAdmin();
  if (confirm !== 'DELETE') throw new AppError(400, 'Type DELETE to confirm');
  const r = await q('delete from onboard.participants returning emp_id');
  await log('clear_all', null, 'Organizer', `${r.length} removed`);
  return json({ ok: true, removed: r.length });
});
