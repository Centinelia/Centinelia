// Portal Contactos Vivos — GET (detalle + timeline) + PATCH (edit) + DELETE.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string; contactoId: string }> }

// Campos editables desde el UI del cliente. Rechazamos silenciosamente
// cualquier otro campo para evitar que se toquen contadores denormalizados
// (promesas_hechas, total_interacciones, ultima_interaccion_at) que mantiene
// el trigger post-insert de contactos_interacciones.
const EDITABLE_FIELDS = new Set([
  'nombre',
  'telefono',
  'correo',
  'external_id',
  'estado_actual',
  'datos_operacionales',
  'proxima_accion_at',
  'proxima_accion_tipo',
  'capacidad_pago_detectada',
  'notas',
]);

// ─── GET (detalle + últimas 20 interacciones) ──────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { token, contactoId } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: contacto, error } = await supabase
    .from('contactos_vivos')
    .select('*')
    .eq('id', contactoId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: `Fetch error: ${error.message}` }, { status: 500 });
  if (!contacto) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
  if (contacto.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data: interacciones } = await supabase
    .from('contactos_interacciones')
    .select('id, fecha, tipo, canal_ref_id, meerkat_id, duracion_seg, resumen, sentimiento, temas, promesa_monto, promesa_fecha, proxima_accion, escalado_a')
    .eq('contacto_id', contactoId)
    .order('fecha', { ascending: false })
    .limit(20);

  return NextResponse.json({
    contacto,
    interacciones: interacciones ?? [],
  });
}

// ─── PATCH (edit) ──────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, contactoId } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: contacto, error: fetchErr } = await supabase
    .from('contactos_vivos')
    .select('id, portal_email')
    .eq('id', contactoId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: `Fetch error: ${fetchErr.message}` }, { status: 500 });
  if (!contacto) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
  if (contacto.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(k)) continue;
    if (k === 'datos_operacionales') {
      // Objeto JSONB — reemplazo completo (el UI manda el objeto final)
      if (typeof v === 'object' && v !== null) patch[k] = v;
      continue;
    }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      patch[k] = trimmed.length > 0 ? trimmed : null;
    } else if (v === null) {
      patch[k] = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Ningún campo editable en el body' }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from('contactos_vivos')
    .update(patch)
    .eq('id', contactoId);
  if (upErr) return NextResponse.json({ error: `Update error: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, updated_fields: Object.keys(patch) });
}

// ─── DELETE ────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { token, contactoId } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: contacto, error: fetchErr } = await supabase
    .from('contactos_vivos')
    .select('id, portal_email, nombre')
    .eq('id', contactoId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: `Fetch error: ${fetchErr.message}` }, { status: 500 });
  if (!contacto) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
  if (contacto.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { error: delErr } = await supabase.from('contactos_vivos').delete().eq('id', contactoId);
  if (delErr) return NextResponse.json({ error: `Delete error: ${delErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: { id: contactoId, nombre: contacto.nombre } });
}
