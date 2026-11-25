import type { NextRequest } from 'next/server';
import { AppError, body, handler, json } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { q, log } from '@/lib/db';
export const dynamic = 'force-dynamic';
/** Change the desk PIN. Signs every distributor out. */
export const POST = handler(async (req: NextRequest) => {
  const { pin } = await body<{ pin?: string }>(req);
  await requireAdmin();
  if (!pin || !/^\d{4,8}$/.test(pin)) throw new AppError(400, 'PIN must be 4–8 digits');
  await q(`update onboard.settings set v = $1 where k = 'desk_pin'`, [pin]);
  await q(`update onboard.settings set v = (v::int + 1)::text where k = 'desk_pin_version'`);
  await log('desk_pin_changed', null, 'Organizer');
  return json({ ok: true, pin });
});
