'use client';
import { useFormStatus } from 'react-dom';
import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return <button type="button" className="btn no-print" onClick={() => window.print()}><Printer className="h-4 w-4" />{label}</button>;
}

/** Submit button with an explicit pending state (disabled while the server action runs). */
export function SubmitButton({ children, pendingLabel, className = 'btn-primary', name, value, confirm }: { children: ReactNode; pendingLabel?: string; className?: string; name?: string; value?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} className={className} disabled={pending} aria-busy={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? pendingLabel ?? 'Saving…' : children}
    </button>
  );
}

/** Select that submits its form on change (GET filters). */
export function AutoSubmitSelect({ name, defaultValue, options, label }: { name: string; defaultValue: string; options: { value: string; label: string }[]; label: string }) {
  return (
    <select name={name} aria-label={label} defaultValue={defaultValue} className="input w-auto py-1 text-xs" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
