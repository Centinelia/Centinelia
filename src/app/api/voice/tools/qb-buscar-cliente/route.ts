import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getQBClient } from '@/lib/qb/client';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido.' });

  const body = await req.json();
  const { nombre } = body.toolCallList?.[0]?.function?.arguments ?? body;

  if (!nombre) return NextResponse.json({ result: 'Necesito el nombre del cliente para buscarlo en QuickBooks.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();

  if (!agent?.portal_email) return NextResponse.json({ result: 'Error: agente no encontrado.' });

  const qb = await getQBClient(agent.portal_email, supabase);
  if (!qb) return NextResponse.json({ result: 'QuickBooks no está conectado.' });

  try {
    const safe = nombre.replace(/'/g, '');
    const [custRes, invRes] = await Promise.all([
      qb.query(`SELECT Id, DisplayName, PrimaryEmailAddr, PrimaryPhone, Balance, BillAddr FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 5`),
      qb.query(`SELECT Id, DocNumber, Balance, TotalAmt, DueDate FROM Invoice WHERE CustomerRef.name LIKE '%${safe}%' AND Balance > '0' ORDER BY DueDate ASC MAXRESULTS 5`),
    ]);

    const customers = custRes?.QueryResponse?.Customer ?? [];
    const invoices  = invRes?.QueryResponse?.Invoice  ?? [];

    if (customers.length === 0) {
      return NextResponse.json({ result: `No encontré ningún cliente con el nombre "${nombre}" en QuickBooks.` });
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

    return NextResponse.json({
      result:       parts.join(' '),
      customer_id:  c.Id,
      display_name: c.DisplayName,
      balance:      c.Balance ?? 0,
    });
  } catch (err) {
    console.error('qb-buscar-cliente', err);
    return NextResponse.json({ result: 'No pude buscar el cliente en QuickBooks en este momento.' });
  }
}
