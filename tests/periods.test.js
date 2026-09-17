import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePeriod, luandaDate, percentChange, currentMonthRange } from '@/lib/periods';
import { toCsv, csvNumber } from '@/lib/csv';

// 2026-09-17 00:30 UTC is already 01:30 on the 17th in Luanda (UTC+1).
const NOW = new Date('2026-09-17T00:30:00Z');

test('a Luanda date is a day ahead of UTC late at night', () => {
  // 23:30 UTC on the 16th is 00:30 on the 17th in Luanda — a fill logged then
  // belongs to the 17th, not the 16th.
  assert.equal(luandaDate(new Date('2026-09-16T23:30:00Z')), '2026-09-17');
  assert.equal(luandaDate(new Date('2026-09-16T22:30:00Z')), '2026-09-16');
});

test('this month starts at the Luanda midnight of the 1st', () => {
  const period = resolvePeriod('this_month', { now: NOW });
  assert.equal(period.fromYmd, '2026-09-01');
  // 00:00 in Luanda is 23:00 UTC the day before.
  assert.equal(period.from, '2026-08-31T23:00:00.000Z');
});

test('last month is the whole previous month and stops where this one starts', () => {
  const period = resolvePeriod('last_month', { now: NOW });
  assert.equal(period.fromYmd, '2026-08-01');
  assert.equal(period.toYmd, '2026-09-01');
  // Half-open: a fill at exactly midnight on the 1st belongs to September
  // alone, never to both months.
  assert.equal(period.to, currentMonthRange(NOW).from);
});

test('last 90 days covers 90 days including today', () => {
  const period = resolvePeriod('last_90', { now: NOW });
  assert.equal(period.fromYmd, '2026-06-20');
  assert.equal(period.toYmd, '2026-09-18');
  const days = (new Date(period.to) - new Date(period.from)) / 86_400_000;
  assert.equal(days, 90);
});

test('this year runs from 1 January', () => {
  const period = resolvePeriod('this_year', { now: NOW });
  assert.equal(period.fromYmd, '2026-01-01');
});

test('a custom range includes the last day the user picked', () => {
  const period = resolvePeriod('custom', { now: NOW, from: '2026-03-01', to: '2026-03-31' });
  assert.equal(period.fromYmd, '2026-03-01');
  // Inclusive on screen means the half-open range reaches the day after.
  assert.equal(period.toYmd, '2026-04-01');
});

test('an unknown period key falls back to this month', () => {
  assert.equal(resolvePeriod('nonsense', { now: NOW }).fromYmd, '2026-09-01');
});

test('percentChange is null with no base to compare against', () => {
  assert.equal(percentChange(100, 0), null);
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
});

test('CSV uses semicolons and a BOM so Excel in pt-PT reads it', () => {
  const csv = toCsv(['Matrícula', 'Litros'], [['LDA-50-07-AN', '120,50']]);
  assert.ok(csv.startsWith('﻿'), 'without the BOM, accents arrive mangled');
  assert.ok(csv.includes('Matrícula;Litros'));
});

test('CSV quotes a cell containing the delimiter', () => {
  const csv = toCsv(['Posto'], [['Sonangol; Kikolo']]);
  assert.ok(csv.includes('"Sonangol; Kikolo"'));
});

test('csvNumber writes the decimal mark pt-PT expects', () => {
  assert.equal(csvNumber(120.5), '120,50');
  assert.equal(csvNumber(null), '');
  assert.equal(csvNumber(''), '');
});
