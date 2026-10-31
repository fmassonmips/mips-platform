'use client';
import { useActionState } from 'react';
import { createScenarioAction, createDecisionAction, decisionWorkflowAction, type FormState } from './actions';

export interface FieldDef { key: string; label: string; hint?: string; kind?: string; value: string }

export function ScenarioForm({ template, fields, merchants, defaults }: { template: string; fields: FieldDef[]; merchants: { id: string; name: string }[]; defaults: { name: string; comparisonGroup: string; baseStart: string; baseEnd: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createScenarioAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="template" value={template} />
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label" htmlFor="name">Scenario name</label><input id="name" name="name" className="input" defaultValue={defaults.name} required minLength={3} /></div>
        <div><label className="label" htmlFor="comparisonGroup">Comparison group (optional)</label><input id="comparisonGroup" name="comparisonGroup" className="input" defaultValue={defaults.comparisonGroup} placeholder="e.g. LAGOON-REPRICING-2026" /></div>
        <div><label className="label" htmlFor="baseStart">Base period start</label><input id="baseStart" name="baseStart" type="date" className="input" defaultValue={defaults.baseStart} /></div>
        <div><label className="label" htmlFor="baseEnd">Base period end</label><input id="baseEnd" name="baseEnd" type="date" className="input" defaultValue={defaults.baseEnd} /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={f.key}>{f.label}</label>
            {f.kind === 'merchant' ? (
              <select id={f.key} name={f.key} className="input" defaultValue={f.value} required><option value="" disabled>Select merchant…</option>{merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            ) : f.kind === 'bool' ? (
              <input id={f.key} name={f.key} type="checkbox" defaultChecked={f.value === 'true'} />
            ) : (
              <input id={f.key} name={f.key} className="input num" defaultValue={f.value} inputMode={f.kind === 'text' ? 'text' : 'decimal'} />
            )}
            {f.hint && <p className="mt-0.5 text-2xs text-muted">{f.hint}</p>}
          </div>
        ))}
      </div>
      <div><label className="label" htmlFor="description">Notes / assumptions rationale</label><textarea id="description" name="description" className="input" rows={2} /></div>
      {state.error && <p role="alert" className="text-sm text-neg">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Calculating…' : 'Run scenario'}</button>
    </form>
  );
}

export function DecisionForm({ scenarioId, users, defaults }: { scenarioId?: string; users: { id: string; name: string; role: string }[]; defaults: { title: string; description: string; rationale: string; deadline: string; evidence: string; owner?: string; approver?: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createDecisionAction, {});
  return (
    <form action={action} className="space-y-3">
      {scenarioId && <input type="hidden" name="scenarioId" value={scenarioId} />}
      <div><label className="label" htmlFor="title">Decision</label><input id="title" name="title" className="input" defaultValue={defaults.title} required minLength={5} /></div>
      <div><label className="label" htmlFor="d-description">Description</label><textarea id="d-description" name="description" className="input" rows={2} defaultValue={defaults.description} required minLength={10} /></div>
      <div><label className="label" htmlFor="rationale">Business rationale</label><textarea id="rationale" name="rationale" className="input" rows={3} defaultValue={defaults.rationale} required minLength={10} /></div>
      <div className="grid gap-3 md:grid-cols-3">
        <div><label className="label" htmlFor="ownerUserId">Decision / action owner</label><select id="ownerUserId" name="ownerUserId" className="input" defaultValue={defaults.owner ?? ''} required><option value="" disabled>Select…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></div>
        <div><label className="label" htmlFor="approverUserId">Approver</label><select id="approverUserId" name="approverUserId" className="input" defaultValue={defaults.approver ?? ''} required><option value="" disabled>Select…</option>{users.filter((u) => ['board_chair', 'ceo', 'admin'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></div>
        <div><label className="label" htmlFor="deadline">Implementation deadline</label><input id="deadline" name="deadline" type="date" className="input" defaultValue={defaults.deadline} required /></div>
      </div>
      <div><label className="label" htmlFor="evidence">Supporting evidence (one per line: kind|reference|note)</label><textarea id="evidence" name="evidence" className="input font-mono text-xs" rows={4} defaultValue={defaults.evidence} /></div>
      {state.error && <p role="alert" className="text-sm text-neg">{state.error}</p>}
      <button type="submit" className="btn-gold" disabled={pending}>{pending ? 'Recording…' : 'Record decision for approval'}</button>
    </form>
  );
}

export function WorkflowButton({ id, op, label, tone = 'btn', withNote, notePlaceholder }: { id: string; op: string; label: string; tone?: string; withNote?: boolean; notePlaceholder?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(decisionWorkflowAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />
      {withNote && <input name="note" className="input w-64 py-1 text-xs" placeholder={notePlaceholder ?? 'Note'} />}
      <button type="submit" className={tone} disabled={pending}>{pending ? '…' : label}</button>
      {state.error && <span role="alert" className="text-xs text-neg">{state.error}</span>}
    </form>
  );
}
