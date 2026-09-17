// Maintenance vocabulary and rules. Pure, for the same reason as fuel.js.

export const SEVERITIES = {
  low: { label: 'Baixa', tone: 'neutral', rank: 1 },
  medium: { label: 'Média', tone: 'primary', rank: 2 },
  high: { label: 'Alta', tone: 'warning', rank: 3 },
  critical: { label: 'Crítica', tone: 'danger', rank: 4 },
};

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export const STATUSES = {
  open: { label: 'Aberta', tone: 'warning' },
  in_progress: { label: 'Em curso', tone: 'primary' },
  done: { label: 'Concluída', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};

export const OPEN_STATUSES = ['open', 'in_progress'];

export function severityLabel(severity) {
  return SEVERITIES[severity]?.label ?? '—';
}

export function severityTone(severity) {
  return SEVERITIES[severity]?.tone ?? 'neutral';
}

export function statusLabel(status) {
  return STATUSES[status]?.label ?? '—';
}

export function statusTone(status) {
  return STATUSES[status]?.tone ?? 'neutral';
}

/**
 * Ranks by declaration order, not alphabetically. This is the JS half of the
 * bug the SQL validation caught (§0): max(severity::text) returns 'medium' as
 * the worst severity because 'm' > 'h' > 'c'. Sorting UI lists by the raw
 * string would reintroduce exactly that, one layer up.
 */
export function severityRank(severity) {
  return SEVERITIES[severity]?.rank ?? 0;
}

export function worstSeverity(issues) {
  let worst = null;
  for (const issue of issues || []) {
    if (!OPEN_STATUSES.includes(issue.status)) continue;
    if (worst === null || severityRank(issue.severity) > severityRank(worst)) {
      worst = issue.severity;
    }
  }
  return worst;
}

/** Open issues first, then worst severity, then oldest — the board's order. */
export function sortIssues(issues) {
  return [...(issues || [])].sort((a, b) => {
    const aOpen = OPEN_STATUSES.includes(a.status) ? 1 : 0;
    const bOpen = OPEN_STATUSES.includes(b.status) ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    const rank = severityRank(b.severity) - severityRank(a.severity);
    if (rank !== 0) return rank;
    return new Date(a.reported_at) - new Date(b.reported_at);
  });
}

export function validateMaintenance(input) {
  const errors = {};
  if (!input.bus_id) errors.bus_id = 'Escolha o autocarro.';
  if (!String(input.title || '').trim()) errors.title = 'Descreva a avaria.';
  if (input.severity && !SEVERITIES[input.severity]) errors.severity = 'Gravidade inválida.';
  if (input.status && !STATUSES[input.status]) errors.status = 'Estado inválido.';
  if (input.cost_kz !== null && input.cost_kz !== undefined && input.cost_kz !== '') {
    const cost = Number(input.cost_kz);
    if (!Number.isFinite(cost) || cost < 0) errors.cost_kz = 'O custo não pode ser negativo.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Closing an issue is what stamps completed_at and resolved_by — doing it in
 * one place keeps a resolved issue from ever being missing its resolver, which
 * is the field the notification trigger reads (§4.5).
 */
export function statusTransition(nextStatus, userId) {
  const patch = { status: nextStatus };
  if (nextStatus === 'done') {
    patch.completed_at = new Date().toISOString();
    patch.resolved_by = userId;
  } else {
    // Reopening: clear the completion so the record does not claim it was
    // finished and is simultaneously open.
    patch.completed_at = null;
  }
  return patch;
}
