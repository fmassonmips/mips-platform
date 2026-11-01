'use client';
import { useActionState } from 'react';
import { createAgreementAction, type AgreementState } from './actions';

export function AgreementForm({ merchantId, methods, defaultFrom, minFrom, constrained, constraint }: { merchantId: string; methods: { id: string; name: string }[]; defaultFrom: string; minFrom: string; constrained: boolean; constraint: string | null }) {
  const [state, action, pending] = useActionState<AgreementState, FormData>(createAgreementAction, { ok: false, message: null });
  const err = (k: string) => state.errors?.[k] ? <div className="mt-0.5 text-2xs text-neg">{state.errors[k]}</div> : null;
  return (
    <form action={action} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="merchantId" value={merchantId} />
      <div><label className="label" htmlFor="paymentMethodId">Payment method</label>
        <select id="paymentMethodId" name="paymentMethodId" className="input" defaultValue=""><option value="">All methods</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>{err('paymentMethodId')}</div>
      <div><label className="label" htmlFor="cardRegion">Card region</label>
        <select id="cardRegion" name="cardRegion" className="input" defaultValue="any"><option value="any">Any</option><option value="domestic">Domestic</option><option value="international">International</option></select>{err('cardRegion')}</div>
      <div><label className="label" htmlFor="mdrBps">MDR (bps) — 175 = 1.75 %</label><input id="mdrBps" name="mdrBps" className="input" inputMode="decimal" required placeholder="e.g. 295" />{err('mdrBps')}</div>
      <div><label className="label" htmlFor="effectiveFrom">Effective from (≥ {minFrom})</label><input id="effectiveFrom" name="effectiveFrom" type="date" className="input" min={minFrom} defaultValue={defaultFrom} required />{err('effectiveFrom')}</div>
      <div><label className="label" htmlFor="fixedFee">Fixed fee per txn (MUR)</label><input id="fixedFee" name="fixedFee" className="input" inputMode="decimal" placeholder="0" />{err('fixedFee')}</div>
      <div><label className="label" htmlFor="monthlySaasFee">Monthly SaaS fee (MUR)</label><input id="monthlySaasFee" name="monthlySaasFee" className="input" inputMode="decimal" placeholder="0 — only on All methods / Any" />{err('monthlySaasFee')}</div>
      <div><label className="label" htmlFor="contractRef">Contract reference</label><input id="contractRef" name="contractRef" className="input" required placeholder="e.g. PA-M001-2026-11" />{err('contractRef')}</div>
      <div><label className="label" htmlFor="note">Note (audit trail)</label><input id="note" name="note" className="input" placeholder="reason / approval reference" />{err('note')}</div>
      {constrained && (
        <label className="col-span-2 flex items-start gap-2 rounded border border-warn/40 bg-warn/5 p-2 text-xs md:col-span-4">
          <input type="checkbox" name="constraintAck" className="mt-0.5" />
          <span>I confirm this change complies with the contractual constraint: <b>{constraint}</b> (notice served / review window reached). The confirmation is recorded in the audit trail.</span>
        </label>
      )}
      <div className="col-span-2 flex flex-wrap items-center gap-3 md:col-span-4">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Create agreement'}</button>
        {state.message && <span className={`text-sm ${state.ok ? 'text-pos' : 'text-neg'}`} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
