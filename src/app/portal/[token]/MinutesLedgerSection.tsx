import { createAdminClient } from '@/lib/supabase/admin';
import MinutesLedgerListClient, { type LedgerEntry, type LedgerSource } from './MinutesLedgerListClient';

type Source = LedgerSource;
type Entry = LedgerEntry;

export default async function MinutesLedgerSection({
  agentId,
  minutesIncluded,
  minutesUsed,
  callerNames = {},
}: {
  agentId: string;
  minutesIncluded: number;
  minutesUsed: number;
  callerNames?: Record<string, string>;
}) {
  void minutesUsed; // not used directly; balance derives from ledger + calls
  const supabase = createAdminClient();

  const [ledgerRes, callsRes] = await Promise.all([
    supabase
      .from('minutes_ledger')
      .select('id, created_at, amount, description, source')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('voice_calls')
      .select('id, created_at, duration_seconds, caller_number')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const credits: Omit<Entry, 'balance'>[] = (ledgerRes.data ?? []).map(r => ({
    id:          r.id,
    date:        r.created_at,
    amount:      r.amount,
    description: r.description,
    source:      (r.source as Source) ?? 'ajuste',
  }));

  const debits: Omit<Entry, 'balance'>[] = (callsRes.data ?? []).map(c => {
    const mins   = Math.max(1, Math.ceil(c.duration_seconds / 60));
    const caller = c.caller_number?.trim() || 'Número privado';
    return {
      id:          c.id,
      date:        c.created_at,
      amount:      -mins,
      description: `${caller} · ${mins} min`,
      source:      'llamada' as Source,
    };
  });

  // Seed activation entry if ledger is empty pero hay plan
  if (credits.length === 0 && minutesIncluded > 0) {
    const firstDate = debits.length > 0 ? debits[debits.length - 1].date : new Date().toISOString();
    credits.push({
      id:          'initial-plan',
      date:        firstDate,
      amount:      minutesIncluded,
      description: `Plan incluido, ${minutesIncluded} minutos`,
      source:      'activacion' as Source,
    });
  }

  // Compute running balance chronologically
  const chronological = [...credits, ...debits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let running = 0;
  const withBalance: Entry[] = chronological.map(e => {
    running += e.amount;
    return { ...e, balance: running };
  });

  // Reverse for display (newest first)
  const entries = withBalance.reverse();

  if (entries.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--c-text-3)' }}>
        Sin movimientos registrados
      </p>
    );
  }

  return <MinutesLedgerListClient entries={entries} callerNames={callerNames} />;
}
