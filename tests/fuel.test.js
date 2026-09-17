import { test } from 'node:test';
import assert from 'node:assert/strict';

// Imported through the `@/` alias to prove the loader works — the whole point
// of tests/alias-loader.mjs (§9).
import {
  deriveFuelAmounts,
  consumptionBetween,
  costPerKmBetween,
  withConsumption,
  averageConsumption,
  fleetAverageConsumption,
  isConsumptionOutlier,
  checkOdometer,
  validateFuelEntry,
  parseAmount,
} from '@/lib/fuel';

test('parseAmount accepts the comma decimal an Angolan keyboard produces', () => {
  assert.equal(parseAmount('150,5'), 150.5);
  assert.equal(parseAmount('150.5'), 150.5);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount('abc'), null);
});

test('parseAmount reads the thousands separator the app itself prints', () => {
  // formatKz renders 63000 as "63.000 Kz", so "99.000" typed back in is
  // ninety-nine thousand kwanza — not ninety-nine. Reading it as a decimal
  // point turned a 235-litre fill into 0,24 L.
  assert.equal(parseAmount('99.000'), 99000);
  assert.equal(parseAmount('63.000'), 63000);
  assert.equal(parseAmount('1.234.567'), 1234567);
});

test('parseAmount keeps a comma decimal alongside grouped thousands', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
});

test('parseAmount still reads a lone dot as a decimal point', () => {
  // Only groups of exactly three digits are grouping, so a price pasted from
  // a machine that writes "420.50" is not read as forty-two thousand.
  assert.equal(parseAmount('420.50'), 420.5);
  assert.equal(parseAmount('1.5'), 1.5);
});

test('parseAmount ignores the non-breaking space Intl groups with', () => {
  assert.equal(parseAmount('12 000'), 12000);
});

test('the amount paid, written the Angolan way, gives the right litres', () => {
  const r = deriveFuelAmounts({ litres: '', pricePerLitre: '420', totalCost: '99.000' }, 'totalCost');
  assert.equal(r.litres, 235.71);
});

test('typing litres with a price in place derives the total', () => {
  const result = deriveFuelAmounts({ litres: '120', pricePerLitre: '420', totalCost: '' }, 'litres');
  assert.equal(result.totalCost, 50400);
  assert.equal(result.litres, 120);
  assert.equal(result.pricePerLitre, 420);
});

test('typing a total with litres in place derives the price, not a new total', () => {
  // A station charging off-rate: the agent types the real total and the price
  // is what moves (§6.3).
  const result = deriveFuelAmounts({ litres: '120', pricePerLitre: '420', totalCost: '51000' }, 'totalCost');
  assert.equal(result.totalCost, 51000, 'the typed field is never overwritten');
  assert.equal(result.pricePerLitre, 425);
});

test('typing a total with only a price derives the litres', () => {
  const result = deriveFuelAmounts({ litres: '', pricePerLitre: '420', totalCost: '21000' }, 'totalCost');
  assert.equal(result.litres, 50);
});

test('a derived litres never turns into an off-rate price', () => {
  // The reported bug: onChange fires per keystroke, so "9" derived litres of
  // 0,02 and the next keystroke read that back as litres the agent had typed,
  // driving the price to 4.950.000 Kz. Only a typed litres may move the price.
  const result = deriveFuelAmounts(
    { litres: '0,02', pricePerLitre: '420', totalCost: '99000' },
    'totalCost',
    ['totalCost']
  );
  assert.equal(result.pricePerLitre, 420, 'the prefilled price must not move');
  assert.equal(result.litres, 235.71);
});

test('an off-rate total still moves the price when litres were typed', () => {
  const result = deriveFuelAmounts(
    { litres: '120', pricePerLitre: '420', totalCost: '51000' },
    'totalCost',
    ['litres', 'totalCost']
  );
  assert.equal(result.pricePerLitre, 425);
  assert.equal(result.totalCost, 51000);
});

test('correcting the price after typing a total keeps the amount paid', () => {
  // Re-deriving the total here would silently replace what they actually paid.
  const result = deriveFuelAmounts(
    { litres: '235,71', pricePerLitre: '400', totalCost: '99000' },
    'pricePerLitre',
    ['totalCost']
  );
  assert.equal(result.totalCost, 99000, 'the typed total survives');
  assert.equal(result.litres, 247.5);
});

test('typing a total digit by digit only ever moves the litres', () => {
  // Replays the keystrokes rather than trusting a single call.
  let typed = [];
  let price = '420';
  for (const value of ['9', '99', '990', '9900', '99000']) {
    typed = typed.includes('totalCost') ? typed : [...typed, 'totalCost'];
    const d = deriveFuelAmounts({ litres: '', pricePerLitre: price, totalCost: value }, 'totalCost', typed);
    price = String(d.pricePerLitre);
  }
  assert.equal(price, '420');
});

test('derived amounts round to two decimals', () => {
  // '33,333' not '33.333': a dot groups thousands here, so the decimal mark is
  // the one an Angolan keyboard actually produces.
  const result = deriveFuelAmounts({ litres: '33,333', pricePerLitre: '420', totalCost: '' }, 'litres');
  assert.equal(result.totalCost, 13999.86);

  const price = deriveFuelAmounts({ litres: '3', pricePerLitre: '', totalCost: '1000' }, 'totalCost');
  assert.equal(price.pricePerLitre, 333.33);
});

test('dividing by zero litres never produces Infinity', () => {
  const result = deriveFuelAmounts({ litres: '0', pricePerLitre: '', totalCost: '1000' }, 'totalCost');
  assert.equal(result.pricePerLitre, null);
});

const fullTank = (odometer_km, litres, extra = {}) => ({
  odometer_km,
  litres,
  is_full_tank: true,
  ...extra,
});

test('two full tanks 500 km apart on 60 litres give 12 L/100 km', () => {
  // The same span the SQL validation asserted against a seeded bus (§4).
  assert.equal(consumptionBetween(fullTank(1000, 40), fullTank(1500, 60)), 12);
});

test('a missing odometer yields null, not a nonsense number', () => {
  assert.equal(consumptionBetween(fullTank(null, 40), fullTank(1500, 60)), null);
  assert.equal(consumptionBetween(fullTank(1000, 40), fullTank(null, 60)), null);
});

test('a rolled-back or replaced odometer yields null', () => {
  assert.equal(consumptionBetween(fullTank(2000, 40), fullTank(1500, 60)), null);
  // Identical readings are a distance of zero, not a division by zero.
  assert.equal(consumptionBetween(fullTank(1500, 40), fullTank(1500, 60)), null);
});

test('partial fills are excluded from consumption', () => {
  const partialNow = { odometer_km: 1500, litres: 60, is_full_tank: false };
  assert.equal(consumptionBetween(fullTank(1000, 40), partialNow), null);

  const partialBefore = { odometer_km: 1000, litres: 40, is_full_tank: false };
  assert.equal(consumptionBetween(partialBefore, fullTank(1500, 60)), null);
});

test('cost per km follows the same conditions as consumption', () => {
  const previous = fullTank(1000, 40);
  const current = fullTank(1500, 60, { total_cost_kz: 25200 });
  assert.equal(costPerKmBetween(previous, current), 50.4);
  assert.equal(costPerKmBetween(fullTank(2000, 40), current), null);
});

test('withConsumption sorts oldest-first and leaves the first fill null', () => {
  const rows = withConsumption([
    { id: 'b', filled_at: '2026-02-01T00:00:00Z', ...fullTank(1500, 60) },
    { id: 'a', filled_at: '2026-01-01T00:00:00Z', ...fullTank(1000, 40) },
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['a', 'b']
  );
  assert.equal(rows[0].litres_per_100km, null, 'nothing to compare the first fill against');
  assert.equal(rows[1].litres_per_100km, 12);
});

test('averageConsumption ignores spans that produced no number', () => {
  const average = averageConsumption([
    { filled_at: '2026-01-01T00:00:00Z', ...fullTank(1000, 40) },
    { filled_at: '2026-02-01T00:00:00Z', ...fullTank(1500, 60) }, // 12
    { filled_at: '2026-03-01T00:00:00Z', ...fullTank(2000, 50) }, // 10
    { filled_at: '2026-04-01T00:00:00Z', odometer_km: null, litres: 55, is_full_tank: true },
  ]);
  assert.equal(average, 11);
});

test('averageConsumption is null when nothing is derivable', () => {
  assert.equal(averageConsumption([{ filled_at: '2026-01-01T00:00:00Z', ...fullTank(1000, 40) }]), null);
  assert.equal(averageConsumption([]), null);
});

test('the fleet average weights by distance, not by bus', () => {
  // A bus that drove 10 000 km must not be averaged flat against one that
  // drove 100.
  const average = fleetAverageConsumption([
    { litres_per_100km: 10, km_travelled: 10000 },
    { litres_per_100km: 30, km_travelled: 100 },
  ]);
  assert.equal(average, 10.2);
});

test('an outlier is more than 20 per cent above the fleet average', () => {
  assert.equal(isConsumptionOutlier(12, 10), false, 'exactly 20 per cent is not over it');
  assert.equal(isConsumptionOutlier(12.1, 10), true);
  assert.equal(isConsumptionOutlier(9, 10), false);
  assert.equal(isConsumptionOutlier(12, null), false, 'no benchmark, no outlier');
});

test('a lower odometer warns but never blocks', () => {
  const check = checkOdometer('900', '1000');
  assert.equal(check.level, 'warning');
  assert.match(check.message, /1000 km/);
  assert.notEqual(check.level, 'error', 'odometers get replaced — this must stay savable');
});

test('a negative odometer is the one genuine error', () => {
  assert.equal(checkOdometer('-5', null).level, 'error');
});

test('a blank odometer is a hint about consumption, not a failure', () => {
  assert.equal(checkOdometer('', '1000').level, 'hint');
});

test('validateFuelEntry requires a bus and positive litres', () => {
  assert.equal(validateFuelEntry({ bus_id: 'x', litres: 120 }).valid, true);
  assert.equal(validateFuelEntry({ litres: 120 }).valid, false);
  assert.equal(validateFuelEntry({ bus_id: 'x', litres: 0 }).valid, false);
  assert.equal(validateFuelEntry({ bus_id: 'x' }).valid, false);
});

test('validateFuelEntry accepts a fill with no price and no total', () => {
  // The b_apply_fuel_price trigger derives both from the configured price
  // (§4.3), so an agent supplying only litres is a complete entry.
  const { valid } = validateFuelEntry({ bus_id: 'x', litres: 120 });
  assert.equal(valid, true);
});

test('validateFuelEntry accepts the amount paid instead of litres', () => {
  // What the pump shows is the price, so recording only that is a complete
  // entry too — the trigger works back to litres.
  assert.equal(validateFuelEntry({ bus_id: 'x', total_cost_kz: 50000 }).valid, true);
});

test('validateFuelEntry rejects an entry with neither litres nor a total', () => {
  const { valid, errors } = validateFuelEntry({ bus_id: 'x' });
  assert.equal(valid, false);
  assert.equal(errors.litres, 'Indique os litros ou o total pago.');
});

test('validateFuelEntry rejects a zero total standing in for litres', () => {
  // Deriving from it would write litres of 0, which the litres > 0 check
  // rejects with a message no agent can act on.
  const { valid, errors } = validateFuelEntry({ bus_id: 'x', total_cost_kz: 0 });
  assert.equal(valid, false);
  assert.equal(errors.total_cost_kz, 'O total tem de ser maior que zero.');
});

test('deriveFuelAmounts turns the amount paid into litres', () => {
  // The form opens with the configured price already filled in, so typing the
  // total is all it takes.
  const r = deriveFuelAmounts({ litres: '', pricePerLitre: '420', totalCost: '63000' }, 'totalCost');
  assert.equal(r.litres, 150);
});
