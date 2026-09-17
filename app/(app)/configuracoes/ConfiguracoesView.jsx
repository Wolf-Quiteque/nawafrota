'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, Fuel, Send, Smartphone } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Field from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatKzPrecise, formatDateTime, toLocalInputValue, fromLocalInputValue } from '@/lib/format';
import { parseAmount } from '@/lib/fuel';
import {
  currentSubscription,
  disablePush,
  enablePush,
  isIos,
  isStandalone,
  pushBlockedReason,
} from '@/lib/push';

export default function ConfiguracoesView({ currentPrice, history, isAdmin }) {
  const [price, setPrice] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const newPrice = parseAmount(price);

  const savePrice = async (e) => {
    e.preventDefault();
    if (!newPrice || newPrice <= 0) {
      toast('Indique um preço válido.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/fuel-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_per_litre_kz: newPrice,
          effective_from: effectiveFrom ? fromLocalInputValue(effectiveFrom) : undefined,
          note,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Não foi possível guardar.');
      toast('Novo preço registado.', 'success');
      setPrice('');
      setNote('');
      setEffectiveFrom('');
      router.refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Preço do combustível e notificações" />

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Fuel size={16} />
          </span>
          <h2 className="text-sm font-bold">Preço do gasóleo</h2>
        </div>

        <p className="mt-3 text-[26px] font-extrabold leading-none tracking-tight">
          {currentPrice ? `${formatKzPrecise(currentPrice)}/L` : 'Não configurado'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Preço em vigor, usado nos novos registos.</p>

        {isAdmin ? (
          <form onSubmit={savePrice} className="mt-4 flex flex-col gap-3">
            <Field label="Novo preço (Kz/L)">
              <Input
                inputMode="decimal"
                placeholder="450"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>

            <Field
              label="Em vigor a partir de"
              hint="Deixe em branco para aplicar já. Uma data futura é permitida e útil — um aumento anunciado hoje e aplicado segunda-feira entra uma só vez."
            >
              <Input
                type="datetime-local"
                value={effectiveFrom}
                min={toLocalInputValue(new Date())}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </Field>

            <Field label="Nota">
              <Input
                placeholder="Motivo da alteração (opcional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            {newPrice && currentPrice ? (
              <p className="rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
                Novos abastecimentos passam a usar {Math.round(currentPrice)} →{' '}
                {Math.round(newPrice)} Kz/L. Registos anteriores não mudam.
              </p>
            ) : null}

            <Button type="submit" className="w-full" loading={saving}>
              Guardar novo preço
            </Button>
          </form>
        ) : (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
            Só administradores podem alterar o preço do combustível.
          </p>
        )}
      </section>

      <section className="mt-4">
        <h2 className="mb-2 text-sm font-bold">Histórico de preços</h2>
        {history.length ? (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {history.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {formatKzPrecise(row.price_per_litre_kz)}/L
                    {row.scheduled ? (
                      <Badge tone="info" className="ml-2">
                        Agendado
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(row.effective_from)}
                    {row.author
                      ? ` · ${[row.author.first_name, row.author.last_name].filter(Boolean).join(' ')}`
                      : ''}
                  </p>
                  {row.note ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Sem alterações de preço registadas.
          </p>
        )}
      </section>

      <PushSettings />
    </div>
  );
}

function PushSettings() {
  const [enabled, setEnabled] = useState(false);
  const [blocked, setBlocked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const toast = useToast();

  // Read on the client only: every one of these checks touches navigator or
  // Notification, neither of which exists during the server render.
  useEffect(() => {
    setBlocked(pushBlockedReason());
    currentSubscription()
      .then((sub) => setEnabled(Boolean(sub)))
      .finally(() => setReady(true));
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast('Notificações desativadas neste aparelho.', 'info');
      } else {
        await enablePush();
        setEnabled(true);
        setBlocked(null);
        toast('Notificações ativadas neste aparelho.', 'success');
      }
    } catch (err) {
      toast(err.message, 'error');
      setBlocked(pushBlockedReason());
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Não foi possível enviar.');
      toast(payload.message || 'Notificação de teste enviada.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Bell size={16} />
        </span>
        <h2 className="text-sm font-bold">Notificações</h2>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Receba um aviso quando um autocarro for abastecido ou precisar de manutenção, mesmo com a
        app fechada.
      </p>

      {!ready ? null : blocked ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Smartphone size={14} className="mt-0.5 shrink-0" />
          <span>
            {blocked}
            {isIos() && !isStandalone() ? (
              <span className="mt-1 block">
                No Safari: Partilhar → Adicionar ao ecrã principal, e abra a app a partir daí.
              </span>
            ) : null}
          </span>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {/* Permission must come from a tap — requested on page load it is
              denied by default in Chrome and ignored on iOS (§7.2b). */}
          <Button variant={enabled ? 'secondary' : 'primary'} onClick={toggle} loading={busy}>
            {enabled ? <BellOff size={15} /> : <Bell size={15} />}
            {enabled ? 'Desativar notificações' : 'Ativar notificações'}
          </Button>

          {enabled ? (
            <Button variant="ghost" onClick={sendTest} loading={busy}>
              <Send size={15} />
              Enviar notificação de teste
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
