import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { getQBClient } from '@/lib/qb/client';
import { dedupLookup, dedupStore } from '@/lib/tools/dedup/with-dedup';
import { toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const call = (body.message?.toolCallList ?? body.toolCallList)?.[0];
  const args = call?.function?.arguments ?? body;
  const toolCallId: string = call?.id ?? '';
  if (!agent_id) return toolResponse(toolCallId, 'Error: agent_id requerido.');
  const { cliente_nombre, descripcion, monto, fecha_vencimiento } = args;

  if (!cliente_nombre || !descripcion || !monto) {
    return toolResponse(toolCallId, 'Necesito el nombre del cliente, descripción del servicio y monto para crear la factura.');
  }

  const montoNum = parseFloat(String(monto).replace(/[^0-9.]/g, ''));
  if (isNaN(montoNum) || montoNum <= 0) {
    return toolResponse(toolCallId, 'El monto debe ser un número mayor a cero.');
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();

  if (!agent?.portal_email) return toolResponse(toolCallId, 'Error: agente no encontrado.');

  const dedupCtx = {
    agentId:     agent_id,
    portalEmail: agent.portal_email as string,
    toolName:    'qb_crear_factura',
    args:        args as Record<string, unknown>,
    channel:     'voice' as const,
    toolCallId,
  };
  const cached = await dedupLookup<{ result: string; invoice_id?: string; doc_number?: string }>(dedupCtx);
  if (cached) return toolResponse(toolCallId, cached.result);

  const opsResult = await consumeAiOp(agent_id, 1, { source: 'tool_qb_crear_factura', label: 'Factura creada en QuickBooks' });
  if (!opsResult.ok) return toolResponse(toolCallId, 'Sin tareas disponibles para crear la factura.');

  const qb = await getQBClient(agent.portal_email, supabase);
  if (!qb) return toolResponse(toolCallId, 'QuickBooks no está conectado.');

  try {
    // Find customer
    const safe     = cliente_nombre.replace(/'/g, '');
    const custData = await qb.query(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 1`);
    const customer = custData?.QueryResponse?.Customer?.[0];

    if (!customer) {
      return toolResponse(toolCallId, `No encontré al cliente "${cliente_nombre}" en QuickBooks. Verifica que esté registrado.`);
    }

    // Find a usable service item
    const itemData = await qb.query(`SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 1`);
    const item     = itemData?.QueryResponse?.Item?.[0];

    const lineDetail: any = item
      ? {
          DetailType: 'SalesItemLineDetail',
          Amount:     montoNum,
          Description: descripcion,
          SalesItemLineDetail: { ItemRef: { value: item.Id, name: item.Name }, UnitPrice: montoNum, Qty: 1 },
        }
      : {
          DetailType:  'DescriptionOnlyLine',
          Amount:      montoNum,
          Description: descripcion,
          DescriptionOnlyLineDetail: {},
        };

    const invoiceBody: any = {
      Line:        [lineDetail],
      CustomerRef: { value: customer.Id, name: customer.DisplayName },
    };

    if (fecha_vencimiento) invoiceBody.DueDate = fecha_vencimiento;

    const result  = await qb.post('/invoice', invoiceBody);
    const invoice = result?.Invoice;
    const fmt     = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const payload = {
      result: `Factura #${invoice?.DocNumber} creada para ${customer.DisplayName} por ${fmt(montoNum)}. Concepto: ${descripcion}.`,
      invoice_id: invoice?.Id,
      doc_number: invoice?.DocNumber,
    };
    await dedupStore(dedupCtx, payload);
    return toolResponse(toolCallId, payload.result);
  } catch (err) {
    console.error('qb-crear-factura', err);
    return toolResponse(toolCallId, 'No pude crear la factura en QuickBooks. Verifica los datos e intenta de nuevo.');
  }
}
