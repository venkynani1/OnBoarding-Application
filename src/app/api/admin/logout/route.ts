import { NextResponse } from 'next/server';
import { clear } from '@/lib/auth';
export async function POST() { const res = NextResponse.json({ ok: true }); clear(res, 'admin'); return res; }
