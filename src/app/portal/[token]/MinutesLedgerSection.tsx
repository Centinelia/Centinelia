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
      .select('id, created_at, amount, description, source, kind, reference_id')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(2000),
    // Solo para enrichment + fallback legacy (llamadas sin ledger row).
    // Ver [[feedback-audit-read-path-fidelity]] — antes se derivaban debits
    // desde voice_calls Y también del ledger → double counting.
    supabase
      .from('voice_calls')
      .select('id, created_at, duration_seconds, caller_number, outcome')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  // Lookup para enriquecer ledger rows con caller_number
  const voiceCallMap: Record<string, string> = {};
  for (const c of (callsRes.data ?? [])) {
    voiceCallMap[c.id] = c.caller_number?.trim() || 'Número privado';
  }

  // Ledger: split por signo, enriquecer rows kind='call' con caller_number
  const credits: Omit<Entry, 'balance'>[] = [];
  const debits:  Omit<Entry, 'balance'>[] = [];
  const ledgerCallRefIds = new Set<string>();
  for (const r of ledgerRes.data ?? []) {
    const amount = r.amount;
    const kind   = (r as any).kind as string | null;
    const refId  = (r as any).reference_id as string | null;
    let description = r.description;
    let entrySource: Source = (r.source as Source) ?? 'ajuste';
    if (kind === 'call' && refId) {
      ledgerCallRefIds.add(refId);
      if (voiceCallMap[refId]) {
        const mins = Math.abs(amount);
        description = `${voiceCallMap[refId]} · ${mins} min`;
        entrySource = 'llamada' as Source;
      }
    }
    const entry = { id: r.id, date: r.created_at, amount, description, source: entrySource };
    if (amount >= 0) credits.push(entry);
    else debits.push(entry);
  }

  // Fallback legacy: llamadas sin ledger row, con guards (no unanswered, >=3s)
  const legacyDebits: Omit<Entry, 'balance'>[] = (callsRes.data ?? [])
    .filter(c => {
      const durSec = c.duration_seconds ?? 0;
      const outcome = (c as any).outcome as string | null;
      return !ledgerCallRefIds.has(c.id) && durSec >= 3 && outcome !== 'unanswered';
    })
    .map(c => {
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
  debits.push(...legacyDebits);

  // Seed inicial: solo si NO hay ni credit ni debit (evita sobre-acreditar).
  if (credits.length === 0 && debits.length === 0 && minutesIncluded > 0) {
    credits.push({
      id:          'initial-plan',
      date:        new Date().toISOString(),
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
