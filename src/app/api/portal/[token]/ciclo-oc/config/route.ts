import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface CicloOcConfig {
  monto_max_autofirma_mxn?:     number;
  sanidad_no_duplicados_horas?: number;
  archivado_nomenclatura?:      string;
  archivado_destino?:           string;
  archivado_root?:              string;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (session.portalEmail && resolved.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { data } = await supabase.from('organizations')
    .select('ciclo_oc_config, ciclo_oc_firma_path')
    .eq('portal_email', resolved.portalEmail)
    .single();

  return NextResponse.json({
    config:          (data?.ciclo_oc_config as CicloOcConfig | null) ?? {},
    firma_cargada:   !!data?.ciclo_oc_firma_path,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.isSubUser) return NextResponse.json({ error: 'only_owner' }, { status: 403 });

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (session.portalEmail && resolved.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json() as CicloOcConfig;
  const supabase = createAdminClient();

  const { data: current } = await supabase.from('organizations')
    .select('ciclo_oc_config')
    .eq('portal_email', resolved.portalEmail)
    .single();
  const currentCfg = (current?.ciclo_oc_config as CicloOcConfig | null) ?? {};

  const merged: CicloOcConfig = { ...currentCfg };
  if (typeof body.monto_max_autofirma_mxn === 'number' && body.monto_max_autofirma_mxn >= 0)
    merged.monto_max_autofirma_mxn = body.monto_max_autofirma_mxn;
  if (typeof body.sanidad_no_duplicados_horas === 'number' && body.sanidad_no_duplicados_horas >= 0)
    merged.sanidad_no_duplicados_horas = body.sanidad_no_duplicados_horas;
  if (typeof body.archivado_nomenclatura === 'string')
    merged.archivado_nomenclatura = body.archivado_nomenclatura.slice(0, 500);
  if (typeof body.archivado_destino === 'string' && ['dropbox', 'smb_local', 'windows_agent'].includes(body.archivado_destino))
    merged.archivado_destino = body.archivado_destino;
  if (typeof body.archivado_root === 'string')
    merged.archivado_root = body.archivado_root.slice(0, 500);

  const { error } = await supabase.from('organizations')
    .update({ ciclo_oc_config: merged })
    .eq('portal_email', resolved.portalEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, config: merged });
}
