import { createAdminClient } from '@/lib/supabase/admin';
import OpsLedgerListClient, { type OpsLedgerEntry, type OpsLedgerKind } from './OpsLedgerListClient';

export default async function OpsLedgerSection({
  portalEmail,
  token,
}: {
  portalEmail: string;
  token: string;
}) {
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from('ops_ledger')
    .select('id, created_at, amount, description, kind')
    .eq('portal_email', portalEmail)
    .order('created_at', { ascending: false })
    .limit(5000);

  let running = 0;
  const chronological = [...(rows ?? [])].reverse();
  const withBalance: OpsLedgerEntry[] = chronological.map(r => {
    running += (r.amount ?? 0);
    return {
      id:          r.id,
      date:        r.created_at,
      amount:      r.amount ?? 0,
      description: r.description ?? '',
      kind:        (r.kind ?? 'admin_adjustment') as OpsLedgerKind,
      balance:     running,
    };
  }).reverse();

  return (
    <OpsLedgerListClient
      entries={withBalance}
      csvUrl={`/api/portal/${token}/ops-ledger.csv`}
    />
  );
}
