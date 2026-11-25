import { NextResponse, type NextRequest } from 'next/server';
import { handler, sameOrigin } from '@/lib/http';
import { requireDesk, setDesk } from '@/lib/auth';
import { log } from '@/lib/db';
export const dynamic = 'force-dynamic';
/** This distributor is done; they can still download the report. Other desks carry on. */
export const POST = handler(async (req: NextRequest) => {
  sameOrigin(req);
  const d = await requireDesk();
  const res = NextResponse.json({ ok: true });
  setDesk(res, d.name, d.version, true);
  await log('desk_finished', null, d.name);
  return res;
});
