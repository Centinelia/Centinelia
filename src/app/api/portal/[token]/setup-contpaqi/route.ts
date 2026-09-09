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
import { encrypt } from '@/lib/crypto';

interface Params { params: Promise<{ token: string }> }

interface WindowsFields {
  sdk_path?:       string;
  empresa_path?:   string;
  usuario?:        string;
  concepto?:       string;
  sql_connection?: string;
  // Passwords: envías el nuevo valor para escribir; envías '' o omites para
  // conservar el guardado; envías el sentinel '__unchanged__' explícito para
  // mayor claridad si el UI muestra `••••••` sin borrar.
  password?:       string;
  csd_password?:   string;
}

interface SetupBody {
  rfc_emisor:                 string;
  regimen_fiscal:             string;
  codigo_postal_emisor:       string;
  serie_default?:             string;
  uso_cfdi_default?:          string;
  clave_sat_default_producto?: string;
  dropbox_base_path?:         string;
  windows?:                   WindowsFields;
}

const PASSWORD_UNCHANGED = '__unchanged__';

// Fields Windows-locales que Beatriz llena en el portal para que Nazre / ella
// no tenga que teclearlos en el wizard CLI del writer. Se guardan bajo
// config.windows. Passwords cifrados con encrypt() en reposo, descifrados
// on-demand por writer-download al momento del zip (single-shot auth).
type StoredWindowsConfig = {
  sdk_path:                  string;
  empresa_path:              string;
  usuario:                   string;
  concepto:                  string;
  sql_connection:            string;
  password_encrypted:        string;
  csd_password_encrypted:    string;
};

function normalizePath(input: string | undefined | null): string {
  if (!input) return '';
  return input.trim().replace(/\//g, '\\');
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
  const windows = (config?.['windows'] as Partial<StoredWindowsConfig> | undefined) ?? {};

  // Estado del writer basado en heartbeat (writer_last_ping_at, actualizado por
  // /api/writer/dropbox-token cada arranque + cada 60min).
  //   never      → nunca ha respondido (recién guardado, PC apagada, etc.)
  //   healthy    → ping en los últimos 90 min (rango normal, poll cada 60min + slack)
  //   stale      → última ping entre 90 min y 24 h
  //   dead       → última ping > 24 h
  const lastPingRaw = config?.['writer_last_ping_at'] as string | undefined;
  const lastPingAt  = lastPingRaw ? new Date(lastPingRaw) : null;
  const ageMs       = lastPingAt ? Date.now() - lastPingAt.getTime() : null;
  const writerStatus: 'never' | 'healthy' | 'stale' | 'dead' =
    !lastPingAt        ? 'never'   :
    ageMs! < 90 * 60_000              ? 'healthy' :
    ageMs! < 24 * 60 * 60_000         ? 'stale'   :
                                        'dead';

  return NextResponse.json({
    dropbox_connected: !!dbx,
    dropbox: dbx ? {
      account_label: dbx.account_label,
      expires_at:    dbx.expires_at,
    } : null,
    configured: !!integ,
    updated_at: integ?.updated_at ?? null,
    writer_status:       writerStatus,
    writer_last_ping_at: lastPingRaw ?? null,
    config: integ ? {
      rfc_emisor:                 fiscal['rfc_emisor'] ?? '',
      regimen_fiscal:             fiscal['regimen_fiscal'] ?? '',
      codigo_postal_emisor:       fiscal['codigo_postal_emisor'] ?? '',
      serie_default:              fiscal['serie_default'] ?? 'T',
      uso_cfdi_default:           fiscal['uso_cfdi_default'] ?? 'G03',
      clave_sat_default_producto: fiscal['clave_sat_default_producto'] ?? '50161509',
      dropbox_base_path:          (config?.['dropbox_base_path'] as string | undefined) ?? '/Facturacion',
      expected_sync_interval_minutes: scheduled['expected_sync_interval_minutes'] ?? 60,
      windows: {
        sdk_path:       windows.sdk_path       ?? 'C:\\Program Files (x86)\\Compac\\COMERCIAL',
        empresa_path:   windows.empresa_path   ?? '',
        usuario:        windows.usuario        ?? 'SUPERVISOR',
        concepto:       windows.concepto       ?? '440',
        sql_connection: windows.sql_connection ?? '',
        // Nunca regresamos las passwords; solo si YA hay algo guardado indicamos con "set".
        password_set:     !!windows.password_encrypted,
        csd_password_set: !!windows.csd_password_encrypted,
      },
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

  // Windows: merge con lo existente para preservar passwords si el UI no las
  // reenvió (por ejemplo cuando venían masked como `••••••` en el form).
  const existingWindows = (existing?.config?.['windows'] as Partial<StoredWindowsConfig> | undefined) ?? {};
  const w                = body.windows ?? {};

  // Validaciones básicas — path debe empezar con drive letter, no URL.
  const empresa = normalizePath(w.empresa_path);
  if (empresa && !/^[a-z]:\\/i.test(empresa)) {
    return NextResponse.json({ error: 'Ruta de empresa CONTPAQi inválida. Debe empezar con una letra de unidad, ej. C:\\Compac\\Empresas\\adTuEmpresa' }, { status: 400 });
  }
  const sdk = normalizePath(w.sdk_path);
  if (sdk && !/^[a-z]:\\/i.test(sdk)) {
    return NextResponse.json({ error: 'Ruta del SDK CONTPAQi inválida. Debe empezar con una letra de unidad.' }, { status: 400 });
  }

  const newPasswordEncrypted =
    w.password === undefined || w.password === PASSWORD_UNCHANGED
      ? (existingWindows.password_encrypted ?? '')
      : w.password === ''
        ? ''
        : encrypt(w.password);

  const newCsdPasswordEncrypted =
    w.csd_password === undefined || w.csd_password === PASSWORD_UNCHANGED
      ? (existingWindows.csd_password_encrypted ?? '')
      : w.csd_password === ''
        ? ''
        : encrypt(w.csd_password);

  const windowsConfig: StoredWindowsConfig = {
    sdk_path:                  sdk || 'C:\\Program Files (x86)\\Compac\\COMERCIAL',
    empresa_path:              empresa,
    usuario:                   (w.usuario ?? '').trim() || 'SUPERVISOR',
    concepto:                  (w.concepto ?? '').trim() || '440',
    sql_connection:            (w.sql_connection ?? '').trim(),
    password_encrypted:        newPasswordEncrypted,
    csd_password_encrypted:    newCsdPasswordEncrypted,
  };

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
    windows: windowsConfig,
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
