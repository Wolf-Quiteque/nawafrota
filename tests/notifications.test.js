import { test } from 'node:test';
import assert from 'node:assert/strict';

import { markReadState, unreadCount, mergeIncoming, notificationHref } from '@/lib/notifications';
import { decideSession, isAuthHandshakePath } from '@/lib/auth-paths';

test('unread is the absence of a read row for this user', () => {
  const marked = markReadState(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    ['a', 'c']
  );
  assert.deepEqual(
    marked.map((n) => n.read),
    [true, false, true]
  );
  assert.equal(unreadCount(marked), 1);
});

test('a realtime insert that the fetch already returned is not duplicated', () => {
  const existing = [{ id: 'a', read: false }];
  assert.equal(mergeIncoming(existing, { id: 'a' }).length, 1);
  assert.equal(mergeIncoming(existing, { id: 'b' }).length, 2);
});

test('a realtime insert arrives unread and on top', () => {
  const merged = mergeIncoming([{ id: 'a', read: true }], { id: 'b' });
  assert.equal(merged[0].id, 'b');
  assert.equal(merged[0].read, false);
});

test('a notification about a bus links to that bus', () => {
  assert.equal(notificationHref({ bus_id: 'bus-1' }), '/frota/bus-1');
  assert.equal(notificationHref({}), '/notificacoes');
});

test('the sign-in handshake is never treated as an expired session', () => {
  // Otherwise the middleware signs out the brand-new session a moment before
  // the route validates it, and login fails with "Auth session missing!".
  assert.equal(isAuthHandshakePath('/api/auth/session'), true);
  const decision = decideSession({ pathname: '/api/auth/session', hasUser: true, hasWeekMarker: false });
  assert.deepEqual(decision, { signOut: false, redirectTo: null });
});

test('a signed-out visitor is sent to login', () => {
  const decision = decideSession({ pathname: '/frota', hasUser: false, hasWeekMarker: false });
  assert.equal(decision.redirectTo, '/login');
});

test('an API route gets a JSON refusal, never an HTML redirect', () => {
  const decision = decideSession({ pathname: '/api/fuel', hasUser: false, hasWeekMarker: false });
  assert.equal(decision.redirectTo, null);
});

test('a session past its week is signed out', () => {
  const decision = decideSession({ pathname: '/frota', hasUser: true, hasWeekMarker: false });
  assert.equal(decision.signOut, true);
  assert.equal(decision.redirectTo, '/login');
});
