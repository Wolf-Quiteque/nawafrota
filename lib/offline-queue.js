'use client';

// The one piece of genuine offline *write* support the app needs (§8.2): a
// filling station often has no signal, and an agent standing at the pump must
// still be able to record the fill.
//
// IndexedDB rather than localStorage because a queued entry can carry a receipt
// photo as a Blob, which localStorage cannot hold.

const DB_NAME = 'nawa-frotas';
const DB_VERSION = 1;
const STORE = 'pending-fuel';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Armazenamento local indisponível.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = fn(store);
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function queueFuelEntry(entry) {
  const db = await openDb();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queued_at: new Date().toISOString(),
    entry,
  };
  await tx(db, 'readwrite', (store) => store.put(record));
  db.close();
  await requestSync();
  return record;
}

export async function pendingFuelEntries() {
  try {
    const db = await openDb();
    const all = await tx(db, 'readonly', (store) => store.getAll());
    db.close();
    return all || [];
  } catch {
    // A private window, or blocked site data. Pending entries are a bonus, not
    // a precondition — never let this break the screen.
    return [];
  }
}

export async function removeFuelEntry(id) {
  const db = await openDb();
  await tx(db, 'readwrite', (store) => store.delete(id));
  db.close();
}

/**
 * Flushes the queue. Called on load and whenever the browser comes back online.
 * Entries that the server rejects on their own merits (a 4xx — a bus that no
 * longer exists, say) are dropped rather than retried forever; a 5xx or a dead
 * network leaves them queued.
 */
export async function flushFuelQueue() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, failed: 0, dropped: 0 };
  }

  const pending = await pendingFuelEntries();
  let sent = 0;
  let failed = 0;
  let dropped = 0;

  for (const record of pending) {
    try {
      const res = await fetch('/api/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...record.entry, queued_at: record.queued_at }),
      });
      if (res.ok) {
        await removeFuelEntry(record.id);
        sent += 1;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408) {
        // 401 is excluded on purpose: the session may simply have expired while
        // the phone was offline, and the entry is still perfectly valid once
        // the agent signs in again.
        await removeFuelEntry(record.id);
        dropped += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { sent, failed, dropped };
}

/** Background Sync where available; the load/online handlers cover the rest. */
async function requestSync() {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) await reg.sync.register('flush-fuel-queue');
  } catch {
    // Background Sync is Chromium-only and can be disabled. Not a problem:
    // flushFuelQueue() also runs on next load and on the 'online' event.
  }
}
