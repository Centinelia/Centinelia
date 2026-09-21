/**
 * Cron endpoint — daily 10 AM MX (16:00 UTC).
 *
 * Cuando llega rep_reminder_at para una factura PPD pagada, Neka le manda un
 * correo por factura a Nazre para que emita el REP en el portal SAT o
 * Facturama. Marca rep_reminder_sent_at para no molestar dos veces.
 * Ver src/lib/ops/neka-rep-reminders.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runRepReminders } from '@/lib/ops/neka-rep-reminders';
import { isFacturamaSandbox } from '@/lib/invoicing/facturama/centinelia-preset';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth     = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const testMode = isFacturamaSandbox();
  const result = await runRepReminders({ testMode });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok:         true,
    procesados: result.procesados,
    enviados:   result.enviados,
    errores:    result.errores,
  });
}
