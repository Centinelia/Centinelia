/**
 * Portal API — inventory Excel config (org-level).
 *
 * GET  → devuelve la config actual (o defaults vacíos)
 * POST → upsert atómico de la config completa
 *
 * Seguridad:
 *   - session cookie válida (verifySession)
 *   - IDOR: session.portalEmail === resolved.portalEmail
 *   - requirePortalAccess({ ownerOnly: true }) → sub-users no pueden tocar la
 *     configuración del archivo Excel (afecta operaciones de Nami en todo el org)
 *   - rate limit: limiters.chat (20 req/min) suficiente para form tuning
 *
 * La config vive en `organizations.inventory_excel_config` (JSONB). Shape
 * canónico documentado en src/lib/inventory/adapter.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { requirePortalAccess } from '@/lib/portal/access';
import { rateLimit, limiters } from '@/lib/ratelimit';
import type { InventoryExcelConfig } from '@/lib/inventory/adapter';
import type { ExcelDriveScope } from '@/lib/inventory/graph-excel';

export const dynamic = 'force-dynamic';

// ── Validación manual (no zod en el repo) ────────────────────────────────────

interface ValidationResult<T> {
  ok:      boolean;
  value?:  T;
  error?:  string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateConfig(body: unknown): ValidationResult<InventoryExcelConfig> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Cuerpo inválido.' };
  const b = body as Record<string, unknown>;

  // location
  const loc = b.location as Record<string, unknown> | undefined;
  if (!loc || typeof loc !== 'object') return { ok: false, error: 'Falta la ubicación del archivo.' };
  if (!isNonEmptyString(loc.itemId)) return { ok: false, error: 'El ID del archivo (itemId) es obligatorio.' };

  const scopeRaw = loc.scope as Record<string, unknown> | undefined;
  if (!scopeRaw || typeof scopeRaw !== 'object') return { ok: false, error: 'Falta el ámbito (scope) de la ubicación.' };

  let scope: ExcelDriveScope;
  switch (scopeRaw.type) {
    case 'me':
      scope = { type: 'me' };
      break;
    case 'user':
      if (!isNonEmptyString(scopeRaw.userId)) return { ok: false, error: 'userId requerido para scope user.' };
      scope = { type: 'user', userId: scopeRaw.userId.trim() };
      break;
    case 'site':
      if (!isNonEmptyString(scopeRaw.siteId)) return { ok: false, error: 'siteId requerido para scope site.' };
      scope = {
        type:    'site',
        siteId:  scopeRaw.siteId.trim(),
        driveId: isNonEmptyString(scopeRaw.driveId) ? scopeRaw.driveId.trim() : undefined,
      };
      break;
    default:
      return { ok: false, error: 'scope.type debe ser "me", "user" o "site".' };
  }

  // sheets
  const sheets = b.sheets as Record<string, unknown> | undefined;
  if (!sheets || typeof sheets !== 'object') return { ok: false, error: 'Falta la configuración de hojas.' };

  const historico = sheets.historico as Record<string, unknown> | undefined;
  if (!historico || !isNonEmptyString(historico.name) || !isNonEmptyString(historico.table))
    return { ok: false, error: 'Hoja histórico: nombre y tabla son obligatorios.' };

  const stock = sheets.stock as Record<string, unknown> | undefined;
  if (!stock || !isNonEmptyString(stock.name))
    return { ok: false, error: 'Hoja de stock: el nombre es obligatorio.' };
  const headerRow = Number(stock.header_row);
  if (!Number.isFinite(headerRow) || headerRow < 1)
    return { ok: false, error: 'header_row de stock debe ser un número entero mayor o igual a 1.' };
  for (const col of ['ideal_column', 'stock_column', 'modelo_column', 'propuesta_column'] as const) {
    if (!isNonEmptyString(stock[col])) return { ok: false, error: `stock.${col} es obligatorio (letra de columna).` };
  }

  const backlogRaw = sheets.backlog as Record<string, unknown> | undefined;
  let backlog: InventoryExcelConfig['sheets']['backlog'] | undefined;
  if (backlogRaw && isNonEmptyString(backlogRaw.name)) {
    const startRow = Number(backlogRaw.start_row);
    if (!Number.isFinite(startRow) || startRow < 1)
      return { ok: false, error: 'backlog.start_row debe ser entero mayor o igual a 1.' };
    backlog = { name: backlogRaw.name.trim(), start_row: startRow };
  }

  // columns_historico — mapa header lógico → nombre real
  const cols = b.columns_historico as Record<string, unknown> | undefined;
  if (!cols || typeof cols !== 'object') return { ok: false, error: 'Falta columns_historico.' };
  const columns_historico: Record<string, string> = {};
  for (const [k, v] of Object.entries(cols)) {
    if (!isNonEmptyString(v)) continue;
    columns_historico[k] = v.trim();
  }
  if (Object.keys(columns_historico).length === 0)
    return { ok: false, error: 'columns_historico no puede estar vacío.' };

  // Listas
  const estatus_validos    = Array.isArray(b.estatus_validos)    ? b.estatus_validos.filter(isNonEmptyString).map(s => s.trim().toUpperCase())    : [];
  const bodegas_canonicas  = Array.isArray(b.bodegas_canonicas)  ? b.bodegas_canonicas.filter(isNonEmptyString).map(s => s.trim().toUpperCase())  : [];

  if (estatus_validos.length === 0)   return { ok: false, error: 'estatus_validos no puede estar vacío.' };
  if (bodegas_canonicas.length === 0) return { ok: false, error: 'bodegas_canonicas no puede estar vacío.' };

  let bodegas_aliases: Record<string, string> | undefined;
  if (b.bodegas_aliases && typeof b.bodegas_aliases === 'object') {
    bodegas_aliases = {};
    for (const [alias, target] of Object.entries(b.bodegas_aliases as Record<string, unknown>)) {
      if (isNonEmptyString(alias) && isNonEmptyString(target)) {
        bodegas_aliases[alias.trim().toUpperCase()] = target.trim().toUpperCase();
      }
    }
  }

  const encargados_reposicion = Array.isArray(b.encargados_reposicion)
    ? b.encargados_reposicion
        .filter(isNonEmptyString)
        .map(s => s.trim().toLowerCase())
        .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    : undefined;

  const value: InventoryExcelConfig = {
    location:            { scope, itemId: loc.itemId.trim() },
    sheets: {
      historico: { name: historico.name.trim(), table: historico.table.trim() },
      stock: {
        name:              stock.name.trim(),
        header_row:        headerRow,
        ideal_column:      String(stock.ideal_column).trim().toUpperCase(),
        stock_column:      String(stock.stock_column).trim().toUpperCase(),
        modelo_column:     String(stock.modelo_column).trim().toUpperCase(),
        propuesta_column:  String(stock.propuesta_column).trim().toUpperCase(),
      },
      ...(backlog ? { backlog } : {}),
    },
    columns_historico,
    estatus_validos,
    bodegas_canonicas,
    ...(bodegas_aliases     ? { bodegas_aliases }     : {}),
    ...(encargados_reposicion ? { encargados_reposicion } : {}),
  };

  return { ok: true, value };
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  if (session.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('inventory_excel_config')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    config:     (data?.inventory_excel_config as InventoryExcelConfig | null) ?? null,
    configured: !!(data?.inventory_excel_config as InventoryExcelConfig | null)?.location?.itemId,
  });
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limited = await rateLimit(req, limiters.chat);
  if (limited) return limited;

  const gate = await requirePortalAccess(req, { ownerOnly: true });
  if (!gate.ok) return gate.response;

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  // IDOR guard adicional (defense in depth) — el session del gate ya viene verificado
  if (gate.session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const parsed = validateConfig(body);
  if (!parsed.ok || !parsed.value) {
    return NextResponse.json({ error: parsed.error ?? 'Configuración inválida.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({ inventory_excel_config: parsed.value })
    .eq('portal_email', resolved.portalEmail);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           gate.session.portalEmail,
    endpoint:              '/api/portal/[token]/inventario/config',
    method:                'POST',
    affected_portal_email: resolved.portalEmail,
    query_type:            'modify',
    filters:               { itemId: parsed.value.location.itemId, scope: parsed.value.location.scope.type },
  });

  return NextResponse.json({ ok: true, config: parsed.value });
}
