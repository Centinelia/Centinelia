import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { solicitarFactura, type SolicitarFacturaItem } from '@/lib/fiscal/request-factura';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json() as Record<string, unknown>;
  const call = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Array<Record<string, unknown>> | undefined)?.[0];
  const rawArgs = (call?.function as Record<string, unknown> | undefined)?.arguments ?? body;
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId: string = (call?.id as string) ?? 'call_1';
  const callId: string | undefined = ((body.message as Record<string, unknown> | undefined)?.call as Record<string, unknown> | undefined)?.id as string | undefined;

  const reply = (m: string) => NextResponse.json({ results: [{ toolCallId, result: m }] });

  if (!agent_id) return reply('Error de configuración: falta agent_id.');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email, client_email')
    .eq('id', agent_id)
    .single();
  if (!agent) return reply('No pude registrar la solicitud: agente no encontrado.');

  // invoicing_email vive en organizations desde 2026-08-19 (migración desde features.invoicing_email)
  const { data: org } = agent.portal_email
    ? await supabase.from('organizations').select('invoicing_email').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };
  const invoicingEmail = (org?.invoicing_email as string | null | undefined)
    ?? (agent.client_email as string | undefined)
    ?? (agent.portal_email as string | undefined);

  const res = await solicitarFactura({
    cliente_nombre:    args.cliente_nombre    as string,
    cliente_rfc:       args.cliente_rfc       as string,
    cliente_email:     args.cliente_email     as string,
    cliente_telefono:  args.cliente_telefono  as string | undefined,
    cliente_direccion: args.cliente_direccion as string | undefined,
    uso_cfdi:          args.uso_cfdi          as string,
    forma_pago:        args.forma_pago        as string,
    metodo_pago:       args.metodo_pago       as string,
    condiciones_pago:  args.condiciones_pago  as string | undefined,
    items:             (args.items as SolicitarFacturaItem[] | undefined) ?? [],
    incluir_iva:       (args.incluir_iva      as boolean | undefined) ?? true,
    notes:             args.notes             as string | undefined,
  }, {
    agentId:       agent_id,
    portalEmail:   (agent.portal_email as string | undefined) ?? '',
    businessName:  (agent.business_name as string | undefined) ?? 'Centinelia',
    supabase,
    channel:       'voice',
    sourceCallId:  callId,
    invoicingEmail,
  });

  if (!res.ok) return reply(res.error ?? 'No pude registrar la solicitud.');

  const totalStr = res.total!.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  if (res.path === 'auto' && res.outcome === 'stamped') {
    return reply(
      `Ya la emití por ${totalStr}, folio ${res.folio_corto}. Se la mandé a ${args.cliente_email}.`,
    );
  }
  if (res.path === 'auto' && res.outcome === 'retrying') {
    return reply(
      `Estoy procesando la emisión por ${totalStr}. Le llegará al correo ${args.cliente_email} en los próximos minutos.`,
    );
  }
  // 'human' o 'auto→failed' (cayó a humano)
  return reply(
    `Solicitud registrada por ${totalStr}. Le avisé al equipo de facturación (${res.target_email}) que emita la factura para ${args.cliente_nombre} (RFC ${args.cliente_rfc}). El cliente recibirá el CFDI en ${args.cliente_email} en las próximas 24 horas hábiles.`,
  );
}
