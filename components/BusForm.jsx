'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Field from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { checkCapacityChange } from '@/lib/fleet';
import { sellableSeatCount } from '@/lib/seats';

/**
 * Add and edit share one form: the fields are identical and the capacity guard
 * has to behave the same in both.
 */
export default function BusForm({ bus, maxSoldSeat = null, mode = 'create' }) {
  const [form, setForm] = useState({
    license_plate: bus?.license_plate || '',
    make: bus?.make || '',
    model: bus?.model || '',
    year: bus?.year || '',
    capacity: bus?.capacity ?? '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();

  // Checked as the user types, not only on submit — being told at the pump
  // that the number was impossible ten fields ago is no help. The server
  // re-checks it anyway; this is the courtesy copy.
  const capacityCheck =
    mode === 'edit' && form.capacity !== '' ? checkCapacityChange(form.capacity, maxSoldSeat) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fields = {};
    if (!form.license_plate.trim()) fields.license_plate = 'Indique a matrícula.';
    if (!form.make.trim()) fields.make = 'Indique a marca.';
    if (!form.model.trim()) fields.model = 'Indique o modelo.';
    if (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1) {
      fields.capacity = 'Indique uma lotação válida.';
    }
    if (form.year !== '' && (!Number.isInteger(Number(form.year)) || Number(form.year) < 1950 || Number(form.year) > 2100)) {
      fields.year = 'Indique um ano válido.';
    }
    if (Object.keys(fields).length) {
      setErrors(fields);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      const url = mode === 'edit' ? `/api/buses/${bus.bus_id}` : '/api/buses';
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_plate: form.license_plate,
          make: form.make,
          model: form.model,
          year: form.year === '' ? null : Number(form.year),
          capacity: Number(form.capacity),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload.fields) setErrors(payload.fields);
        throw new Error(payload.error || 'Não foi possível guardar. Tente novamente.');
      }

      toast(mode === 'edit' ? 'Autocarro atualizado.' : 'Autocarro adicionado.', 'success');
      router.push(`/frota/${payload.bus?.id || bus.bus_id}`);
      router.refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sellable = Number(form.capacity) > 0 ? sellableSeatCount(form.capacity) : 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Matrícula" error={errors.license_plate}>
        <Input
          placeholder="LDA-00-00-AA"
          value={form.license_plate}
          onChange={(e) => setForm((f) => ({ ...f, license_plate: e.target.value.toUpperCase() }))}
          autoCapitalize="characters"
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca" error={errors.make}>
          <Input
            placeholder="HIGER"
          value={form.make}
          onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
          required
          />
        </Field>
        <Field label="Modelo" error={errors.model}>
          <Input
            placeholder="KLQ6122K"
          value={form.model}
          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ano" error={errors.year}>
          <Input
            inputMode="numeric"
            placeholder="2024"
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            min="1950"
            max="2100"
          />
        </Field>
        <Field
          label="Lotação"
          hint={
            sellable
              ? `${sellable} lugares à venda (o lugar 1 é do co-piloto)`
              : undefined
          }
          error={errors.capacity || (capacityCheck && !capacityCheck.allowed ? capacityCheck.error : null)}
        >
          <Input
            inputMode="numeric"
            placeholder="51"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            min="1"
            step="1"
            required
          />
        </Field>
      </div>

      {mode === 'edit' && maxSoldSeat ? (
        <p className="flex items-start gap-2 rounded-2xl bg-warning/20 px-4 py-3 text-xs text-warning-foreground">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          O lugar {maxSoldSeat} já está vendido numa viagem futura. A lotação não pode ficar abaixo
          desse número.
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="mt-2 w-full"
        loading={saving}
        disabled={Boolean(capacityCheck && !capacityCheck.allowed)}
      >
        {mode === 'edit' ? 'Guardar alterações' : 'Adicionar autocarro'}
      </Button>
    </form>
  );
}
