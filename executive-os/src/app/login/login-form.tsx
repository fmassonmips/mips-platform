'use client';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';
export function LoginForm({ demo }: { demo: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required className="input" defaultValue={demo ? 'ceo@mips.demo' : ''} /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
      {state.error && <p role="alert" className="text-sm text-neg">{state.error}</p>}
      <button type="submit" className="btn-primary w-full py-2" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
