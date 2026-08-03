import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { extractBrandVoice, getBrandVoiceGuide } from '@/lib/brand/voice-guide';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Params { params: Promise<{ token: string }> }

async function resolvePortalEmail(supabase: ReturnType<typeof createAdminClient>, token: string) {
  const { data } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  return (data?.portal_email as string | null) ?? null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const portalEmail = await resolvePortalEmail(supabase, token);
  if (!portalEmail) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (auth.portalEmail && auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const guide = await getBrandVoiceGuide(portalEmail, supabase);
  return NextResponse.json({ guide });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const portalEmail = await resolvePortalEmail(supabase, token);
  if (!portalEmail) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (auth.portalEmail && auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json() as { samples?: string[]; guide?: string };

  // Modo manual: el dueño pega la guía directamente
  if (typeof body.guide === 'string') {
    const guide = body.guide.trim();
    const { error } = await supabase
      .from('organizations')
      .update({
        brand_voice_guide:      guide || null,
        brand_voice_updated_at: new Date().toISOString(),
      })
      .eq('portal_email', portalEmail);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, guide });
  }

  // Modo extraer: envías muestras y el modelo produce la guía
  const samples = Array.isArray(body.samples) ? body.samples : [];
  const result  = await extractBrandVoice({ portalEmail, samples, supabase });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, guide: result.guide });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const portalEmail = await resolvePortalEmail(supabase, token);
  if (!portalEmail) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (auth.portalEmail && auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  await supabase
    .from('organizations')
    .update({ brand_voice_guide: null, brand_voice_updated_at: null })
    .eq('portal_email', portalEmail);
  return NextResponse.json({ ok: true });
}
