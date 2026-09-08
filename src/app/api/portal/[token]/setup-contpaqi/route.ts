/**
 * GET /api/portal/[token]/setup-contpaqi
 *   → state actual: si ya está configurado devuelve el config (sin token cifrado);
 *     si Dropbox no está conectado devuelve `dropbox_missing: true`.
 *
 * POST /api/portal/[token]/setup-contpaqi
 *   body: {
 *     rfc_emisor, regimen_fiscal, codigo_postal_emisor,
 *     serie_default, uso_cfdi_default, clave_sat_default_producto,
 *     dropbox_base_path
 *   }
 *   → Upsert organization_integrations type='contpaqi'.
 *   → Genera writer_api_token único de 32 hex chars si no existe (idempotente en reruns).
 *   → Sincroniza token Dropbox si ya hay integration_accounts (llama syncTokenFor).
 *   → Devuelve config + writer_api_token para mostrarlos en la UI.
 *
 * Auth: portal session + org ownership.
 * Wizard Setup CONTPAQi (dry run FASE 4, 2026-09-07 noche).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

interface SetupBody {
  rfc_emisor:                 string;
  regimen_fiscal:             string;
  codigo_postal_emisor:       string;
  serie_default?:             string;
  uso_cfdi_default?:          string;
  clave_sat_default_producto?: string;
  dropbox_base_path?:         string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

async function guard(token: string) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (session.portalEmail !== resolved.portalEmail) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session, resolved };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const g = await guard(token);
  if ('error' in g) return g.error;
  const supabase = createAdminClient();

  // ¿Hay Dropbox conectado?
  const { data: dbx } = await supabase
    .from('integration_accounts')
    .select('agent_id, account_label, status, expires_at')
    .eq('portal_email', g.resolved.portalEmail)
    .eq('provider', 'dropbox')
    .eq('status', 'active')
    .maybeSingle();

  // Config actual de CONTPAQi.
  const { data: integ } = await supabase
    .from('organization_integrations')
    .select('id, config, updated_at')
    .eq('portal_email', g.resolved.portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle<{ id: string; config: Record<string, unknown>; updated_at: string }>();

  const config = integ?.config as Record<string, unknown> | undefined;
  const fiscal = (config?.['fiscal'] as Record<string, unknown> | undefined) ?? {};
  const scheduled = (config?.['scheduled_task'] as Record<string, unknown> | undefined) ?? {};

  return NextResponse.json({
    dropbox_connected: !!dbx,
    dropbox: dbx ? {
      account_label: dbx.account_label,
      expires_at:    dbx.expires_at,
    } : null,
    configured: !!integ,
    updated_at: integ?.updated_at ?? null,
    config: integ ? {
      rfc_emisor:                 fiscal['rfc_emisor'] ?? '',
      regimen_fiscal:             fiscal['regimen_fiscal'] ?? '',
      codigo_postal_emisor:       fiscal['codigo_postal_emisor'] ?? '',
      serie_default:              fiscal['serie_default'] ?? 'T',
      uso_cfdi_default:           fiscal['uso_cfdi_default'] ?? 'G03',
      clave_sat_default_producto: fiscal['clave_sat_default_producto'] ?? '50161509',
      dropbox_base_path:          (config?.['dropbox_base_path'] as string | undefined) ?? '/Facturacion',
      expected_sync_interval_minutes: scheduled['expected_sync_interval_minutes'] ?? 60,
    } : null,
    writer_api_token: config?.['writer_api_token'] ?? null,
    endpoint_base:    APP_URL,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const g = await guard(token);
  if ('error' in g) return g.error;
  const supabase = createAdminClient();

  const body = await req.json() as SetupBody;

  // Precondition: Dropbox conectado.
  const { data: dbx } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('portal_email', g.resolved.portalEmail)
    .eq('provider', 'dropbox')
    .eq('status', 'active')
    .maybeSingle();
  if (!dbx) {
    return NextResponse.json({ error: 'Conecta Dropbox primero antes de configurar CONTPAQi.' }, { status: 400 });
  }

  // Validación mínima.
  const rfc = (body.rfc_emisor ?? '').toUpperCase().trim();
  if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc)) {
    return NextResponse.json({ error: 'RFC emisor inválido.' }, { status: 400 });
  }
  if (!body.regimen_fiscal) {
    return NextResponse.json({ error: 'Régimen fiscal requerido.' }, { status: 400 });
  }
  if (!/^\d{5}$/.test(body.codigo_postal_emisor ?? '')) {
    return NextResponse.json({ error: 'Código postal debe tener 5 dígitos.' }, { status: 400 });
  }

  // Preservar writer_api_token si ya existe; generar uno si es primer setup.
  const { data: existing } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', g.resolved.portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle<{ config: Record<string, unknown> }>();
  const existingToken = existing?.config?.['writer_api_token'] as string | undefined;
  const writerApiToken = existingToken ?? randomBytes(24).toString('base64url');

  const newConfig: Record<string, unknown> = {
    type:               'contpaqi',
    dropbox_token:      (existing?.config?.['dropbox_token'] as string | undefined) ?? '',
    dropbox_base_path:  body.dropbox_base_path?.trim() || '/Facturacion',
    storage_backend:    'dropbox',
    writer_api_token:   writerApiToken,
    fiscal: {
      rfc_emisor:                 rfc,
      regimen_fiscal:             body.regimen_fiscal,
      codigo_postal_emisor:       body.codigo_postal_emisor,
      serie_default:              body.serie_default?.trim() || 'T',
      uso_cfdi_default:           body.uso_cfdi_default?.trim() || 'G03',
      clave_sat_default_producto: body.clave_sat_default_producto?.trim() || '50161509',
    },
    scheduled_task: {
      expected_sync_interval_minutes: 60,
      stale_warning_minutes:          120,
      stale_escalation_hours:         6,
    },
  };

  // Upsert.
  if (existing) {
    const { error: updErr } = await supabase
      .from('organization_integrations')
      .update({ config: newConfig })
      .eq('portal_email', g.resolved.portalEmail)
      .eq('type', 'contpaqi');
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  } else {
    const { error: insErr } = await supabase
      .from('organization_integrations')
      .insert({ portal_email: g.resolved.portalEmail, type: 'contpaqi', config: newConfig });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Sync del token Dropbox a organization_integrations (best-effort).
  try {
    const { syncTokenFor } = await import('@/lib/dropbox/token-sync');
    await syncTokenFor(g.resolved.portalEmail, supabase);
  } catch (e) {
    console.warn(`[setup-contpaqi] sync token failed: ${(e as Error).message}`);
  }

  return NextResponse.json({
    ok: true,
    writer_api_token: writerApiToken,
    endpoint_base:    APP_URL,
    dropbox_base_path: newConfig.dropbox_base_path,
    portal_email:     g.resolved.portalEmail,
  });
}
