/**
 * Cron endpoint — semanal (lunes 9 AM MX = 15:00 UTC).
 *
 * Neka lista todas las facturas emitidas PPD que aun no han sido marcadas
 * como pagadas (ultimos 90 dias) y le manda un correo agrupado a Nazre para
 * que marque cuales ya cobraron. Ver src/lib/ops/neka-cobros-semanal.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runCobrosSemanal } from '@/lib/ops/neka-cobros-semanal';
import { isFacturamaSandbox } from '@/lib/invoicing/facturama/centinelia-preset';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth     = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const testMode = isFacturamaSandbox();
  const result = await runCobrosSemanal({ testMode });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pendientes: result.pendientes, sent: result.sent });
}
