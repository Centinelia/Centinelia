import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getQBClient } from '@/lib/qb/client';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { toolCallId, args } = extractToolCall(body);
  if (!agent_id) return toolResponse(toolCallId, 'Error: agent_id requerido.');

  const cliente = typeof args.cliente === 'string' ? args.cliente : undefined;
  const solo_pendientes = args.solo_pendientes !== false;

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();

  if (!agent?.portal_email) return toolResponse(toolCallId, 'Error: agente no encontrado.');

  const qb = await getQBClient(agent.portal_email, supabase);
  if (!qb) return toolResponse(toolCallId, 'QuickBooks no está conectado. El cliente debe vincular su cuenta desde el portal.');

  try {
    const pendientesClause = solo_pendientes ? " AND Balance > '0'" : '';
    const clienteClause    = cliente ? ` AND CustomerRef.name LIKE '%${cliente.replace(/'/g, '')}%'` : '';
    const sql = `SELECT Id, DocNumber, CustomerRef, Balance, DueDate, TotalAmt, TxnDate FROM Invoice WHERE 1=1${clienteClause}${pendientesClause} ORDER BY DueDate ASC MAXRESULTS 15`;

    const data     = await qb.query(sql);
    const invoices = data?.QueryResponse?.Invoice ?? [];

    if (invoices.length === 0) {
      const msg = cliente
        ? `No encontré facturas${solo_pendientes ? ' pendientes' : ''} para "${cliente}" en QuickBooks.`
        : `No hay facturas${solo_pendientes ? ' pendientes de cobro' : ''} en QuickBooks.`;
      return toolResponse(toolCallId, msg);
    }

    const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    const lines = invoices.map((inv: any) => {
      const overdue = inv.DueDate && new Date(inv.DueDate) < new Date() && inv.Balance > 0;
      return `Factura #${inv.DocNumber} — ${inv.CustomerRef?.name ?? 'Cliente'}: ${fmt(inv.Balance)} pendiente de ${fmt(inv.TotalAmt)} total. Vence ${inv.DueDate ? fmtD(inv.DueDate) : 'sin fecha'}${overdue ? ' (VENCIDA)' : ''}.`;
    });

    const total = invoices.reduce((s: number, i: any) => s + (i.Balance ?? 0), 0);
    return toolResponse(
      toolCallId,
      `${lines.join(' ')} Total pendiente: ${fmt(total)}.`,
      { count: invoices.length, total },
    );
  } catch (err) {
    console.error('qb-consultar-facturas', err);
    return toolResponse(toolCallId, 'No pude consultar las facturas en este momento.');
  }
}
