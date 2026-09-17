// Pure refuelling maths. No imports on purpose: this is the logic that is easy
// to get wrong and invisible when wrong, so it stays directly unit-testable.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Parses a number written the way it is written in Angola: ',' is the decimal
 * mark and '.' groups thousands — "1.234,56" is one thousand two hundred.
 *
 * Reading '.' as a decimal point is how "99.000 Kz" became 99 Kz and a fill of
 * 235 litres was recorded as 0,24. The app formats every amount it prints with
 * those separators (formatKz gives "63.000 Kz"), so it has to read them back.
 *
 * A lone '.' is ambiguous — "1.5" is a decimal everywhere, "1.000" is a
 * thousand here. Groups of exactly three digits are the giveaway, and that is
 * the only case treated as grouping; anything else stays a decimal point, so a
 * price pasted as "420.50" still means 420,50.
 */
export function parseAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // \s misses the non-breaking space that Intl uses as a group separator.
  const trimmed = String(value).replace(/[\s  ]/g, '').trim();
  if (!trimmed) return null;

  let normalised;
  if (trimmed.includes(',')) {
    // A comma settles it: everything before it that is a '.' groups thousands.
    normalised = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalised = trimmed.replace(/\./g, '');
  } else {
    normalised = trimmed;
  }

  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fills in the third of litres / price-per-litre / total from the other two.
 *
 * `changed` is the field the user just typed in, and it is never overwritten —
 * that is what lets someone type a total that does not match litres x price
 * (a station charging off-rate, §6.3) and have the *price* move instead of
 * their total being silently corrected.
 *
 * `typed` lists the fields a person actually entered. It matters because
 * onChange fires per keystroke: typing 99000 into an empty total derives
 * litres of 0,02 from the first "9", and on the next keystroke that derived
 * 0,02 looked exactly like litres somebody had entered, so the off-rate rule
 * above took over and drove the price to 4.950.000 Kz. A figure this function
 * produced is not evidence of intent; only a typed one decides which of the
 * other two fields moves. Omitting `typed` keeps the old behaviour, where
 * every filled field counts as entered.
 */
export function deriveFuelAmounts(values, changed, typed = null) {
  const litres = parseAmount(values.litres);
  const price = parseAmount(values.pricePerLitre);
  const total = parseAmount(values.totalCost);
  const next = { litres, pricePerLitre: price, totalCost: total };

  const canDivide = (n) => typeof n === 'number' && n > 0;
  const entered = (field) => (typed ? typed.includes(field) : true);

  if (changed === 'litres') {
    if (canDivide(litres) && price !== null) next.totalCost = round2(litres * price);
    else if (canDivide(litres) && total !== null) next.pricePerLitre = round2(total / litres);
  } else if (changed === 'pricePerLitre') {
    // A total somebody typed outranks one this function wrote: re-deriving it
    // from a derived litres would quietly replace the amount they paid.
    if (entered('totalCost') && canDivide(price) && total !== null) {
      next.litres = round2(total / price);
    } else if (litres !== null && price !== null) {
      next.totalCost = round2(litres * price);
    } else if (canDivide(price) && total !== null) {
      next.litres = round2(total / price);
    }
  } else if (changed === 'totalCost') {
    if (entered('litres') && canDivide(litres) && total !== null) {
      next.pricePerLitre = round2(total / litres);
    } else if (canDivide(price) && total !== null) {
      next.litres = round2(total / price);
    } else if (canDivide(litres) && total !== null) {
      next.pricePerLitre = round2(total / litres);
    }
  }

  return next;
}

/**
 * Litres per 100 km between two consecutive fills, or null when the data
 * cannot support a real number.
 *
 * Both fills must be full tanks: the litres of the later fill only measure the
 * distance since the earlier one if the tank started and ended at the same
 * level. This is stricter than fleet_fuel_summary() (§4.7), which filters on
 * the later fill alone — that aggregate tolerates the approximation across many
 * rows, but a single number shown to an agent at the pump should not.
 *
 * A rolled-back or replaced odometer (current <= previous) yields null rather
 * than a negative distance and a nonsense consumption figure.
 */
export function consumptionBetween(previous, current) {
  if (!previous || !current) return null;
  if (previous.is_full_tank === false || current.is_full_tank === false) return null;

  const prevOdo = parseAmount(previous.odometer_km);
  const currOdo = parseAmount(current.odometer_km);
  const litres = parseAmount(current.litres);

  if (prevOdo === null || currOdo === null || litres === null) return null;
  if (currOdo <= prevOdo || litres <= 0) return null;

  return round2((litres * 100) / (currOdo - prevOdo));
}

/** Kz per km over the same span, or null on the same conditions. */
export function costPerKmBetween(previous, current) {
  if (consumptionBetween(previous, current) === null) return null;
  const km = parseAmount(current.odometer_km) - parseAmount(previous.odometer_km);
  const cost = parseAmount(current.total_cost_kz);
  if (cost === null || km <= 0) return null;
  return round2(cost / km);
}

/**
 * Walks a bus's fills oldest-first and annotates each with the consumption
 * since the one before it.
 */
export function withConsumption(fills) {
  const sorted = [...(fills || [])].sort(
    (a, b) => new Date(a.filled_at) - new Date(b.filled_at)
  );
  return sorted.map((fill, i) => ({
    ...fill,
    litres_per_100km: consumptionBetween(sorted[i - 1], fill),
    cost_per_km_kz: costPerKmBetween(sorted[i - 1], fill),
  }));
}

/** Average L/100 km across every span that produced a number. */
export function averageConsumption(fills) {
  const values = withConsumption(fills)
    .map((f) => f.litres_per_100km)
    .filter((v) => v !== null);
  if (!values.length) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * More than 20 % above the fleet average — usually a mechanical fault or fuel
 * theft, and the single most valuable number the reports produce (§6.5).
 */
export const OUTLIER_THRESHOLD = 1.2;

export function isConsumptionOutlier(value, fleetAverage) {
  const v = parseAmount(value);
  const avg = parseAmount(fleetAverage);
  if (v === null || avg === null || avg <= 0) return false;
  return v > avg * OUTLIER_THRESHOLD;
}

/** Fleet-wide litres-per-100km, weighted by distance rather than by bus. */
export function fleetAverageConsumption(rows) {
  let litres = 0;
  let km = 0;
  for (const row of rows || []) {
    const l = parseAmount(row.litres_per_100km);
    const k = parseAmount(row.km_travelled);
    if (l === null || k === null || k <= 0) continue;
    litres += (l * k) / 100;
    km += k;
  }
  if (km <= 0) return null;
  return round2((litres * 100) / km);
}

/**
 * The odometer check from §6.3: warn, never block. Odometers get replaced and
 * a hurried agent typing a plausible-but-lower number should still be able to
 * save the fill rather than lose the receipt.
 */
export function checkOdometer(value, lastKnown) {
  const odo = parseAmount(value);
  if (odo === null) {
    return { level: 'hint', message: 'Sem quilometragem não é possível calcular o consumo.' };
  }
  if (odo < 0) return { level: 'error', message: 'A quilometragem não pode ser negativa.' };

  const last = parseAmount(lastKnown);
  if (last === null) return { level: 'ok', message: null };

  if (odo < last) {
    return {
      level: 'warning',
      message: `Inferior à última leitura (${Math.round(last)} km). Confirme — o consumo deste abastecimento não será calculado.`,
    };
  }
  if (odo - last > 5000) {
    return {
      level: 'warning',
      message: `Mais ${Math.round(odo - last)} km desde a última leitura. Confirme o valor.`,
    };
  }
  return { level: 'ok', message: null };
}

/** Everything the API must be satisfied with before writing a fill. */
export function validateFuelEntry(input) {
  const errors = {};
  if (!input.bus_id) errors.bus_id = 'Escolha o autocarro.';

  const litres = parseAmount(input.litres);
  const total = parseAmount(input.total_cost_kz);

  // At the pump people know what they paid, not how many litres went in — the
  // amount is on the display and the receipt. Either one is enough: whichever
  // is missing is derived from the price in force (§4.3), client-side while
  // typing and again in b_apply_fuel_price for anything that arrives without it.
  if (litres === null) {
    if (total === null) errors.litres = 'Indique os litros ou o total pago.';
    else if (total <= 0) errors.total_cost_kz = 'O total tem de ser maior que zero.';
  } else if (litres <= 0) errors.litres = 'Os litros têm de ser maiores que zero.';
  else if (litres > 2000) errors.litres = 'Valor de litros pouco plausível. Confirme.';

  const price = parseAmount(input.price_per_litre_kz);
  if (price !== null && price < 0) errors.price_per_litre_kz = 'O preço não pode ser negativo.';

  if (total !== null && total < 0) errors.total_cost_kz = 'O total não pode ser negativo.';

  const odo = parseAmount(input.odometer_km);
  if (odo !== null && odo < 0) errors.odometer_km = 'A quilometragem não pode ser negativa.';

  return { valid: Object.keys(errors).length === 0, errors };
}
