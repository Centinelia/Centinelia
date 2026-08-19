import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

const VALID_STATUS = [
  'oc_creada', 'oc_firmada', 'oc_pagada', 'oc_enviada_proveedor',
  'mercancia_recibida', 'factura_timbrada', 'docs_archivados',
  'cancelado', 'requiere_atencion',
];

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token }  = await ctx.params;
  const resolved   = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (session.portalEmail && resolved.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url    = new URL(req.url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('q')?.trim();
  const limit  = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

  const supabase = createAdminClient();
  let query = supabase.from('expedientes_compras')
    .select('id, folio_interno, descripcion, qb_po_folio, proveedor_nombre, proveedor_rfc, oc_monto_mxn, status, oc_firmada_at, oc_pagada_at, mercancia_recibida_at, cfdi_timbrada_at, sf_uuid, requiere_atencion_razon, created_at')
    .eq('portal_email', resolved.portalEmail)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && VALID_STATUS.includes(status)) query = query.eq('status', status);
  if (search) {
    // Match folio_interno, proveedor_nombre, qb_po_folio (ilike)
    const s = search.replace(/[%_]/g, '');
    query = query.or(`folio_interno.ilike.%${s}%,proveedor_nombre.ilike.%${s}%,qb_po_folio.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate counters per status
  const { data: counts } = await supabase.from('expedientes_compras')
    .select('status')
    .eq('portal_email', resolved.portalEmail);
  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    const s = row.status as string;
    countMap[s] = (countMap[s] ?? 0) + 1;
  }

  return NextResponse.json({ expedientes: data ?? [], counts: countMap });
}
