import { handler } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { templateXlsx, xlsxResponse } from '@/lib/excel';
export const dynamic = 'force-dynamic';
export const GET = handler(async () => { await requireAdmin(); return xlsxResponse(await templateXlsx(), 'onboarded-template.xlsx'); });
