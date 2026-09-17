import { NextResponse } from 'next/server';
import { requireFleetUser } from '@/lib/auth';
import { pushToUser } from '@/lib/push-server';
import { denied, serverError } from '@/lib/api';

/**
 * §7.2f — without this, diagnosing a silent push on somebody's phone is
 * guesswork. Goes to the caller's own devices only.
 */
export async function POST() {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  try {
    const result = await pushToUser(auth.user.id, {
      title: 'Notificação de teste',
      body: 'Notificação de teste — Nawa-frotas está a funcionar.',
      url: '/notificacoes',
      tag: 'teste',
    });

    if (result.skipped === 'vapid-missing') {
      return NextResponse.json(
        { error: 'As chaves de notificação não estão configuradas no servidor.' },
        { status: 503 }
      );
    }
    if (result.devices === 0) {
      return NextResponse.json(
        { error: 'Nenhum dispositivo registado. Ative as notificações primeiro.' },
        { status: 404 }
      );
    }
    // Devices are registered but nothing got through. Saying "enviada" here
    // would leave someone waiting for a notification that never left, which
    // defeats the point of a test button.
    if (result.sent === 0) {
      return NextResponse.json(
        { error: `Não foi possível entregar a notificação (${result.failures?.[0] ?? 'erro desconhecido'}).` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Enviada para ${result.sent} dispositivo(s).`,
      ...result,
    });
  } catch (err) {
    return serverError(err);
  }
}
