'use server';
/**
 * Bank reconciliation server actions. Prepare = treasury.reconcile;
 * approve / return = finance.approve. Approver ≠ preparer is enforced by the
 * database CHECK on reconciliations and surfaced as a readable message.
 * Nothing here posts to the GL or writes off a difference.
 */
import { z } from 'zod';
import { one, q, type Tx } from '@/lib/db';
import {
  treasuryAction, logAudit, UserError, findAccount, ensureRecon, reconById, assertOpen, runAutoMatch,
  clearExceptionsForMatch, storeReconTotals, reconSummary, validateManualMatch,
} from '@/lib/services/treasury';

const uuid = z.string().uuid();
const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const FALLBACK = '/cash-flow/reconciliation';

async function accountAndPeriod(t: Tx, form: FormData) {
  const p = z.object({ account: z.string().min(1).max(40), month: z.string().regex(monthRe, 'month must be YYYY-MM') }).parse({ account: form.get('account'), month: form.get('month') });
  const acc = await findAccount(t, p.account);
  if (!acc) throw new UserError('Unknown bank account.');
  return { acc, period: `${p.month}-01` };
}

export async function startReconAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const { acc, period } = await accountAndPeriod(t, form);
    const r = await ensureRecon(t, auth, acc.id, period);
    await storeReconTotals(t, r);
    return `Reconciliation for ${acc.code} ${period.slice(0, 7)} is ${r.status.replace('_', ' ')}.`;
  });
}

export async function autoMatchAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const { acc, period } = await accountAndPeriod(t, form);
    const r = await ensureRecon(t, auth, acc.id, period);
    const c = await runAutoMatch(t, auth, r);
    return `Auto-match complete (RECON v1): ${c.proposed_new} new proposal(s), ${c.proposed_kept} unchanged, ${c.proposed_dropped} stale removed; ${c.exceptions} exception(s) identified. Proposals still require confirmation.`;
  });
}

async function matchWithRecon(t: Tx, matchId: string) {
  const m = await one<{ id: string; reconciliation_id: string; status: string; difference: string; cardinality: string }>(t, 'SELECT id, reconciliation_id, status, difference::text, cardinality FROM recon_matches WHERE id = $1 FOR UPDATE', [matchId]);
  if (!m) throw new UserError('Match not found.');
  const recon = await reconById(t, m.reconciliation_id, true);
  assertOpen(recon);
  return { m, recon };
}

export async function confirmMatchAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const id = uuid.parse(form.get('matchId'));
    const { m, recon } = await matchWithRecon(t, id);
    if (m.status !== 'proposed') throw new UserError(`Only proposed matches can be confirmed (this one is ${m.status}).`);
    await t.query(`UPDATE recon_matches SET status = 'confirmed', confirmed_by = $2 WHERE id = $1`, [id, auth.userId]);
    await clearExceptionsForMatch(t, auth, recon.id, id);
    await storeReconTotals(t, recon);
    await logAudit(t, auth, 'treasury.recon_match_confirmed', 'reconciliation', recon.id, { match_id: id, cardinality: m.cardinality, difference: m.difference });
    return 'Match confirmed.';
  });
}

export async function confirmAllExactAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const recon = await reconById(t, uuid.parse(form.get('reconId')), true);
    assertOpen(recon);
    const ids = (await q<{ id: string }>(t, `SELECT id FROM recon_matches WHERE reconciliation_id = $1 AND status = 'proposed' AND difference = 0 AND cardinality = 'one_to_one' AND rule = 'reference_and_amount'`, [recon.id])).map((r) => r.id);
    for (const id of ids) {
      await t.query(`UPDATE recon_matches SET status = 'confirmed', confirmed_by = $2 WHERE id = $1`, [id, auth.userId]);
      await clearExceptionsForMatch(t, auth, recon.id, id);
    }
    await storeReconTotals(t, recon);
    await logAudit(t, auth, 'treasury.recon_matches_bulk_confirmed', 'reconciliation', recon.id, { count: ids.length, rule: 'reference_and_amount', match_ids: ids });
    return `${ids.length} exact 1:1 reference + amount proposal(s) confirmed. Other proposals still need individual review.`;
  });
}

export async function rejectMatchAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const id = uuid.parse(form.get('matchId'));
    const { m, recon } = await matchWithRecon(t, id);
    if (m.status === 'rejected') throw new UserError('This match is already rejected.');
    await t.query(`UPDATE recon_matches SET status = 'rejected', confirmed_by = $2 WHERE id = $1`, [id, auth.userId]);
    await storeReconTotals(t, recon);
    await logAudit(t, auth, 'treasury.recon_match_rejected', 'reconciliation', recon.id, { match_id: id, previous_status: m.status });
    return `Match rejected; its items are unmatched again${m.status === 'confirmed' ? ' (run auto-match or match manually)' : ''}. A rejected pairing is not re-proposed by auto-match.`;
  });
}

export async function manualMatchAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const recon = await reconById(t, uuid.parse(form.get('reconId')), true);
    assertOpen(recon);
    const bankIds = z.array(uuid).max(50).parse(form.getAll('bank'));
    const ledgerIds = z.array(uuid).max(50).parse(form.getAll('ledger'));
    const note = String(form.get('note') ?? '').trim().slice(0, 500);
    const record = form.get('recordDifference') === '1';
    const s = await reconSummary(t, recon);
    const pick = (list: typeof s.items.bank, ids: string[], side: string) => ids.map((id) => {
      const it = list.find((x) => x.id === id);
      if (!it) throw new UserError(`Selected ${side} item does not belong to this account and month.`);
      if (it.match_id) throw new UserError(`${side === 'bank' ? 'Bank' : 'Ledger'} item ${it.reference ?? it.id.slice(0, 8)} is already in a ${it.match_status} match — reject that match first.`);
      return it;
    });
    const bs = pick(s.items.bank, [...new Set(bankIds)], 'bank'), ls = pick(s.items.ledger, [...new Set(ledgerIds)], 'ledger');
    const v = validateManualMatch(bs.map((x) => x.amount), ls.map((x) => x.amount), record, note);
    const rule = v.difference.isZero() ? (note ? `manual: ${note}` : 'manual') : `manual_difference_recorded: ${note}`;
    const m = await one<{ id: string }>(t, `INSERT INTO recon_matches (tenant_id, reconciliation_id, match_type, cardinality, rule, bank_total, ledger_total, difference, status, created_by, confirmed_by)
      VALUES ($1,$2,'manual',$3,$4,$5,$6,$7,'confirmed',$8,$8) RETURNING id`, [auth.tenantId, recon.id, v.cardinality, rule, v.bankTotal.toFixed(4), v.ledgerTotal.toFixed(4), v.difference.toFixed(4), auth.userId]);
    for (const b of bs) await t.query(`INSERT INTO recon_match_items (tenant_id, match_id, side, item_id, amount) VALUES ($1,$2,'bank',$3,$4)`, [auth.tenantId, m!.id, b.id, b.amount]);
    for (const l of ls) await t.query(`INSERT INTO recon_match_items (tenant_id, match_id, side, item_id, amount) VALUES ($1,$2,'ledger',$3,$4)`, [auth.tenantId, m!.id, l.id, l.amount]);
    await clearExceptionsForMatch(t, auth, recon.id, m!.id);
    await storeReconTotals(t, recon);
    await logAudit(t, auth, 'treasury.recon_manual_match', 'reconciliation', recon.id, { match_id: m!.id, cardinality: v.cardinality, bank_ids: bs.map((x) => x.id), ledger_ids: ls.map((x) => x.id), bank_total: v.bankTotal.toFixed(2), ledger_total: v.ledgerTotal.toFixed(2), difference_recorded: v.difference.toFixed(2), note });
    return v.difference.isZero() ? `Manual ${v.cardinality.replace(/_/g, ' ')} match created and confirmed.` : `Manual match created with an explicitly recorded difference of ${v.difference.toFixed(2)} (no write-off posted).`;
  });
}

async function exceptionWithRecon(t: Tx, id: string) {
  const e = await one<{ id: string; reconciliation_id: string; status: string; kind: string; side: string; amount: string }>(t, 'SELECT id, reconciliation_id, status, kind, side, amount::text FROM recon_exceptions WHERE id = $1 FOR UPDATE', [id]);
  if (!e) throw new UserError('Exception not found.');
  const recon = await reconById(t, e.reconciliation_id, true);
  assertOpen(recon);
  return { e, recon };
}

export async function investigateExceptionAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const id = uuid.parse(form.get('exceptionId'));
    const note = String(form.get('note') ?? '').trim().slice(0, 500);
    const { e, recon } = await exceptionWithRecon(t, id);
    if (e.status === 'resolved') throw new UserError('This exception is already resolved.');
    await t.query(`UPDATE recon_exceptions SET status = 'investigating' WHERE id = $1`, [id]);
    await storeReconTotals(t, recon);
    await logAudit(t, auth, 'treasury.recon_exception_investigating', 'reconciliation', recon.id, { exception_id: id, kind: e.kind, side: e.side, amount: e.amount, note });
    return 'Exception marked as under investigation.';
  });
}

export async function resolveExceptionAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const id = uuid.parse(form.get('exceptionId'));
    const resolution = z.string().trim().min(5, 'a resolution note of at least 5 characters is required').max(1000).parse(form.get('resolution') ?? '');
    const { e, recon } = await exceptionWithRecon(t, id);
    if (e.status === 'resolved') throw new UserError('This exception is already resolved.');
    await t.query(`UPDATE recon_exceptions SET status = 'resolved', resolution = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`, [id, resolution, auth.userId]);
    await storeReconTotals(t, recon);
    await logAudit(t, auth, 'treasury.recon_exception_resolved', 'reconciliation', recon.id, { exception_id: id, kind: e.kind, side: e.side, amount: e.amount, resolution, write_off: false });
    return 'Exception resolved with an explanation. No write-off or journal was created — the item remains a reconciling item until it clears.';
  });
}

export async function submitReconAction(form: FormData) {
  return treasuryAction('treasury.reconcile', form, FALLBACK, async (t, auth) => {
    const recon = await reconById(t, uuid.parse(form.get('reconId')), true);
    assertOpen(recon);
    const s = await storeReconTotals(t, recon);
    const pending = s.matches.filter((m) => m.status === 'proposed').length;
    const open = s.liveExceptions.filter((e) => e.status === 'open').length;
    if (s.unclassified.length) throw new UserError(`${s.unclassified.length} item(s) have not been matched or classified as exceptions — run auto-match first.`);
    if (pending) throw new UserError(`${pending} proposed match(es) still need to be confirmed or rejected.`);
    if (open) throw new UserError(`${open} exception(s) are still open — mark each as investigating or resolve it with an explanation.`);
    await t.query(`UPDATE reconciliations SET status = 'in_review', prepared_by = $2 WHERE id = $1`, [recon.id, auth.userId]);
    await logAudit(t, auth, 'treasury.reconciliation_submitted', 'reconciliation', recon.id, { statement_balance: s.balances.statementBalance.toFixed(2), ledger_balance: s.balances.ledgerBalance.toFixed(2), unresolved_difference: s.balances.unresolvedDifference.toFixed(2) });
    return `Submitted for review. Unresolved difference ${s.balances.unresolvedDifference.toFixed(2)}. A different user with finance.approve must approve.`;
  });
}

export async function approveReconAction(form: FormData) {
  return treasuryAction('finance.approve', form, FALLBACK, async (t, auth) => {
    const recon = await reconById(t, uuid.parse(form.get('reconId')), true);
    if (recon.status !== 'in_review') throw new UserError('Only a reconciliation in review can be approved.');
    await t.query(`UPDATE reconciliations SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [recon.id, auth.userId]);
    await logAudit(t, auth, 'treasury.reconciliation_approved', 'reconciliation', recon.id, { prepared_by: recon.prepared_by, unresolved_difference: recon.unresolved_difference });
    return 'Reconciliation approved.';
  });
}

export async function returnReconAction(form: FormData) {
  return treasuryAction('finance.approve', form, FALLBACK, async (t, auth) => {
    const recon = await reconById(t, uuid.parse(form.get('reconId')), true);
    if (recon.status !== 'in_review') throw new UserError('Only a reconciliation in review can be returned.');
    const note = z.string().trim().min(5, 'explain why the reconciliation is returned (min 5 characters)').max(1000).parse(form.get('note') ?? '');
    await t.query(`UPDATE reconciliations SET status = 'open' WHERE id = $1`, [recon.id]);
    await logAudit(t, auth, 'treasury.reconciliation_returned', 'reconciliation', recon.id, { note });
    return 'Reconciliation returned to the preparer.';
  });
}
