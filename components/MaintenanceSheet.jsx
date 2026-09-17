'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Field, { Textarea, Toggle } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { SEVERITIES, SEVERITY_ORDER, validateMaintenance } from '@/lib/maintenance';

const EMPTY = {
  bus_id: '',
  title: '',
  description: '',
  severity: 'medium',
  scheduled_for: '',
  workshop: '',
  odometer_km: '',
  takes_bus_offline: false,
};

export default function MaintenanceSheet({ open, onClose, buses, defaultBusId, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({ ...EMPTY, bus_id: defaultBusId || '' });
  }, [open, defaultBusId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { valid, errors: fieldErrors } = validateMaintenance(form);
    if (!valid) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.fields) setErrors(payload.fields);
        throw new Error(payload.error || 'Não foi possível guardar. Tente novamente.');
      }
      toast('Avaria registada. A equipa foi notificada.', 'success');
      onSaved?.(payload.issue);
      onClose?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Reportar manutenção">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 pb-8">
        <Field label="Autocarro" error={errors.bus_id}>
          <Select
            value={form.bus_id}
            onChange={(e) => setForm((f) => ({ ...f, bus_id: e.target.value }))}
            required
          >
            <option value="">Escolher autocarro…</option>
            {(buses || []).map((bus) => (
              <option key={bus.bus_id} value={bus.bus_id}>
                {bus.license_plate}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Avaria" error={errors.title}>
          <Input
            placeholder="Ex.: Travões a chiar"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </Field>

        <Field label="Gravidade">
          <Select
            value={form.severity}
            onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
          >
            {SEVERITY_ORDER.map((key) => (
              <option key={key} value={key}>
                {SEVERITIES[key].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Descrição">
          <Textarea
            placeholder="O que se passa, desde quando, o que já foi tentado"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Agendada para">
            <Input
              type="date"
              value={form.scheduled_for}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_for: e.target.value }))}
            />
          </Field>
          <Field label="Quilometragem">
            <Input
              inputMode="numeric"
              placeholder="km"
              value={form.odometer_km}
              onChange={(e) => setForm((f) => ({ ...f, odometer_km: e.target.value }))}
            />
          </Field>
        </div>

        <Field label="Oficina">
          <Input
            placeholder="Nome da oficina"
            value={form.workshop}
            onChange={(e) => setForm((f) => ({ ...f, workshop: e.target.value }))}
          />
        </Field>

        <Toggle
          checked={form.takes_bus_offline}
          onChange={(v) => setForm((f) => ({ ...f, takes_bus_offline: v }))}
          label="Autocarro não pode circular"
          description="Fica assinalado na avaria. Retirar da venda de bilhetes é um passo separado, com confirmação."
        />

        {form.takes_bus_offline ? (
          <p className="flex items-start gap-2 rounded-2xl bg-warning/20 px-4 py-3 text-xs text-warning-foreground">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Isto assinala a avaria como impeditiva, mas <strong>não</strong> retira o autocarro da
            venda. Faça-o na página do autocarro, em Desativar.
          </p>
        ) : null}

        <Button type="submit" size="lg" className="mt-1 w-full" loading={saving}>
          Registar avaria
        </Button>
      </form>
    </Sheet>
  );
}
