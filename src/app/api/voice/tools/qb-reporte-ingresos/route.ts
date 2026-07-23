import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getQBClient } from '@/lib/qb/client';

const PERIOD_MAP: Record<string, string> = {
  este_mes:    'THIS_MONTH',
  mes_pasado:  'LAST_MONTH',
  este_año:    'THIS_YEAR',
  año_pasado:  'LAST_YEAR',
  este_trimestre: 'THIS_FISCAL_QUARTER',
  trimestre_pasado: 'LAST_FISCAL_QUARTER',
};

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido.' });

  const body = await req.json();
  const { periodo = 'este_mes' } = body.toolCallList?.[0]?.function?.arguments ?? body;

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
    const dateMacro  = PERIOD_MAP[periodo] ?? 'THIS_MONTH';
    const periodoLbl: Record<string, string> = {
      THIS_MONTH:            'este mes',
      LAST_MONTH:            'el mes pasado',
      THIS_YEAR:             'este año',
      LAST_YEAR:             'el año pasado',
      THIS_FISCAL_QUARTER:   'este trimestre',
      LAST_FISCAL_QUARTER:   'el trimestre pasado',
    };

    const [plRes, arRes] = await Promise.all([
      qb.get(`/reports/ProfitAndLoss?date_macro=${dateMacro}`),
      qb.get(`/reports/AgedReceivableDetail?date_macro=${dateMacro}`),
    ]);

    const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const rows    = plRes?.Rows?.Row ?? [];
    const summary = plRes?.Header?.ReportName ?? 'Reporte';
    const parts: string[] = [`Reporte de ${periodoLbl[dateMacro] ?? 'este período'}:`];

    // Extract Income, Expenses, Net Income from P&L
    for (const row of rows) {
      const label  = row?.Header?.ColData?.[0]?.value ?? row?.Summary?.ColData?.[0]?.value ?? '';
      const valRaw = row?.Summary?.ColData?.[1]?.value ?? '';
      const val    = parseFloat(valRaw);
      if (!label || isNaN(val)) continue;
      if (/ingreso|income|revenue/i.test(label))  parts.push(`Ingresos: ${fmt(val)}.`);
      if (/gasto|expense/i.test(label))           parts.push(`Gastos: ${fmt(val)}.`);
      if (/net|utilidad|ganancia/i.test(label))   parts.push(`Utilidad neta: ${fmt(val)}.`);
    }

    // Aged receivables total
    const arRows  = arRes?.Rows?.Row ?? [];
    const arTotal = arRows.reduce((s: number, r: any) => {
      const v = parseFloat(r?.ColData?.[r.ColData?.length - 1]?.value ?? '0');
      return s + (isNaN(v) ? 0 : v);
    }, 0);
    if (arTotal > 0) parts.push(`Cuentas por cobrar pendientes: ${fmt(arTotal)}.`);

    if (parts.length === 1) parts.push('No hay datos disponibles para este período.');

    return NextResponse.json({ result: parts.join(' '), periodo: dateMacro });
  } catch (err) {
    console.error('qb-reporte-ingresos', err);
    return NextResponse.json({ result: 'No pude generar el reporte en este momento.' });
  }
}
