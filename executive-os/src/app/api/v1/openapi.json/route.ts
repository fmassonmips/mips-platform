import { NextResponse } from 'next/server';
import { OPENAPI } from '@/lib/openapi';
export const dynamic = 'force-static';
export function GET() { return NextResponse.json(OPENAPI); }
