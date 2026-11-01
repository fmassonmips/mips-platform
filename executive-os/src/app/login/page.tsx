import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await getAuth()) redirect('/executive');
  const demo = process.env.SHOW_DEMO_HINT !== 'false';
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg bg-gold text-lg font-black text-navy">M</div>
          <h1 className="text-xl font-semibold text-white">MIPS Executive OS</h1>
          <p className="mt-1 text-sm text-white/60">Financial intelligence · Payment economics · Executive decisions</p>
        </div>
        <div className="card p-6"><LoginForm demo={demo} /></div>
        {demo && <p className="mt-4 text-center text-xs text-white/50">Demo accounts: ceo@, cfo@, finance@, analyst@, auditor@, admin@mips.demo — password set at seed time (default <code>Demo-Passw0rd-2026</code>).</p>}
      </div>
    </div>
  );
}
