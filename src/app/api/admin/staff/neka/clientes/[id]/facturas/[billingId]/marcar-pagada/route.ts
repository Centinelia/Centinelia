import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { marcarFacturaPagada } from '@/lib/billing/centinelia-facturas';

export const dynamic     = 'force-dynamic';
export const maxDuration = 15;

/**
 * POST — marca una factura emitida como pagada. Body JSON:
 *   { paidAt?: string ISO }   default: now()
 *
 * Si la factura es PPD, agenda rep_reminder_at = paid_at + 5 dias
 * automaticamente (lo maneja el helper).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; billingId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { billingId } = await params;

  let body: { paidAt?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
  }

  const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
  if (isNaN(paidAt.getTime())) {
    return NextResponse.json({ error: 'paidAt debe ser fecha ISO valida' }, { status: 400 });
  }

  const result = await marcarFacturaPagada({ billingId, paidAt });
  if (!result.ok) {
    const status = result.code === 'not_found'      ? 404
                 : result.code === 'not_applicable' ? 400
                 : 500;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({
    ok:             true,
    billingId:      result.billingId,
    repReminderAt:  result.repReminderAt,
  });
}
