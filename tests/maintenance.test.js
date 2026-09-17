import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  severityRank,
  worstSeverity,
  sortIssues,
  statusTransition,
  validateMaintenance,
  severityLabel,
  statusLabel,
} from '@/lib/maintenance';

test('severity ranks by declaration order, not alphabetically', () => {
  // The JS half of the bug the SQL validation caught (§0): sorting the raw
  // string makes 'medium' the worst severity because 'm' > 'h' > 'c'.
  assert.ok(severityRank('critical') > severityRank('medium'));
  assert.ok(severityRank('high') > severityRank('medium'));
  assert.ok(severityRank('medium') > severityRank('low'));
});

test('worstSeverity returns critical, never medium', () => {
  const issues = [
    { severity: 'medium', status: 'open' },
    { severity: 'critical', status: 'open' },
    { severity: 'high', status: 'in_progress' },
  ];
  assert.equal(worstSeverity(issues), 'critical');
});

test('worstSeverity ignores closed issues', () => {
  const issues = [
    { severity: 'critical', status: 'done' },
    { severity: 'low', status: 'open' },
  ];
  assert.equal(worstSeverity(issues), 'low');
});

test('worstSeverity is null when nothing is open', () => {
  assert.equal(worstSeverity([{ severity: 'critical', status: 'cancelled' }]), null);
  assert.equal(worstSeverity([]), null);
});

test('the board sorts open first, then worst severity, then oldest', () => {
  const sorted = sortIssues([
    { id: 'done-critical', severity: 'critical', status: 'done', reported_at: '2026-01-01' },
    { id: 'open-low', severity: 'low', status: 'open', reported_at: '2026-01-01' },
    { id: 'open-critical-new', severity: 'critical', status: 'open', reported_at: '2026-03-01' },
    { id: 'open-critical-old', severity: 'critical', status: 'in_progress', reported_at: '2026-02-01' },
  ]);
  assert.deepEqual(
    sorted.map((i) => i.id),
    ['open-critical-old', 'open-critical-new', 'open-low', 'done-critical']
  );
});

test('closing an issue stamps both completed_at and resolved_by', () => {
  // The notify_maintenance trigger reads resolved_by when status becomes
  // 'done' (§4.5), so the two must never drift apart.
  const patch = statusTransition('done', 'user-1');
  assert.equal(patch.status, 'done');
  assert.equal(patch.resolved_by, 'user-1');
  assert.ok(patch.completed_at);
});

test('reopening an issue clears the completion', () => {
  const patch = statusTransition('in_progress', 'user-1');
  assert.equal(patch.completed_at, null);
  assert.equal(patch.resolved_by, undefined);
});

test('validateMaintenance requires a bus and a title', () => {
  assert.equal(validateMaintenance({ bus_id: 'x', title: 'Travões' }).valid, true);
  assert.equal(validateMaintenance({ title: 'Travões' }).valid, false);
  assert.equal(validateMaintenance({ bus_id: 'x', title: '   ' }).valid, false);
});

test('validateMaintenance rejects an unknown severity or status', () => {
  assert.equal(validateMaintenance({ bus_id: 'x', title: 'a', severity: 'urgent' }).valid, false);
  assert.equal(validateMaintenance({ bus_id: 'x', title: 'a', status: 'pending' }).valid, false);
});

test('validateMaintenance rejects a negative cost but allows a blank one', () => {
  assert.equal(validateMaintenance({ bus_id: 'x', title: 'a', cost_kz: -1 }).valid, false);
  assert.equal(validateMaintenance({ bus_id: 'x', title: 'a', cost_kz: '' }).valid, true);
});

test('labels are European Portuguese', () => {
  assert.equal(severityLabel('critical'), 'Crítica');
  assert.equal(severityLabel('medium'), 'Média');
  assert.equal(statusLabel('in_progress'), 'Em curso');
  assert.equal(statusLabel('done'), 'Concluída');
});
