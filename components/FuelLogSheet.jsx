'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, CloudOff, Loader2, X } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Field, { Textarea, Toggle } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { deriveFuelAmounts, checkOdometer, parseAmount, validateFuelEntry } from '@/lib/fuel';
import { formatConsumption, formatKz, toLocalInputValue, fromLocalInputValue } from '@/lib/format';
import { queueFuelEntry } from '@/lib/offline-queue';

/** Shows the value the user typed, not a re-formatted version of it. */
function show(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

const EMPTY = {
  bus_id: '',
  litres: '',
  pricePerLitre: '',
  totalCost: '',
  odometer_km: '',
  station: '',
  driver_id: '',
  notes: '',
  is_full_tank: true,
  filled_at: '',
};

/**
 * The refuelling form (§6.3). Optimised for a phone held at a filling station:
 * every number is one tap away, any one of litres / price / total can be the
 * one that is typed, and nothing here blocks a save that a receipt can justify.
 */
export default function FuelLogSheet({ open, onClose, buses, drivers, currentPrice, defaultBusId, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  // Recent first: the bus somebody filled yesterday is overwhelmingly the one
  // they are filling now.
  const orderedBuses = useMemo(() => {
    return [...(buses || [])].sort((a, b) => {
      const at = a.last_filled_at ? new Date(a.last_filled_at).getTime() : 0;
      const bt = b.last_filled_at ? new Date(b.last_filled_at).getTime() : 0;
      if (at !== bt) return bt - at;
      return String(a.license_plate).localeCompare(String(b.license_plate), 'pt');
    });
  }, [buses]);

  const selectedBus = orderedBuses.find((b) => b.bus_id === form.bus_id) || null;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setReceipt(null);
    setForm({
      ...EMPTY,
      bus_id: defaultBusId || '',
      // Prefilled from the configured price (§4.3) and editable — a station
      // charging off-rate is normal.
      pricePerLitre: currentPrice ? String(currentPrice) : '',
      filled_at: toLocalInputValue(new Date()),
    });
  }, [open, defaultBusId, currentPrice]);

  // Prefill the odometer with this bus's last reading as soon as one is picked.
  useEffect(() => {
    if (!selectedBus) return;
    setForm((f) => ({
      ...f,
      odometer_km: f.odometer_km || (selectedBus.last_odometer_km ?? ''),
    }));
  }, [selectedBus]);

  const setAmount = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      const derived = deriveFuelAmounts(
        { litres: next.litres, pricePerLitre: next.pricePerLitre, totalCost: next.totalCost },
        field
      );
      return {
        ...next,
        // The field just typed in keeps exactly what was typed; only the other
        // two are replaced by derived values.
        litres: field === 'litres' ? value : show(derived.litres),
        pricePerLitre: field === 'pricePerLitre' ? value : show(derived.pricePerLitre),
        totalCost: field === 'totalCost' ? value : show(derived.totalCost),
      };
    });
  };

  const odometerCheck = checkOdometer(form.odometer_km, selectedBus?.last_odometer_km);

  const uploadReceipt = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('bus_id', form.bus_id || 'sem-autocarro');
      const res = await fetch('/api/fuel/upload', { method: 'POST', body });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Não foi possível enviar o recibo.');
      setReceipt({ path: payload.path, name: file.name });
      toast('Recibo anexado.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const buildEntry = () => ({
    bus_id: form.bus_id,
    litres: parseAmount(form.litres),
    price_per_litre_kz: parseAmount(form.pricePerLitre),
    total_cost_kz: parseAmount(form.totalCost),
    odometer_km: parseAmount(form.odometer_km),
    station: form.station,
    driver_id: form.driver_id || null,
    notes: form.notes,
    is_full_tank: form.is_full_tank,
    filled_at: fromLocalInputValue(form.filled_at),
    receipt_url: receipt?.path || null,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const entry = buildEntry();
    const { valid, errors: fieldErrors } = validateFuelEntry(entry);
    if (!valid) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      const res = await fetch('/api/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.fields) setErrors(payload.fields);
        throw new Error(payload.error || 'Não foi possível guardar. Tente novamente.');
      }

      // The consumption since the previous fill, when it is derivable — the
      // one number that tells an agent at the pump whether something is wrong.
      const consumption = payload.consumption;
      toast(
        consumption
          ? `Abastecimento registado. Consumo: ${formatConsumption(consumption)}`
          : 'Abastecimento registado com sucesso.',
        'success'
      );
      onSaved?.(payload.fuelLog);
      onClose?.();
    } catch (err) {
      // A filling station often has no signal (§8.2). Rather than losing the
      // entry, hold it in IndexedDB and flush it when the phone is back online.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline || err.message === 'Failed to fetch') {
        try {
          await queueFuelEntry(entry);
          toast('Sem ligação. O abastecimento foi guardado e será enviado depois.', 'info');
          onSaved?.(null);
          onClose?.();
          return;
        } catch {
          toast('Sem ligação e não foi possível guardar localmente.', 'error');
          return;
        }
      }
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Registar abastecimento">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 pb-8">
        <Field label="Autocarro" error={errors.bus_id}>
          <Select
            value={form.bus_id}
            onChange={(e) => setForm((f) => ({ ...f, bus_id: e.target.value, odometer_km: '' }))}
            required
          >
            <option value="">Escolher autocarro…</option>
            {orderedBuses.map((bus) => (
              <option key={bus.bus_id} value={bus.bus_id}>
                {bus.license_plate}
                {bus.make ? ` · ${bus.make} ${bus.model || ''}`.trimEnd() : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {/* Not `required`: typing the total instead fills this in. */}
          <Field label="Litros" error={errors.litres}>
            <Input
              inputMode="decimal"
              placeholder="0,0"
              value={form.litres}
              onChange={(e) => setAmount('litres', e.target.value)}
            />
          </Field>
          <Field label="Preço por litro (Kz)" error={errors.price_per_litre_kz}>
            <Input
              inputMode="decimal"
              placeholder={currentPrice ? String(currentPrice) : '0,00'}
              value={form.pricePerLitre}
              onChange={(e) => setAmount('pricePerLitre', e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Total pago (Kz)"
          hint={
            parseAmount(form.totalCost)
              ? formatKz(parseAmount(form.totalCost))
              : 'Escreva os litros ou o total — o outro é calculado.'
          }
          error={errors.total_cost_kz}
        >
          <Input
            inputMode="decimal"
            placeholder="0"
            value={form.totalCost}
            onChange={(e) => setAmount('totalCost', e.target.value)}
          />
        </Field>

        <Field
          label="Quilometragem"
          hint={odometerCheck.message}
          hintTone={odometerCheck.level}
          error={errors.odometer_km}
        >
          <Input
            inputMode="numeric"
            placeholder={
              selectedBus?.last_odometer_km ? `Última: ${selectedBus.last_odometer_km}` : 'km'
            }
            value={form.odometer_km}
            onChange={(e) => setForm((f) => ({ ...f, odometer_km: e.target.value }))}
          />
        </Field>

        <Toggle
          checked={form.is_full_tank}
          onChange={(v) => setForm((f) => ({ ...f, is_full_tank: v }))}
          label="Depósito cheio"
          description="O cálculo do consumo depende de dois depósitos cheios seguidos."
        />

        <Field label="Data e hora">
          <Input
            type="datetime-local"
            value={form.filled_at}
            onChange={(e) => setForm((f) => ({ ...f, filled_at: e.target.value }))}
          />
        </Field>

        <Field label="Posto">
          <Input
            placeholder="Nome do posto"
            value={form.station}
            onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))}
          />
        </Field>

        <Field label="Motorista">
          <Select
            value={form.driver_id}
            onChange={(e) => setForm((f) => ({ ...f, driver_id: e.target.value }))}
          >
            <option value="">Sem motorista indicado</option>
            {(drivers || []).map((d) => (
              <option key={d.id} value={d.id}>
                {[d.first_name, d.last_name].filter(Boolean).join(' ')}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Recibo">
          {receipt ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              <span className="flex items-center gap-2 truncate">
                <Check size={15} />
                <span className="truncate">{receipt.name}</span>
              </span>
              <button type="button" onClick={() => setReceipt(null)} aria-label="Remover recibo">
                <X size={15} />
              </button>
            </div>
          ) : (
            <label className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-border px-4 text-sm text-muted-foreground">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              {uploading ? 'A enviar…' : 'Fotografar ou escolher ficheiro'}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => uploadReceipt(e.target.files?.[0])}
                disabled={uploading}
              />
            </label>
          )}
        </Field>

        <Field label="Notas">
          <Textarea
            placeholder="Observações (opcional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Field>

        {typeof navigator !== 'undefined' && navigator.onLine === false ? (
          <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
            <CloudOff size={14} />
            Sem ligação. O registo fica guardado e é enviado assim que houver rede.
          </p>
        ) : null}

        <Button type="submit" size="lg" className="mt-1 w-full" loading={saving}>
          Guardar abastecimento
        </Button>
      </form>
    </Sheet>
  );
}
