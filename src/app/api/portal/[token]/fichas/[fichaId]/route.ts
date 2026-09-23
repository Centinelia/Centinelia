// Portal Fichas Informativas — PATCH (editar contactos) + DELETE (borrar).
//
// PATCH  /api/portal/[token]/fichas/[fichaId]
//   Actualiza campos editables por el cliente (contactos, liga, horario,
//   costo, plazo). NO permite editar el codigo, titulo, storage_path ni
//   raw_text — para eso se re-sube el PDF.
//
// DELETE /api/portal/[token]/fichas/[fichaId]
//   Elimina la ficha + sus chunks (cascade) + el PDF del bucket. Si era la
//   última ficha del org, NO desactiva el feature (el cliente decide si
//   apagarlo manualmente desde el toggle del portal).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string; fichaId: string }> }

// Campos editables desde el UI. Cualquier otro campo del body se ignora en
// silencio para evitar que el cliente reescriba raw_text o storage_path.
const EDITABLE_FIELDS = new Set([
  'contacto_nombre',
  'contacto_puesto',
  'contacto_correo',
  'contacto_telefono',
  'contacto_extension',
  'liga_en_linea',
  'direccion',
  'horario',
  'costo_descripcion',
  'plazo_respuesta',
  'dependencia',
  'unidad_administrativa',
]);

// ─── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, fichaId } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: ficha, error: fetchErr } = await supabase
    .from('fichas_informativas')
    .select('id, portal_email')
    .eq('id', fichaId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: `Fetch error: ${fetchErr.message}` }, { status: 500 });
  if (!ficha) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 });
  if (ficha.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(k)) continue;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      patch[k] = trimmed.length > 0 ? trimmed : null;
    } else if (v === null) {
      patch[k] = null;
    }
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'Ningún campo editable en el body' }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from('fichas_informativas')
    .update(patch)
    .eq('id', fichaId);
  if (upErr) return NextResponse.json({ error: `Update error: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, updated_fields: Object.keys(patch).filter((k) => k !== 'updated_at') });
}

// ─── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { token, fichaId } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: ficha, error: fetchErr } = await supabase
    .from('fichas_informativas')
    .select('id, portal_email, storage_path, titulo')
    .eq('id', fichaId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: `Fetch error: ${fetchErr.message}` }, { status: 500 });
  if (!ficha) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 });
  if (ficha.portal_email !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // 1. Borrar del bucket (mejor esfuerzo — si falla, no bloquea el delete de la row)
  if (ficha.storage_path) {
    await supabase.storage.from('fichas-informativas').remove([ficha.storage_path]).catch(() => null);
  }
  // 2. Borrar la row (chunks se van por cascade)
  const { error: delErr } = await supabase.from('fichas_informativas').delete().eq('id', fichaId);
  if (delErr) return NextResponse.json({ error: `Delete error: ${delErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: { id: fichaId, titulo: ficha.titulo } });
}
