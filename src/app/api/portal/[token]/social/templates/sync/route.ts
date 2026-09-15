/**
 * POST /api/portal/[token]/social/templates/sync
 *
 * Sincroniza las plantillas de marca desde Canva para un agente dado.
 * Busca el token de Canva en integration_accounts (provider='canva', capability='design'),
 * llama a CanvaProvider.listBrandTemplates() y hace upsert en brand_templates.
 *
 * Body: { agent_id: string }
 *
 * Seguridad: session + IDOR + feature flag (via guardPortalSocialRequest).
 * El agente debe pertenecer a la org (verificado via .eq portal_email).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';
import { CanvaProvider } from '@/lib/social/canva';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, supabase } = guard;

  let body: { agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { agent_id: agentId } = body;
  if (!agentId) {
    return NextResponse.json({ error: 'agent_id es requerido' }, { status: 400 });
  }

  // Buscar el token de Canva en integration_accounts (R35: Canva tokens viven aquí)
  const { data: integration, error: integErr } = await supabase
    .from('integration_accounts')
    .select('access_token')
    .eq('agent_id', agentId)
    .eq('portal_email', resolved.portalEmail)
    .eq('provider', 'canva')
    .eq('capability', 'design')
    .eq('status', 'active')
    .maybeSingle();

  if (integErr) {
    return NextResponse.json({ error: integErr.message }, { status: 500 });
  }
  if (!integration) {
    return NextResponse.json(
      { error: 'No hay integración de Canva activa para este empleado. Conecta Canva primero.' },
      { status: 400 },
    );
  }

  // Obtener plantillas desde Canva
  const canva     = new CanvaProvider(integration.access_token);
  const templates = await canva.listBrandTemplates();

  if (templates.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 });
  }

  // Hacer upsert de cada plantilla en brand_templates
  const rows = templates.map((t) => ({
    portal_email:       resolved.portalEmail,
    agent_id:           agentId,
    canva_template_id:  t.id,
    name:               t.title,
    preview_url:        t.previewUrl,
    view_url:           t.viewUrl,
    active:             true,
  }));

  const { error: upsertErr } = await supabase
    .from('brand_templates')
    .upsert(rows, { onConflict: 'portal_email,canva_template_id' });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, synced: templates.length });
}
