import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { const t0 = Date.now(); await pool().query('SELECT 1'); return NextResponse.json({ status: 'ok', db_ms: Date.now() - t0, version: process.env.APP_VERSION ?? '0.1.0' }); }
  catch { return NextResponse.json({ status: 'degraded', db: 'unreachable' }, { status: 503 }); }
}
