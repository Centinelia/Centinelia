'use client';

import { useState, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import CallCard from './CallCard';
import type { VoiceCall } from '@/types/agent';

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Lead',
  appointment_booked: 'Cita',
  order_taken:        'Pedido',
  transferred:        'Transferida',
  info_provided:      'Información',
  unanswered:         'Sin respuesta',
  escalated_whatsapp: 'WhatsApp',
  missed:             'Perdida',
  other:              'Otro',
};

export default function CallsSearch({ calls, isPro, callerNames = {}, token }: {
  calls: VoiceCall[];
  isPro: boolean;
  callerNames?: Record<string, string>;
  token?: string;
}) {
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const availableOutcomes = useMemo(() => {
    const seen = new Set(calls.map(c => c.outcome).filter(Boolean));
    return Array.from(seen);
  }, [calls]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() =>
    calls.filter(c => {
      const matchType  = typeFilter === 'all' || c.outcome === typeFilter;
      const matchQuery = !q || (
        c.caller_number?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q) ||
        c.transcript?.toLowerCase().includes(q)
      );
      return matchType && matchQuery;
    }),
    [calls, q, typeFilter]
  );

  const isFiltered = q || typeFilter !== 'all';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--c-text-3)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por número o resumen…"
            className="w-full pl-8 pr-8 py-2 rounded-lg text-xs"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
              color: 'var(--c-text)', outline: 'none' }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--c-text-3)', background: 'none', border: 'none',
                cursor: 'pointer', padding: 2 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Type filter — only render when there are multiple distinct outcome types */}
        {availableOutcomes.length > 1 && (
          <div className="relative shrink-0">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 rounded-lg text-xs h-full"
              style={{
                background:  'var(--c-surface-2)',
                border:      typeFilter !== 'all'
                  ? '1px solid rgba(108,59,255,0.5)'
                  : '1px solid var(--c-border)',
                color:       typeFilter !== 'all' ? '#9B6DFF' : 'var(--c-text-3)',
                outline:     'none',
                cursor:      'pointer',
                fontWeight:  typeFilter !== 'all' ? 600 : 400,
              }}
            >
              <option value="all">Tipo: todos</option>
              {availableOutcomes.map(o => (
                <option key={o} value={o}>{OUTCOME_LABELS[o] ?? o}</option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: typeFilter !== 'all' ? '#9B6DFF' : 'var(--c-text-3)' }} />
          </div>
        )}
      </div>

      {/* Call list */}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        <div className="flex flex-col gap-2" style={{ padding: '1px 1px 6px' }}>
          {filtered.length === 0
            ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--c-text-4)' }}>
                {isFiltered ? 'Sin resultados para este filtro' : 'Sin llamadas en este período'}
              </p>
            )
            : filtered.map(call => (
                <CallCard
                  key={call.id}
                  call={call}
                  isPro={isPro}
                  clientName={callerNames[(call.caller_number ?? '').replace(/\D/g, '')]}
                  token={token}
                />
              ))
          }
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-center" style={{ color: 'var(--c-text-4)' }}>
          {isFiltered
            ? `${filtered.length} de ${calls.length} llamadas`
            : `${calls.length} llamada${calls.length !== 1 ? 's' : ''}`
          }
        </p>
      )}
    </div>
  );
}
