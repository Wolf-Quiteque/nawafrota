import { NextResponse } from 'next/server';
import { requireFleetUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, serverError } from '@/lib/api';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/**
 * Receipts are financial records, so the bucket is private (§4.9): the file is
 * uploaded server-side with the service-role key and the client only ever gets
 * a short-lived signed URL. The stored path — not the URL — goes on the row,
 * because a signed URL expires and a saved one would rot.
 */
export async function POST(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return badRequest('Nenhum ficheiro recebido.');
  if (file.size > MAX_BYTES) return badRequest('O recibo é demasiado grande (máximo 8 MB).');
  if (file.type && !ALLOWED.includes(file.type)) {
    return badRequest('Formato não suportado. Use uma fotografia ou PDF.');
  }

  const busId = form.get('bus_id') || 'sem-autocarro';
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  const path = `${busId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage
      .from('fuel-receipts')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: signed } = await supabase.storage
      .from('fuel-receipts')
      .createSignedUrl(path, 60 * 60);

    return NextResponse.json({ path, signedUrl: signed?.signedUrl ?? null }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

/** Re-signs a stored path when someone opens an old receipt. */
export async function GET(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const path = new URL(request.url).searchParams.get('path');
  if (!path) return badRequest('Caminho em falta.');

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from('fuel-receipts').createSignedUrl(path, 60 * 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
