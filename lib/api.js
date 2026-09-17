import { NextResponse } from 'next/server';

/** The refusal every route returns from its auth gate, in one place. */
export function denied(auth) {
  return NextResponse.json({ error: auth.error }, { status: auth.status });
}

export function badRequest(error, fields) {
  return NextResponse.json({ error, fields }, { status: 400 });
}

export function serverError(error) {
  return NextResponse.json(
    { error: error?.message || 'Não foi possível guardar. Tente novamente.' },
    { status: 500 }
  );
}

/**
 * Turns a Postgres error into something an Angolan agent can act on. The raw
 * message is English and mentions constraint names, which is no use in the UI.
 */
export function friendlyDbError(error) {
  if (!error) return 'Não foi possível guardar. Tente novamente.';
  if (error.code === '23505') {
    if (String(error.message).includes('fleet_fuel_prices')) {
      return 'Já existe um preço com esta data de início.';
    }
    return 'Este registo já existe.';
  }
  if (error.code === '23503') return 'Referência inválida — o registo ligado já não existe.';
  if (error.code === '23514') return 'Valor fora dos limites permitidos.';
  return error.message || 'Não foi possível guardar. Tente novamente.';
}

/**
 * Applies the multi-tenant scope from §2.2 to a PostgREST query.
 * `companyId` of null means a Nawabus super-admin, who sees every company.
 */
export function scopeToCompany(query, companyId, column = 'company_id') {
  return companyId ? query.eq(column, companyId) : query;
}

/** Reads an integer query param, falling back when absent or nonsense. */
export function intParam(searchParams, name, fallback, { min = 1, max = 500 } = {}) {
  const raw = searchParams.get(name);
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
