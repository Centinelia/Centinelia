import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { getQBClient } from '@/lib/qb/client';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido.' });

  const body = await req.json();
  const { cliente_nombre, factura_numero, monto } =
    (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;

  if (!cliente_nombre || !monto) {
    return NextResponse.json({ result: 'Necesito el nombre del cliente y el monto del pago para registrarlo.' });
  }

  const montoNum = parseFloat(String(monto).replace(/[^0-9.]/g, ''));
  if (isNaN(montoNum) || montoNum <= 0) {
    return NextResponse.json({ result: 'El monto debe ser un número mayor a cero.' });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();

  if (!agent?.portal_email) return NextResponse.json({ result: 'Error: agente no encontrado.' });

  const opsResult = await consumeAiOp(agent_id, 1, { source: 'tool_qb_registrar_pago', label: 'Pago registrado en QuickBooks' });
  if (!opsResult.ok) return NextResponse.json({ result: 'Sin tareas disponibles para registrar el pago.' });

  const qb = await getQBClient(agent.portal_email, supabase);
  if (!qb) return NextResponse.json({ result: 'QuickBooks no está conectado.' });

  try {
    const safe = cliente_nombre.replace(/'/g, '');

    // Find customer
    const custData = await qb.query(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 1`);
    const customer = custData?.QueryResponse?.Customer?.[0];
    if (!customer) {
      return NextResponse.json({ result: `No encontré al cliente "${cliente_nombre}" en QuickBooks.` });
    }

    // Find invoice to apply payment to
    const invoiceFilter = factura_numero
      ? `AND DocNumber = '${factura_numero}'`
      : `AND Balance > '0' ORDER BY DueDate ASC`;
    const invData  = await qb.query(`SELECT Id, DocNumber, Balance, TotalAmt FROM Invoice WHERE CustomerRef = '${customer.Id}' ${invoiceFilter} MAXRESULTS 1`);
    const invoice  = invData?.QueryResponse?.Invoice?.[0];

    const paymentBody: any = {
      TotalAmt:    montoNum,
      CustomerRef: { value: customer.Id, name: customer.DisplayName },
      TxnDate:     new Date().toISOString().split('T')[0],
    };

    if (invoice) {
      paymentBody.Line = [{
        Amount:    montoNum,
        LinkedTxn: [{ TxnId: invoice.Id, TxnType: 'Invoice' }],
      }];
    }

    const result  = await qb.post('/payment', paymentBody);
    const payment = result?.Payment;
    const fmt     = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const invoiceRef = invoice ? ` aplicado a factura #${invoice.DocNumber}` : '';
    return NextResponse.json({
      result:     `Pago de ${fmt(montoNum)} registrado para ${customer.DisplayName}${invoiceRef}.`,
      payment_id: payment?.Id,
    });
  } catch (err) {
    console.error('qb-registrar-pago', err);
    return NextResponse.json({ result: 'No pude registrar el pago en QuickBooks. Verifica los datos e intenta de nuevo.' });
  }
}
