import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { extractBrandVoice, getBrandVoiceGuide } from '@/lib/brand/voice-guide';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Params { params: Promise<{ token: string }> }

async function resolvePortalEmail(_supabase: ReturnType<typeof createAdminClient>, token: string) {
  const resolved = await resolveOrgFromToken(token);
  return resolved?.portalEmail ?? null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const portalEmail = await resolvePortalEmail(supabase, token);
  if (!portalEmail) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (!auth.portalEmail || auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const guide = await getBrandVoiceGuide(portalEmail, supabase);
  const { data: org } = await supabase
    .from('organizations')
    .select('banned_terms')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  const banned_terms = ((org as Record<string, unknown> | null)?.banned_terms as string | null) ?? null;
  return NextResponse.json({ guide, banned_terms });
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const portalEmail = await resolvePortalEmail(supabase, token);
  if (!portalEmail) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (!auth.portalEmail || auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json() as { samples?: string[]; guide?: string; banned_terms?: string };

  // Modo manual: el dueño pega la guía directamente y/o edita banned_terms.
  // Ambos son opcionales — si viene solo uno, se actualiza solo ese.
  const hasGuide  = typeof body.guide        === 'string';
  const hasBanned = typeof body.banned_terms === 'string';
  if (hasGuide || hasBanned) {
    const patch: Record<string, unknown> = {};
    if (hasGuide) {
      patch.brand_voice_guide      = body.guide!.trim() || null;
      patch.brand_voice_updated_at = new Date().toISOString();
    }
    if (hasBanned) {
      patch.banned_terms = body.banned_terms!.trim() || null;
    }
    const { error } = await supabase
      .from('organizations')
      .update(patch)
      .eq('portal_email', portalEmail);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, guide: body.guide, banned_terms: body.banned_terms });
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
  if (!auth.portalEmail || auth.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  await supabase
    .from('organizations')
    .update({ brand_voice_guide: null, brand_voice_updated_at: null })
    .eq('portal_email', portalEmail);
  return NextResponse.json({ ok: true });
}
