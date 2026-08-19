import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

const DEFAULT_CLAUSES = [
  {
    id: 'partes', title: 'PARTES', required: true, enabled: true,
    body: 'Por un lado, {nombre_prestador} (en adelante "el Prestador") y por otro lado {nombre_cliente}, con RFC {rfc_cliente} (en adelante "el Cliente"), acuerdan celebrar el presente Contrato de Prestación de Servicios.',
  },
  {
    id: 'objeto', title: 'OBJETO DEL CONTRATO', required: true, enabled: true,
    body: 'El Prestador se compromete a proporcionar al Cliente los siguientes servicios:\n\n{descripcion_servicios}',
  },
  {
    id: 'vigencia', title: 'VIGENCIA', required: true, enabled: true,
    body: 'El presente contrato tendrá una vigencia de {vigencia} a partir de la fecha de firma. Podrá renovarse por periodos iguales de manera automática, salvo que alguna de las partes notifique por escrito su intención de no renovarlo con al menos 30 días naturales de anticipación.',
  },
  {
    id: 'contraprestacion', title: 'CONTRAPRESTACIÓN', required: true, enabled: true,
    body: 'El Cliente se obliga a pagar al Prestador la cantidad de {monto} por los servicios descritos en la Cláusula Segunda, conforme a la forma de pago acordada entre las partes.',
  },
  {
    id: 'pago', title: 'FORMA DE PAGO', required: false, enabled: true,
    body: 'El pago se realizará de la siguiente manera: {forma_de_pago}. En caso de retraso, se generarán intereses moratorios del 2% mensual sobre el monto vencido.',
  },
  {
    id: 'confidencialidad', title: 'CONFIDENCIALIDAD', required: false, enabled: true,
    body: 'Ambas partes se obligan a mantener en estricta confidencialidad toda la información que se intercambie con motivo del presente contrato. Esta obligación permanecerá vigente durante 2 años posteriores a la terminación del contrato.',
  },
  {
    id: 'propiedad', title: 'PROPIEDAD INTELECTUAL', required: false, enabled: true,
    body: 'Todos los trabajos, desarrollos y resultados generados como parte de los servicios contratados serán propiedad del Cliente una vez liquidado el pago total acordado. Hasta ese momento, el Prestador conserva los derechos sobre dichos entregables.',
  },
  {
    id: 'responsabilidad', title: 'LIMITACIÓN DE RESPONSABILIDAD', required: false, enabled: true,
    body: 'La responsabilidad total del Prestador por cualquier causa derivada de este contrato no excederá el monto total pagado por el Cliente en los últimos 3 meses de servicio. El Prestador no será responsable de daños indirectos, incidentales o pérdida de ganancias.',
  },
  {
    id: 'terminacion', title: 'TERMINACIÓN ANTICIPADA', required: false, enabled: true,
    body: 'Cualquiera de las partes podrá dar por terminado anticipadamente el presente contrato mediante aviso por escrito con 15 días naturales de anticipación. En caso de incumplimiento grave por parte del Cliente, el Prestador podrá dar por terminado el contrato de manera inmediata.',
  },
  {
    id: 'jurisdiccion', title: 'JURISDICCIÓN Y LEGISLACIÓN APLICABLE', required: true, enabled: true,
    body: 'Para la interpretación y cumplimiento del presente contrato, las partes se someten a la jurisdicción de los tribunales competentes de {ciudad}, renunciando a cualquier otro fuero que pudiera corresponderles. El presente contrato se rige por las leyes de los Estados Unidos Mexicanos.',
  },
  {
    id: 'aceptacion', title: 'ACEPTACIÓN', required: true, enabled: true,
    body: 'Las partes declaran haber leído y entendido el presente contrato en su totalidad y manifiestan su conformidad con los términos y condiciones aquí establecidos, firmando de conformidad en la ciudad de {ciudad}, el día {fecha}.',
  },
];

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && access.portalEmail && auth.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const supabase = createAdminClient();

  // contract_templates es org-level desde 2026-08-19
  const { data: tpl } = await supabase
    .from('contract_templates').select('*').eq('portal_email', access.portalEmail).limit(1).maybeSingle();

  // features.contrato_config lives on the primary agent
  const { data: primaryAgent } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('id', access.primaryId)
    .single();

  const features       = (primaryAgent?.features as Record<string, unknown>) ?? {};
  const contratoCfg    = (features.contrato_config as Record<string, unknown>) ?? {};
  const templateName   = (contratoCfg.template_name as string | undefined) ?? null;
  const templatePath   = (contratoCfg.template_path as string | undefined) ?? null;

  return NextResponse.json({ template: tpl ?? { clauses: DEFAULT_CLAUSES }, defaults: DEFAULT_CLAUSES, templateName, templatePath, isConfigured: tpl !== null });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && access.portalEmail && auth.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { clauses } = await req.json();

  // contract_templates es org-level desde 2026-08-19: un solo template por org
  const supabase = createAdminClient();
  const { error } = await supabase.from('contract_templates').upsert(
    { portal_email: access.portalEmail, clauses, updated_at: new Date().toISOString() },
    { onConflict: 'portal_email' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
