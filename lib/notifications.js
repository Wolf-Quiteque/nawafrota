// Notification vocabulary shared by the bell, the feed and the API.

export const KIND_LABELS = {
  fuel_logged: 'Abastecimento',
  maintenance_opened: 'Manutenção aberta',
  maintenance_resolved: 'Manutenção concluída',
  bus_status_changed: 'Estado alterado',
};

export const KIND_TONES = {
  fuel_logged: 'primary',
  maintenance_opened: 'warning',
  maintenance_resolved: 'success',
  bus_status_changed: 'neutral',
};

export function kindLabel(kind) {
  return KIND_LABELS[kind] ?? 'Notificação';
}

export function kindTone(kind) {
  return KIND_TONES[kind] ?? 'neutral';
}

/** Where tapping a notification should land. */
export function notificationHref(notification) {
  if (notification?.bus_id) return `/frota/${notification.bus_id}`;
  return '/notificacoes';
}

/**
 * Marks each notification read/unread from this user's read rows.
 * Unread is the absence of a read row, not a flag on the notification — read
 * state is per user, so one person opening the feed must not clear the badge
 * for the rest of the office (§4.5).
 */
export function markReadState(notifications, readIds) {
  const read = readIds instanceof Set ? readIds : new Set(readIds || []);
  return (notifications || []).map((n) => ({ ...n, read: read.has(n.id) }));
}

export function unreadCount(notifications) {
  return (notifications || []).filter((n) => !n.read).length;
}

/**
 * Prepends a realtime row, guarding against the duplicate that arrives when
 * the INSERT event races the fetch that already included it.
 */
export function mergeIncoming(existing, incoming) {
  if (!incoming) return existing;
  if ((existing || []).some((n) => n.id === incoming.id)) return existing;
  return [{ ...incoming, read: false }, ...(existing || [])];
}
