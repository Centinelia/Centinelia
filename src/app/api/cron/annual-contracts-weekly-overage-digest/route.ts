// Digest semanal (lunes 15 UTC = 9am Monterrey) de contratos annual_prepaid
// con pool consumido ≥80% del mensual. Alerta discreta interna para Nazre,
// input para renegociar el pool en la próxima renovación.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { annualContractWeeklyOverageDigestHtml, type E5Item } from '@/lib/email/annual-contracts';

const ADMIN_MAIL = 'hola@centinelia.mx';
const THRESHOLD_PCT = 80;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  // Todas las orgs annual_prepaid con contrato activo
  const { data: orgs } = await supabase
    .from('organizations')
    .select('portal_email, name, active_contract_id, monthly_minutes_used, monthly_ops_used, pool_reset_date')
    .eq('billing_model', 'annual_prepaid')
    .not('active_contract_id', 'is', null);

  if (!orgs || orgs.length === 0) return NextResponse.json({ items: 0 });

  const contractIds = orgs.map(o => o.active_contract_id as string);
  const { data: contracts } = await supabase
    .from('annual_contracts')
    .select('id, contract_folio, monthly_minutes_pool, monthly_ops_pool')
    .in('id', contractIds);
  const contractMap = new Map((contracts ?? []).map(c => [c.id as string, c]));

  const items: E5Item[] = [];
  for (const org of orgs) {
    const c = contractMap.get(org.active_contract_id as string);
    if (!c) continue;
    const pool = (c.monthly_minutes_pool as number) ?? 0;
    if (pool <= 0) continue;
    const used = (org.monthly_minutes_used as number) ?? 0;
    const pct = Math.round((used / pool) * 100);
    if (pct < THRESHOLD_PCT) continue;

    const resetISO = (org.pool_reset_date as string | null) ?? null;
    const daysToReset = resetISO
      ? Math.max(0, Math.round((new Date(resetISO + 'T00:00:00Z').getTime() - Date.now()) / 86_400_000))
      : 0;

    items.push({
      businessName:  (org.name as string | null) ?? (org.portal_email as string),
      contractFolio: c.contract_folio as string,
      contractId:    c.id as string,
      minPct:        pct,
      daysToReset,
    });
  }

  if (items.length === 0) return NextResponse.json({ items: 0 });

  const html = annualContractWeeklyOverageDigestHtml({ items });
  await sendEmail({
    to:      ADMIN_MAIL,
    subject: `[Digest overage] ${items.length} contrato${items.length === 1 ? '' : 's'} ≥80% del pool`,
    html,
  }).catch(err => console.error('[annual-contracts-weekly-overage-digest] send failed:', err));

  return NextResponse.json({ items: items.length });
}
