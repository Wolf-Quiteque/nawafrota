import { test } from 'node:test';
import assert from 'node:assert/strict';

import { busState, checkCapacityChange, filterBuses, countByState } from '@/lib/fleet';
import { sellableSeatCount, isSellableSeat, isCopilotSeat } from '@/lib/seats';

test('state precedence: inactive beats everything', () => {
  // Mirrors the CASE in public.fleet_bus_status (§4.6).
  assert.equal(busState({ is_active: false, open_issues: 3, trip_id: 't1' }), 'out_of_service');
});

test('state precedence: open maintenance beats being on a trip', () => {
  assert.equal(busState({ is_active: true, open_issues: 1, trip_id: 't1' }), 'needs_maintenance');
});

test('state precedence: on a trip beats idle', () => {
  assert.equal(busState({ is_active: true, open_issues: 0, trip_id: 't1' }), 'on_trip');
});

test('state precedence: idle is the fallback', () => {
  assert.equal(busState({ is_active: true, open_issues: 0, trip_id: null }), 'idle');
  assert.equal(busState({ is_active: true }), 'idle');
});

test('open_issues arriving as a string still counts', () => {
  // PostgREST renders bigint as a string; treating "1" as falsy would show a
  // broken-down bus as available.
  assert.equal(busState({ is_active: true, open_issues: '1' }), 'needs_maintenance');
  assert.equal(busState({ is_active: true, open_issues: '0' }), 'idle');
});

test('capacity may not drop below a seat already sold on a future trip', () => {
  // §2.1 — the guard that protects live ticket sales.
  const check = checkCapacityChange(40, 45);
  assert.equal(check.allowed, false);
  assert.match(check.error, /45/, 'the refusal names the seat that blocks it');
});

test('capacity may equal the highest sold seat', () => {
  assert.equal(checkCapacityChange(45, 45).allowed, true);
});

test('capacity may rise freely', () => {
  assert.equal(checkCapacityChange(60, 45).allowed, true);
});

test('with nothing sold, any capacity is allowed', () => {
  assert.equal(checkCapacityChange(20, null).allowed, true);
  assert.equal(checkCapacityChange(20, undefined).allowed, true);
});

test('capacity below one is rejected outright', () => {
  assert.equal(checkCapacityChange(0, null).allowed, false);
  assert.equal(checkCapacityChange('abc', null).allowed, false);
});

test('seat 1 is the co-pilot and sellable seats are capacity minus one', () => {
  assert.equal(isCopilotSeat(1), true);
  assert.equal(sellableSeatCount(51), 50);
  assert.equal(isSellableSeat(1, 51), false);
  assert.equal(isSellableSeat(2, 51), true);
  assert.equal(isSellableSeat(52, 51), false);
});

const FLEET = [
  { bus_id: '1', license_plate: 'LDA-50-07-AN', make: 'HIGER', model: 'KLQ6122K', state: 'idle' },
  { bus_id: '2', license_plate: 'LDA-10-47-AR', make: 'HIGER', model: 'KLQ6119', state: 'on_trip' },
  { bus_id: '3', license_plate: 'LDA-02-42-AJ', make: 'ZONG TONG', model: 'LCK6128H', state: 'needs_maintenance' },
  { bus_id: '4', license_plate: 'INV-KIL-001', make: 'Invested', model: 'Coaster', state: 'out_of_service' },
];

test('search matches a partial plate, case-insensitively', () => {
  assert.deepEqual(
    filterBuses(FLEET, { search: '50-07' }).map((b) => b.bus_id),
    ['1']
  );
  assert.deepEqual(
    filterBuses(FLEET, { search: 'zong' }).map((b) => b.bus_id),
    ['3']
  );
});

test('the state filter and the search combine', () => {
  assert.deepEqual(
    filterBuses(FLEET, { search: 'higer', state: 'on_trip' }).map((b) => b.bus_id),
    ['2']
  );
  assert.deepEqual(filterBuses(FLEET, { search: 'higer', state: 'out_of_service' }), []);
});

test('countByState always returns all four keys', () => {
  assert.deepEqual(countByState(FLEET), {
    on_trip: 1,
    idle: 1,
    needs_maintenance: 1,
    out_of_service: 1,
  });
  assert.deepEqual(countByState([]), {
    on_trip: 0,
    idle: 0,
    needs_maintenance: 0,
    out_of_service: 0,
  });
});
