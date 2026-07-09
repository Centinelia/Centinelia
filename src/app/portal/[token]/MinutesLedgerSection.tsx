import { createAdminClient } from '@/lib/supabase/admin';
import { RefreshCw, RotateCcw, Zap, CreditCard, Phone, SlidersHorizontal, BatteryCharging } from 'lucide-react';

type Source = 'renovacion' | 'rollover' | 'extra_compra' | 'activacion' | 'ajuste' | 'llamada' | 'auto_recarga';

interface Entry {
  id:          string;
  date:        string;
  amount:      number;
  description: string;
  source:      Source;
  balance?:    number;
}

const SOURCE_META: Record<Source, { icon: React.ReactNode; color: string; label: string }> = {
  renovacion:   { icon: <RefreshCw size={11} />,        color: '#6C3BFF', label: 'Renovación' },
  rollover:     { icon: <RotateCcw size={11} />,        color: '#a855f7', label: 'Rollover' },
  extra_compra: { icon: <Zap size={11} />,              color: '#f59e0b', label: 'Compra extra' },
  activacion:   { icon: <CreditCard size={11} />,       color: '#3b82f6', label: 'Activación' },
  ajuste:       { icon: <SlidersHorizontal size={11} />, color: '#22c55e', label: 'Ajuste' },
  llamada:      { icon: <Phone size={11} />,             color: '#6b7280', label: 'Llamada' },
  auto_recarga: { icon: <BatteryCharging size={11} />,   color: '#6C3BFF', label: 'Auto-recarga' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function fmtMonth(iso: string) {
  const s = new Date(iso).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

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
  const supabase = createAdminClient();

  const [ledgerRes, callsRes] = await Promise.all([
    supabase
      .from('minutes_ledger')
      .select('id, created_at, amount, description, source')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('voice_calls')
      .select('id, created_at, duration_seconds, caller_number')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const credits: Entry[] = (ledgerRes.data ?? []).map(r => ({
    id:          r.id,
    date:        r.created_at,
    amount:      r.amount,
    description: r.description,
    source:      (r.source as Source) ?? 'ajuste',
  }));

  const debits: Entry[] = (callsRes.data ?? []).map(c => {
    // Match webhook: minimum 1 minute charged per call
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

  // Current balance: authoritative source is agent record (minutesIncluded - minutesUsed)
  const currentBalance = minutesIncluded - minutesUsed;

  // If no credits in ledger, add a synthetic activation entry so the running total makes sense
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

  // Compute running balance forward from oldest entry
  const chronological = [...credits, ...debits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let running = 0;
  const withBalance = chronological.map(e => {
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

  // Group by month
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = fmtMonth(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Current balance header, sticky so it stays visible while scrolling */}
      <div className="flex items-center justify-between mb-2 pb-2 sticky top-0 z-10"
        style={{ borderBottom: '1px solid var(--c-divider)', background: 'var(--c-surface)' }}>
        <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Saldo actual</span>
        <span className="text-sm font-bold" style={{ color: currentBalance > 0 ? '#22c55e' : '#ef4444' }}>
          {currentBalance} min
        </span>
      </div>

      {Array.from(groups.entries()).map(([month, rows]) => (
        <div key={month} className="flex flex-col">
          {/* Month header */}
          <div className="text-xs font-semibold py-2" style={{ color: 'var(--c-text-4)' }}>
            {month}
          </div>

          {rows.map((e, i) => {
            const meta    = SOURCE_META[e.source] ?? SOURCE_META.ajuste;
            const isCredit = e.amount > 0;

            return (
              <div
                key={e.id + i}
                className="flex items-center gap-2.5 py-2"
                style={{ borderTop: '1px solid var(--c-divider)' }}
              >
                {/* Icon */}
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-full w-6 h-6"
                  style={{ background: `${meta.color}18`, color: meta.color }}
                >
                  {meta.icon}
                </div>

                {/* Description + date */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug truncate" style={{ color: 'var(--c-text)' }}>
                    {e.description}
                  </p>
                  {e.source === 'llamada' && (() => {
                    const raw = e.description.split(' · ')[0];
                    const name = callerNames[raw.replace(/\D/g, '')];
                    return name ? (
                      <p className="text-xs leading-none mt-0.5" style={{ color: '#9B6DFF' }}>{name}</p>
                    ) : null;
                  })()}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    {fmtDate(e.date)} · {fmtTime(e.date)}
                  </p>
                </div>

                {/* Amount + balance */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: isCredit ? '#22c55e' : 'var(--c-text-2)' }}
                  >
                    {isCredit ? '+' : ''}{e.amount} min
                  </span>
                  <span className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    saldo {e.balance}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <p className="text-xs text-center pt-3" style={{ color: 'var(--c-text-4)' }}>
        El saldo refleja el estado de cuenta desde el inicio del historial.
      </p>
    </div>
  );
}
