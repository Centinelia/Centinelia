import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name')
    .eq('portal_token', token)
    .eq('portal_email', session.portalEmail)
    .single();

  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('logo') as File | null;

  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'El archivo no puede superar 2 MB' }, { status: 400 });

  const ext  = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${agent.id}/logo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(path, buffer, { upsert: true, contentType: file.type });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);

  const url = `${publicUrl}?t=${Date.now()}`;

  // Escribir en organizations.logo_url (fuente de verdad por cuenta).
  // También sincronizamos voice_agents.logo_url para retrocompat, hasta que
  // se drope esa columna (ver issue-logo-url-por-agente).
  await supabase
    .from('organizations')
    .upsert(
      { portal_email: session.portalEmail, logo_url: url },
      { onConflict: 'portal_email' },
    );
  await supabase
    .from('voice_agents')
    .update({ logo_url: url })
    .eq('portal_email', session.portalEmail);

  return NextResponse.json({ url });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name')
    .eq('portal_token', token)
    .eq('portal_email', session.portalEmail)
    .single();

  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  await supabase.storage.from('logos').remove([
    `${agent.id}/logo.png`, `${agent.id}/logo.jpg`,
    `${agent.id}/logo.webp`, `${agent.id}/logo.svg`,
  ]);
  // Limpiar en organizations (fuente de verdad) + voice_agents (retrocompat).
  await supabase
    .from('organizations')
    .update({ logo_url: null })
    .eq('portal_email', session.portalEmail);
  await supabase
    .from('voice_agents')
    .update({ logo_url: null })
    .eq('portal_email', session.portalEmail);

  return NextResponse.json({ ok: true });
}
