import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getQBClient } from '@/lib/qb/client';
import { toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const call = (body.message?.toolCallList ?? body.toolCallList)?.[0];
  const toolCallId: string = call?.id ?? '';
  const { nombre } = call?.function?.arguments ?? body;
  if (!agent_id) return toolResponse(toolCallId, 'Error: agent_id requerido.');

  if (!nombre) return toolResponse(toolCallId, 'Necesito el nombre del cliente para buscarlo en QuickBooks.');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();

  if (!agent?.portal_email) return toolResponse(toolCallId, 'Error: agente no encontrado.');

  const qb = await getQBClient(agent.portal_email, supabase);
  if (!qb) return toolResponse(toolCallId, 'QuickBooks no está conectado.');

  try {
    const safe = nombre.replace(/'/g, '');
    const [custRes, invRes] = await Promise.all([
      qb.query(`SELECT Id, DisplayName, PrimaryEmailAddr, PrimaryPhone, Balance, BillAddr FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 5`),
      qb.query(`SELECT Id, DocNumber, Balance, TotalAmt, DueDate FROM Invoice WHERE CustomerRef.name LIKE '%${safe}%' AND Balance > '0' ORDER BY DueDate ASC MAXRESULTS 5`),
    ]);

    const customers = custRes?.QueryResponse?.Customer ?? [];
    const invoices  = invRes?.QueryResponse?.Invoice  ?? [];

    if (customers.length === 0) {
      return toolResponse(toolCallId, `No encontré ningún cliente con el nombre "${nombre}" en QuickBooks.`);
    }

    const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const c   = customers[0];
    const parts: string[] = [];

    parts.push(`Cliente: ${c.DisplayName}.`);
    if (c.PrimaryEmailAddr?.Address) parts.push(`Correo: ${c.PrimaryEmailAddr.Address}.`);
    if (c.PrimaryPhone?.FreeFormNumber) parts.push(`Teléfono: ${c.PrimaryPhone.FreeFormNumber}.`);
    parts.push(`Saldo total en QuickBooks: ${fmt(c.Balance ?? 0)}.`);

    if (invoices.length > 0) {
      const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
      const invLines = invoices.map((i: any) =>
        `Factura #${i.DocNumber}: ${fmt(i.Balance)} pendiente${i.DueDate ? ', vence ' + fmtD(i.DueDate) : ''}`
      );
      parts.push(`Facturas pendientes: ${invLines.join('; ')}.`);
    } else {
      parts.push('Sin facturas pendientes.');
    }

    return toolResponse(toolCallId, parts.join(' '));
  } catch (err) {
    console.error('qb-buscar-cliente', err);
    return toolResponse(toolCallId, 'No pude buscar el cliente en QuickBooks en este momento.');
  }
}
