'use client';
import { useActionState } from 'react';
import { uploadAction, batchAction, type IState } from './actions';

export function UploadForm({ kinds }: { kinds: { key: string; label: string }[] }) {
  const [s, action, pending] = useActionState<IState, FormData>(uploadAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div><label className="label" htmlFor="file">File (CSV or XLSX, ≤ 20 MB)</label><input id="file" name="file" type="file" accept=".csv,.txt,.tsv,.xlsx" required className="input" /></div>
      <div><label className="label" htmlFor="kind">Import type</label><select id="kind" name="kind" className="input"><option value="auto">Detect automatically</option>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></div>
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Uploading…' : 'Upload & detect schema'}</button>
      {s.error && <p role="alert" className="w-full text-sm text-neg">{s.error}</p>}
    </form>
  );
}

export function BatchOp({ id, op, label, tone = 'btn', extra, confirmText }: { id: string; op: string; label: string; tone?: string; extra?: React.ReactNode; confirmText?: string }) {
  const [s, action, pending] = useActionState<IState, FormData>(batchAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" onSubmit={(e) => { if (confirmText && !confirm(confirmText)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />{extra}
      <button type="submit" className={tone} disabled={pending}>{pending ? 'Working…' : label}</button>
      {s.error && <span role="alert" className="text-xs text-neg">{s.error}</span>}{s.ok && <span className="text-xs text-pos">{s.ok}</span>}
    </form>
  );
}

export function MappingForm({ id, kind, kinds, fields, columns, mapping, disabled }: { id: string; kind: string; kinds: { key: string; label: string }[]; fields: { key: string; label: string; required?: boolean }[]; columns: string[]; mapping: Record<string, string>; disabled: boolean }) {
  const [s, action, pending] = useActionState<IState, FormData>(batchAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="map" />
      <div className="max-w-xs"><label className="label" htmlFor="m-kind">Target</label><select id="m-kind" name="kind" className="input" defaultValue={kind} disabled={disabled}>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select><p className="mt-1 text-2xs text-muted">Changing the target re-applies mapping on save.</p></div>
      <div className="grid gap-2 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key}><label className="label" htmlFor={`map_${f.key}`}>{f.label}{f.required && <span className="text-neg"> *</span>}</label>
            <select id={`map_${f.key}`} name={`map_${f.key}`} className="input" defaultValue={mapping[f.key] ?? ''} disabled={disabled}><option value="">— not mapped —</option>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        ))}
      </div>
      {!disabled && <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Validating…' : 'Save mapping & validate'}</button>}
      {s.error && <p role="alert" className="text-sm text-neg">{s.error}</p>}{s.ok && <p className="text-sm text-pos">Mapping saved and batch validated.</p>}
    </form>
  );
}
