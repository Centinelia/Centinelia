/**
 * POST /api/portal/[token]/billing/pendientes/[id]
 * body: { action: 'approve' | 'reject' | 'edit', corrections?: {...} }
 *
 * - approve: marca como approved, re-encola el email para que Nala reintente
 *   submit_invoice_batch con la extracción ORIGINAL (sin cambios).
 * - reject: marca como rejected, no vuelve a intentar (Beatriz decidió no timbrar).
 * - edit: guarda las corrections del usuario, marca edited_approved, re-encola
 *   el job pasando las corrections como override para Nala.
 *
 * Ver dry run FASE 4 (2026-09-07) UX fix.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { enqueueBillingEmail } from '@/lib/billing/employee/queue';

interface Params { params: Promise<{ token: string; id: string }> }

interface ActionBody {
  action:       'approve' | 'reject' | 'edit';
  corrections?: Record<string, unknown>;
}

const VALID_ACTIONS = new Set(['approve', 'reject', 'edit']);

export async function POST(req: NextRequest, { params }: Params) {
  const { token, id } = await params;

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as ActionBody;
  if (!VALID_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: `action debe ser approve|reject|edit` }, { status: 400 });
  }
  if (body.action === 'edit' && (!body.corrections || typeof body.corrections !== 'object')) {
    return NextResponse.json({ error: 'edit requiere corrections' }, { status: 400 });
  }

  // Validaciones mínimas para approve/edit — evita que Beatriz apruebe una card
  // con RFC vacío, total NaN o cliente vacío que luego truena silente en el
  // adapter. Reject no valida porque no se timbra.
  if (body.action !== 'reject' && body.corrections) {
    const c = body.corrections as Record<string, unknown>;
    const rfc = typeof c['rfc'] === 'string' ? c['rfc'].trim() : '';
    if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc)) {
      return NextResponse.json({
        error: `RFC "${rfc}" no tiene el formato válido (ej. CAL051103F36). Corrige antes de aprobar.`,
      }, { status: 400 });
    }
    if ('total' in c) {
      const total = Number(c['total']);
      if (!Number.isFinite(total) || total <= 0) {
        return NextResponse.json({
          error: `Total inválido (${c['total']}). Debe ser un número mayor a 0.`,
        }, { status: 400 });
      }
    }
    if (Array.isArray(c['productos'])) {
      const productos = c['productos'] as Array<Record<string, unknown>>;
      if (productos.length === 0) {
        return NextResponse.json({
          error: 'No hay productos. Agrega al menos uno antes de aprobar.',
        }, { status: 400 });
      }
      const sinSku = productos.find(p => !p['sku'] || String(p['sku']).trim() === '');
      if (sinSku) {
        return NextResponse.json({
          error: `Un producto no tiene código SKU. Corrígelo o quítalo antes de aprobar.`,
        }, { status: 400 });
      }
    }
  }

  const supabase = createAdminClient();

  // Verificar que el pending pertenece al portal.
  const { data: pending, error: pendErr } = await supabase
    .from('billing_pending_review')
    .select('id, portal_email, email_id, status')
    .eq('id', id)
    .maybeSingle<{ id: string; portal_email: string; email_id: string; status: string }>();
  if (pendErr) return NextResponse.json({ error: pendErr.message }, { status: 500 });
  if (!pending) return NextResponse.json({ error: 'pending no encontrado' }, { status: 404 });
  if (pending.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (pending.status !== 'pending') {
    return NextResponse.json({ error: `pending ya está en estado ${pending.status}` }, { status: 409 });
  }

  const nextStatus =
    body.action === 'approve' ? 'approved' :
    body.action === 'reject' ? 'rejected' :
    'edited_approved';

  const patch: Record<string, unknown> = {
    status:      nextStatus,
    resolved_at: new Date().toISOString(),
    resolved_by: session.portalEmail,
  };
  if (body.action === 'edit') patch.corrections = body.corrections;

  const { error: updErr } = await supabase
    .from('billing_pending_review')
    .update(patch)
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Approve/edit: además de re-encolar (fallback), intentamos disparar el
  // submit inmediato para que el XML llegue a Dropbox en segundos, no minutos
  // (default del cron: hasta 10 min). Beatriz refresca y ya ve XML sellado.
  // El re-encolado sirve como red de seguridad si el submit inmediato falla.
  let inlineXmlPath: string | null = null;
  let inlineError:   string | null = null;
  if (body.action !== 'reject') {
    const { data: emailRow } = await supabase
      .from('billing_incoming_emails')
      .select('integration_id')
      .eq('id', pending.email_id)
      .maybeSingle<{ integration_id: string }>();

    // Fire-and-forget encola de todos modos.
    if (emailRow?.integration_id) {
      try {
        await enqueueBillingEmail({
          emailId:       pending.email_id,
          kind:          'process_notes',
          portalEmail:   resolved.portalEmail,
          integrationId: emailRow.integration_id,
        });
      } catch (e) {
        console.error('[pendientes POST] re-enqueue failed:', (e as Error).message);
      }
    }

    // Submit inmediato — sincrono, para que la UI vea el resultado real.
    try {
      const { data: integ } = await supabase
        .from('organization_integrations')
        .select('config')
        .eq('id', emailRow?.integration_id ?? '')
        .maybeSingle<{ config: Record<string, unknown> }>();
      if (integ?.config) {
        const { hydrateDropboxRefresh } = await import('@/lib/billing/adapters/hydrate-refresh');
        const { buildAdapter } = await import('@/lib/billing/adapters');
        const { submitApprovedForEmail } = await import('@/lib/billing/tortilleria/submit-approved');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = integ.config as any;
        await hydrateDropboxRefresh(cfg, resolved.portalEmail, supabase);
        const adapter = buildAdapter(cfg);
        const submitResult = await submitApprovedForEmail({
          portalEmail: resolved.portalEmail,
          emailId:     pending.email_id,
          adapter,
          supabase,
        });
        const mine = submitResult.submitted.find(s => s.pendingId === id);
        if (mine) inlineXmlPath = mine.xmlPath;
        const mineErr = submitResult.errors.find(e => e.pendingId === id);
        if (mineErr) inlineError = mineErr.reason;
      }
    } catch (e) {
      inlineError = (e as Error).message;
      console.warn('[pendientes POST] submit inmediato falló (cron reintentará):', inlineError);
    }
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    ...(inlineXmlPath ? { xml_path: inlineXmlPath } : {}),
    ...(inlineError   ? { submit_warning: inlineError } : {}),
  });
}
