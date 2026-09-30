export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { refreshIfNeeded } from '@/lib/connectors';
import type { IntegrationRow } from '@/lib/connectors';
import { fetchSentGmailForVoice, fetchSentOutlookForVoice } from '@/lib/email/fetch-recent';
import { extractBrandVoice } from '@/lib/brand/voice-guide';

// Aprende el TONO DE LA MARCA leyendo los correos ENVIADOS por el negocio en
// los últimos 30 días. Distinto de role-email-learning (que extrae REGLAS DE
// DECISIÓN de la bandeja completa): aquí queremos el estilo lingüístico —
// ritmo, palabras favoritas, cierres, formalidad — para inyectarlo como
// brand_voice_guide en el system prompt de los 3 canales.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  const portalEmail = resolved?.portalEmail ?? null;
  if (!portalEmail) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (!session.portalEmail || session.portalEmail !== portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Cargar integración de correo per-org (integration_accounts). Sin fallback
  // per-agent porque el tono es del NEGOCIO, no de un empleado — si el dueño
  // no conectó buzón de la marca, no hay tono que extraer.
  const { data: orgAcct } = await supabase
    .from('integration_accounts')
    .select('provider, account_label, access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .in('provider', ['gmail', 'outlook'])
    .maybeSingle();

  if (!orgAcct) {
    return NextResponse.json(
      { error: 'Sin correo del negocio conectado. Conecta Gmail o Outlook en Oficina → Integraciones.' },
      { status: 422 },
    );
  }
  if (orgAcct.status === 'needs_reauth') {
    return NextResponse.json(
      { error: 'La conexión de correo requiere reautorizarse. Ve a Oficina → Integraciones para reconectarla.' },
      { status: 422 },
    );
  }

  const integration: IntegrationRow = {
    id:                 `org:${portalEmail}:${orgAcct.provider}`,
    agent_id:           '',
    provider:           orgAcct.provider as 'gmail' | 'outlook',
    email:              (orgAcct.account_label as string | null) ?? '',
    access_token:       (orgAcct.access_token as string | null) ?? '',
    refresh_token:      (orgAcct.refresh_token as string | null) ?? null,
    token_expires_at:   (orgAcct.expires_at as string | null) ?? null,
    last_sync_at:       null,
    needs_reauth:       false,
    reauth_notified_at: null,
  };

  const accessToken = await refreshIfNeeded(integration, supabase);

  // Ventana: 30 días atrás, hasta 20 correos enviados con body.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const emails = integration.provider === 'gmail'
    ? await fetchSentGmailForVoice(accessToken, since, 20)
    : await fetchSentOutlookForVoice(accessToken, since, 20);

  // Filtrar samples utilizables: body > 200 chars (extractBrandVoice ya exige
  // 40 min por sample y 400 chars total, pero mejor filtrar aquí para no
  // gastar la tarea en un batch inservible).
  const samples = emails
    .map(e => (e.body || e.snippet || '').trim())
    .filter(s => s.length > 200);

  if (samples.length < 2) {
    return NextResponse.json(
      {
        error:         'No se encontraron suficientes correos enviados en los últimos 30 días para extraer el tono. Necesito al menos 2 correos con contenido real. No se consumieron tareas.',
        total_fetched: emails.length,
        usable:        samples.length,
      },
      { status: 422 },
    );
  }

  // Cobra 3 tareas (una operación multi-I/O: fetch + LLM + guardado en DB).
  const opsResult = await consumeAiOp(portalEmail, 3, {
    source:       'brand_voice_from_emails',
    reference_id: `${portalEmail}:${new Date().toISOString().slice(0, 10)}`,
    label:        'Aprendizaje del tono de marca desde correos enviados',
  });
  if (!opsResult.ok) {
    return NextResponse.json({ error: 'Sin tareas disponibles para esta operación.' }, { status: 402 });
  }

  // Delegar extracción + guardado en organizations.brand_voice_guide.
  const result = await extractBrandVoice({ portalEmail, samples, supabase });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'No se pudo extraer el tono.' }, { status: 500 });
  }

  return NextResponse.json({
    ok:            true,
    guide:         result.guide,
    emails_used:   samples.length,
    total_fetched: emails.length,
  });
}
