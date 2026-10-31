'use client';
import { useActionState } from 'react';
import { mfaAction, type LoginState } from '../login/actions';
export default function MfaPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(mfaAction, {});
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-lg font-semibold">Two-factor verification</h1>
        <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
        <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required className="input text-center text-lg tracking-[0.4em]" />
        {state.error && <p role="alert" className="text-sm text-neg">{state.error}</p>}
        <button className="btn-primary w-full py-2" disabled={pending}>Verify</button>
      </form>
    </div>
  );
}
