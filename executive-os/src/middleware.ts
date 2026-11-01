import { NextResponse, type NextRequest } from 'next/server';
/**
 * Edge middleware: cheap gate (session cookie presence) + API rate limiting.
 * Full session validation happens server-side in requireAuth()/apiAuth().
 */
const buckets = new Map<string, { tokens: number; ts: number }>();
const RATE = Number(process.env.API_RATE_PER_MIN ?? 240);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    const key = req.headers.get('authorization') ?? req.cookies.get('mips_eos_session')?.value ?? req.headers.get('x-forwarded-for') ?? 'anon';
    const now = Date.now(); const b = buckets.get(key) ?? { tokens: RATE, ts: now };
    b.tokens = Math.min(RATE, b.tokens + ((now - b.ts) / 60000) * RATE); b.ts = now;
    if (b.tokens < 1) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '10' } });
    b.tokens -= 1; buckets.set(key, b);
    if (buckets.size > 10000) buckets.clear();
    return NextResponse.next();
  }
  const open = pathname === '/login' || pathname === '/mfa' || pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname === '/forbidden' || /\/export(\/|$)/.test(pathname); // route handlers authenticate themselves (401/403 JSON)
  if (!open && !req.cookies.get('mips_eos_session')) return NextResponse.redirect(new URL('/login', req.url));
  const h = new Headers(req.headers); h.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: h } });
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
