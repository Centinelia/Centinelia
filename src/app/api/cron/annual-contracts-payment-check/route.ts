// Cron semanal: marca contratos con payment_status='pending' como 'overdue' si
// pasaron más de 45 días desde start_date sin recibir SPEI. NO suspende
// operación (decisión intencional para no romper servicio a gobierno por
// burocracia interna). Solo tags para dashboards y notifica a Nazre.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

const OVERDUE_DAYS = 45;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - OVERDUE_DAYS * 86_400_000).toISOString().slice(0, 10);

  const { data: pending } = await supabase
    .from('annual_contracts')
    .select('id, organization_email, contract_folio, amount_mxn, start_date')
    .eq('payment_status', 'pending')
    .lte('start_date', cutoff);

  const overdueIds: string[] = [];
  for (const c of (pending ?? []) as { id: string }[]) {
    await supabase.from('annual_contracts')
      .update({ payment_status: 'overdue' })
      .eq('id', c.id);
    overdueIds.push(c.id);
  }

  // Nota: correo interno a Nazre se agrega en Fase 4.

  return NextResponse.json({ overdue_marked: overdueIds.length, ids: overdueIds });
}
