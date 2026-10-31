import { describe, it, expect } from 'vitest';
import {
  krProgress, krStatus, effectiveDirection, quarterBounds, elapsedFraction, dependencyState, wouldCreateCycle,
  canTransitionAction, allowedActionTransitions, isOverdue, initiativeOverdue, weekBounds, nextCode, attentionRank, needsAttention, budgetUse, measureKr, type DepNode,
} from '@/lib/services/strategy';

describe('krProgress — direction aware', () => {
  it('up KPI improving from baseline to target', () => {
    const p = krProgress({ baseline: '27', target: '32', current: '29', direction: 'up' });
    expect(p.mode).toBe('improve'); expect(p.direction).toBe('up');
    expect(p.pct).toBe('40.0'); expect(p.achieved).toBe(false);
  });
  it('down KPI (onboarding days 34 → 14, now 16)', () => {
    const p = krProgress({ baseline: '34', target: '14', current: '16', direction: 'down' });
    expect(p.pct).toBe('90.0'); expect(p.achieved).toBe(false);
    expect(krProgress({ baseline: '34', target: '14', current: '13', direction: 'down' }).achieved).toBe(true);
  });
  it('clamps to 0..100 but keeps the raw value', () => {
    const worse = krProgress({ baseline: '34', target: '14', current: '40', direction: 'down' });
    expect(worse.pct).toBe('0.0'); expect(worse.rawPct).toBe('-30.00');
    const beyond = krProgress({ baseline: '27', target: '32', current: '35', direction: 'up' });
    expect(beyond.pct).toBe('100.0'); expect(beyond.rawPct).toBe('160.00'); expect(beyond.achieved).toBe(true);
  });
  it('treats a target on the "wrong" side of baseline as a threshold (take rate floor 70 bps from 72)', () => {
    const ok = krProgress({ baseline: '72', target: '70', current: '79.3', direction: 'up' });
    expect(ok.mode).toBe('threshold'); expect(ok.achieved).toBe(true); expect(ok.pct).toBe('100.0');
    const below = krProgress({ baseline: '72', target: '70', current: '63', direction: 'up' });
    expect(below.achieved).toBe(false); expect(below.pct).toBe('90.0');
  });
  it('ceiling threshold for down KPI without baseline', () => {
    const p = krProgress({ baseline: null, target: '20', current: '25', direction: 'down' });
    expect(p.mode).toBe('threshold'); expect(p.pct).toBe('80.0');
  });
  it('decimal-safe on fractions (uptime 0.9993 → 0.9995, now 0.99969900)', () => {
    const p = krProgress({ baseline: '0.9993', target: '0.9995', current: '0.99969900', direction: 'up' });
    expect(p.pct).toBe('100.0'); expect(p.achieved).toBe(true);
    const mid = krProgress({ baseline: '0.9993', target: '0.9995', current: '0.9994', direction: 'up' });
    expect(mid.pct).toBe('50.0');
  });
  it('no current value → null progress', () => {
    const p = krProgress({ baseline: '1', target: '2', current: null });
    expect(p.pct).toBeNull(); expect(krStatus(p, 0.5)).toBe('no_data');
  });
  it('neutral/unknown direction is inferred from baseline → target', () => {
    expect(effectiveDirection('neutral', '10', '5')).toBe('down');
    expect(effectiveDirection(null, '5', '10')).toBe('up');
    expect(effectiveDirection(undefined, null, '10')).toBe('up');
    expect(effectiveDirection('up', '10', '5')).toBe('up');
  });
});

describe('krStatus vs elapsed quarter', () => {
  const p = (pct: string) => ({ pct, rawPct: pct, direction: 'up' as const, mode: 'improve' as const, achieved: false });
  it('classifies against expected linear progress', () => {
    expect(krStatus(p('50'), 0.5)).toBe('on_track');
    expect(krStatus(p('41'), 0.5)).toBe('on_track');
    expect(krStatus(p('30'), 0.5)).toBe('at_risk');
    expect(krStatus(p('10'), 0.5)).toBe('off_track');
    expect(krStatus({ ...p('100'), achieved: true }, 0.1)).toBe('achieved');
  });
});

describe('quarter helpers', () => {
  it('bounds and elapsed share', () => {
    expect(quarterBounds('2026-Q4')).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    expect(quarterBounds('2027-Q1')).toEqual({ start: '2027-01-01', end: '2027-03-31' });
    expect(quarterBounds('bad')).toBeNull();
    expect(elapsedFraction('2026-10-01', '2026-12-31', '2026-09-01')).toBe(0);
    expect(elapsedFraction('2026-10-01', '2026-12-31', '2027-02-01')).toBe(1);
    expect(elapsedFraction('2026-10-01', '2026-12-31', '2026-10-31')).toBeCloseTo(31 / 92, 5);
  });
});

describe('dependencies', () => {
  const n = (id: string, status: string, deadline: string | null, deps: string[] = []): DepNode => ({ id, code: id.toUpperCase(), title: id, status, deadline, depends_on: deps });
  it('flags blocked, cancelled, missing and late dependencies', () => {
    const a = n('a', 'blocked', '2026-12-01'); const b = n('b', 'done', '2026-10-01'); const c = n('c', 'on_track', '2027-02-01'); const d = n('d', 'cancelled', null);
    const x = n('x', 'on_track', '2026-12-31', ['b']);
    const map = new Map([a, b, c, d, x].map((v) => [v.id, v]));
    expect(dependencyState(x, map).blockedByDependency).toBe(false);
    expect(dependencyState({ ...x, depends_on: ['a'] }, map).blockedByDependency).toBe(true);
    expect(dependencyState({ ...x, depends_on: ['c'] }, map).deps[0].issue).toMatch(/after this deadline/);
    expect(dependencyState({ ...x, depends_on: ['d'] }, map).blockedByDependency).toBe(true);
    expect(dependencyState({ ...x, depends_on: ['zz'] }, map).deps[0].status).toBe('missing');
  });
  it('at-risk dependency is a warning, not a block', () => {
    const r = n('r', 'at_risk', '2026-11-01'); const x = n('x', 'on_track', '2026-12-31', ['r']);
    const s = dependencyState(x, new Map([[r.id, r], [x.id, x]]));
    expect(s.blockedByDependency).toBe(false); expect(s.warnings).toHaveLength(1);
  });
  it('detects cycles including self-dependency', () => {
    const map = new Map<string, { depends_on: string[] }>([['a', { depends_on: ['b'] }], ['b', { depends_on: ['c'] }], ['c', { depends_on: [] }]]);
    expect(wouldCreateCycle('c', ['a'], map)).toBe(true);
    expect(wouldCreateCycle('a', ['a'], map)).toBe(true);
    expect(wouldCreateCycle('d', ['a'], map)).toBe(false);
    expect(wouldCreateCycle('c', [], map)).toBe(false);
  });
});

describe('actions, deadlines, weeks, codes', () => {
  it('status transitions', () => {
    expect(canTransitionAction('open', 'done')).toBe(true);
    expect(canTransitionAction('done', 'in_progress')).toBe(false);
    expect(canTransitionAction('done', 'open')).toBe(true);
    expect(canTransitionAction('cancelled', 'done')).toBe(false);
    expect(canTransitionAction('bogus', 'open')).toBe(false);
    expect(allowedActionTransitions('in_progress')).toEqual(['open', 'done', 'cancelled']);
  });
  it('overdue flags', () => {
    expect(isOverdue('2026-10-30', 'open', '2026-10-31')).toBe(true);
    expect(isOverdue('2026-10-31', 'open', '2026-10-31')).toBe(false);
    expect(isOverdue('2026-10-01', 'done', '2026-10-31')).toBe(false);
    expect(isOverdue(null, 'open', '2026-10-31')).toBe(false);
    expect(initiativeOverdue('2026-03-15', 'done', '2026-10-31')).toBe(false);
    expect(initiativeOverdue('2026-10-15', 'at_risk', '2026-10-31')).toBe(true);
  });
  it('week bounds (Monday..Sunday)', () => {
    expect(weekBounds('2026-10-31', '2026-01-01')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekBounds('2026-11-02', '2026-01-01')).toEqual({ start: '2026-11-02', end: '2026-11-08' });
    expect(weekBounds('garbage', '2026-10-31')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekBounds(undefined, '2026-10-28')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
  });
  it('sequential codes', () => {
    expect(nextCode('ACT-', ['ACT-0001', 'ACT-0003', 'X-9'], 4)).toBe('ACT-0004');
    expect(nextCode('INI-', [], 2)).toBe('INI-01');
    expect(nextCode('OBJ-', ['OBJ-6', 'OBJ-10'], 1)).toBe('OBJ-11');
  });
  it('attention ranking puts blocked and at-risk first', () => {
    const items = [
      { status: 'on_track', blockedByDependency: false, overdue: false, risk_level: 'low' },
      { status: 'at_risk', blockedByDependency: false, overdue: false, risk_level: 'high' },
      { status: 'blocked', blockedByDependency: false, overdue: false, risk_level: 'medium' },
      { status: 'on_track', blockedByDependency: true, overdue: false, risk_level: 'low' },
    ];
    expect(items.map(attentionRank)).toEqual([5, 2, 0, 1]);
    expect(items.map(needsAttention)).toEqual([false, true, true, true]);
  });
  it('budget utilisation', () => {
    expect(budgetUse('600000', '152000')).toBe('0.2533');
    expect(budgetUse('0', '10')).toBeNull();
  });
});

describe('measureKr', () => {
  const kr = { id: 'k', objective_id: 'o', title: 'Active merchants', kpi_code: 'OPS.ACTIVE_MERCHANTS', quarter: '2026-Q4', baseline: '27', target: '32', current_value: '99', unit: 'count' };
  const m = { code: 'OPS.ACTIVE_MERCHANTS', name: 'Active merchants', unit: 'count', direction: 'up' as const, value: '29.00000000', confidence: 'PENDING', period_start: '2026-10-01', period_end: '2026-10-31', calc_run_id: 'run', status_note: null, computed_at: '' };
  it('uses the measured KPI value, ignoring the manual current value', () => {
    const r = measureKr(kr, m, '2026-10-31');
    expect(r.source).toBe('kpi'); expect(r.current).toBe('29.00000000'); expect(r.progress.pct).toBe('40.0'); expect(r.kpiMissing).toBe(false);
  });
  it('flags a missing measurement', () => {
    const r = measureKr(kr, null, '2026-10-31');
    expect(r.kpiMissing).toBe(true); expect(r.current).toBeNull(); expect(r.status).toBe('no_data');
  });
  it('manual key results use current_value', () => {
    const r = measureKr({ ...kr, kpi_code: null, current_value: '30' }, null, '2026-10-31');
    expect(r.source).toBe('manual'); expect(r.progress.pct).toBe('60.0');
  });
});
