import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import type { AgentFeatures } from '@/types/agent';

/**
 * PATCH /api/admin/clientes/[key]
 *
 * Edición a nivel cliente (un cliente = un `portal_email` compartido por N empleados).
 * `key` es el `portal_email` URL-encoded. Aplica el update a TODOS los empleados
 * del pool. Los campos que viven en `organizations` (business_hours, etc.) se
 * upsertean allá; los que viven en voice_agents se hacen bulk update.
 *
 * Body admitido (todos opcionales):
 *   - client_name        (voice_agents)
 *   - client_email       (voice_agents)
 *   - timezone           (voice_agents)
 *   - business_address   (voice_agents)
 *   - calendar_url       (voice_agents)
 *   - business_website   (organizations)
 *   - business_hours     (organizations) | null para desactivar
 *   - vertical           ('negocio' | 'gobierno') — merge dentro de features.vertical
 */

// Campos que viven en la tabla `organizations` (movidos en commit e372013).
const ORG_FIELDS = new Set([
  'business_hours',
  'business_website',
  'business_description',
]);

// Campos que viven en `voice_agents` a nivel bulk (mismo valor para todos los empleados).
const AGENT_BULK_FIELDS = new Set([
  'client_name',
  'client_email',
  'timezone',
  'business_address',
  'business_name',
  'business_phone_display',
  'calendar_url',
]);

interface Params {
  params: Promise<{ key: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  const body = await req.json();

  if (!decodedKey) {
    return NextResponse.json({ error: 'key requerido' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1) Traer todas las rows del cliente (por portal_email o fallback client_name)
  const isEmail = decodedKey.includes('@');
  let query = supabase
    .from('voice_agents')
    .select('id, portal_email, features, client_name');

  if (isEmail) {
    query = query.eq('portal_email', decodedKey.toLowerCase().trim());
  } else {
    query = query.eq('client_name', decodedKey);
  }

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  // Split del body
  const agentPatch: Record<string, unknown> = {};
  const orgPatch:   Record<string, unknown> = {};
  let vertical: 'negocio' | 'gobierno' | undefined;

  for (const [k, v] of Object.entries(body)) {
    if (k === 'vertical') {
      if (v === 'negocio' || v === 'gobierno') vertical = v;
      continue;
    }
    if (ORG_FIELDS.has(k))         orgPatch[k]   = v;
    else if (AGENT_BULK_FIELDS.has(k)) agentPatch[k] = v;
    // silenciamos campos desconocidos para no null-out por accidente
  }

  // Normalizar client_email a lowercase si viene
  if (typeof agentPatch.client_email === 'string') {
    const trimmed = (agentPatch.client_email as string).trim().toLowerCase();
    agentPatch.client_email = trimmed || null;
  }

  // 2) Bulk update de voice_agents (campos simples)
  let updated = 0;
  const targetPortalEmail = isEmail ? decodedKey.toLowerCase().trim() : null;

  if (Object.keys(agentPatch).length > 0) {
    let up = supabase.from('voice_agents').update(agentPatch, { count: 'exact' });
    up = targetPortalEmail
      ? up.eq('portal_email', targetPortalEmail)
      : up.eq('client_name', decodedKey);
    const { error, count } = await up;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = count ?? 0;
  }

  // 3) Vertical: merge dentro de features per-row (features es JSONB por agente)
  if (vertical) {
    for (const row of rows) {
      const currentFeatures = (row.features ?? {}) as AgentFeatures;
      const nextFeatures = { ...currentFeatures, vertical };
      const { error: fErr } = await supabase
        .from('voice_agents')
        .update({ features: nextFeatures })
        .eq('id', row.id);
      if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
    }
    updated = updated || rows.length;
  }

  // 4) Org-level fields (upsert por portal_email)
  if (targetPortalEmail && Object.keys(orgPatch).length > 0) {
    const { error: orgErr } = await supabase
      .from('organizations')
      .upsert({ portal_email: targetPortalEmail, ...orgPatch }, { onConflict: 'portal_email' });
    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updated || rows.length });
}
