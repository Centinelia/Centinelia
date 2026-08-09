'use client';

import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CallCard from './CallCard';
import type { VoiceCall } from '@/types/agent';

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Lead',
  appointment_booked: 'Cita',
  order_taken:        'Pedido',
  transferred:        'Transferida',
  info_provided:      'Información',
  unanswered:         'Sin respuesta',
  escalated_whatsapp: 'Escalada',
  missed:             'Perdida',
  other:              'Otro',
};

export default function CallsSearch({ calls, isPro, callerNames = {}, token, agentName, agentNameById }: {
  calls:          VoiceCall[];
  isPro:          boolean;
  callerNames?:   Record<string, string>;
  token?:         string;
  agentName?:     string;
  agentNameById?: Record<string, string>;
}) {
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  const statsLine = useMemo(() => {
    const today      = new Date().toLocaleDateString('en-CA');
    const todayCalls = calls.filter(c => c.created_at?.slice(0, 10) === today);
    if (!todayCalls.length) return null;

    const answered = todayCalls.filter(c => !['missed', 'unanswered'].includes(c.outcome ?? ''));
    const leads    = todayCalls.filter(c => c.outcome === 'lead_created');
    const appts    = todayCalls.filter(c => c.outcome === 'appointment_booked');
    const avgSecs  = answered.length > 0
      ? Math.round(answered.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / answered.length)
      : 0;
    const avgLabel = avgSecs > 0
      ? `${Math.floor(avgSecs / 60)}:${String(avgSecs % 60).padStart(2, '0')}`
      : null;

    return [
      `${todayCalls.length} llamada${todayCalls.length !== 1 ? 's' : ''}`,
      `${answered.length} atendida${answered.length !== 1 ? 's' : ''}`,
      ...(leads.length > 0 ? [`${leads.length} lead${leads.length !== 1 ? 's' : ''}`] : []),
      ...(appts.length > 0 ? [`${appts.length} cita${appts.length !== 1 ? 's' : ''}`] : []),
      ...(avgLabel        ? [`Prom. ${avgLabel}`]                                     : []),
    ].join(' · ');
  }, [calls]);

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
      // Rango de fechas — inclusive en ambos extremos (23:59:59 en el "to")
      const createdISO = c.created_at?.slice(0, 10) ?? '';
      const matchFrom  = !dateFrom || createdISO >= dateFrom;
      const matchTo    = !dateTo   || createdISO <= dateTo;
      return matchType && matchQuery && matchFrom && matchTo;
    }),
    [calls, q, typeFilter, dateFrom, dateTo]
  );

  const isFiltered = q || typeFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="flex flex-col gap-3">

      {/* Stats bar */}
      {statsLine && (
        <p className="text-[11px] px-1" style={{ color: '#6B6480' }}>
          <span className="font-semibold" style={{ color: '#9B6DFF' }}>Hoy</span>
          {' · '}{statsLine}
        </p>
      )}

      <div className="flex gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#6B6480' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por número o resumen…"
            className="w-full pl-8 pr-8 py-2 rounded-lg text-xs"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5',
              color: '#1A0A3B', outline: 'none' }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: '#6B6480', background: 'none', border: 'none',
                cursor: 'pointer', padding: 2 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {availableOutcomes.length > 1 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger
              className="w-auto shrink-0 py-2 text-xs bg-[color:#FAFAFB]"
              style={{
                minWidth:   140,
                border:     typeFilter !== 'all' ? '1px solid rgba(108,59,255,0.5)' : '1px solid #E8E3F5',
                color:      typeFilter !== 'all' ? '#9B6DFF' : '#6B6480',
                fontWeight: typeFilter !== 'all' ? 600 : 400,
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {availableOutcomes.map(o => (
                <SelectItem key={o} value={o!}>{OUTCOME_LABELS[o!] ?? o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Rango de fechas */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: '#6B6480' }}>
        <span>Desde</span>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="rounded-lg px-2 py-1 text-xs"
          style={{
            background: '#FAFAFB',
            border: dateFrom ? '1px solid rgba(108,59,255,0.5)' : '1px solid #E8E3F5',
            color: '#1A0A3B', outline: 'none',
          }}
        />
        <span>hasta</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="rounded-lg px-2 py-1 text-xs"
          style={{
            background: '#FAFAFB',
            border: dateTo ? '1px solid rgba(108,59,255,0.5)' : '1px solid #E8E3F5',
            color: '#1A0A3B', outline: 'none',
          }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:opacity-70"
            style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', fontWeight: 600 }}
          >
            <X size={11} /> limpiar
          </button>
        )}
      </div>

      {/* Call list */}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        <div className="flex flex-col gap-2" style={{ padding: '1px 1px 6px' }}>
          {filtered.length === 0
            ? (
              <p className="text-xs text-center py-6" style={{ color: '#9B8FB5' }}>
                {isFiltered ? 'Sin resultados para este filtro' : 'Sin llamadas en este período'}
              </p>
            )
            : filtered.map(call => {
                const key       = (call.caller_number ?? '').replace(/\D/g, '');
                const knownName = key.length >= 7 ? callerNames[key] : undefined;
                const perAgent  = agentNameById?.[call.agent_id] ?? agentName;
                return (
                  <CallCard
                    key={call.id}
                    call={call}
                    isPro={isPro}
                    clientName={knownName}
                    agentName={perAgent}
                    token={token}
                  />
                );
              })
          }
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-center" style={{ color: '#9B8FB5' }}>
          {isFiltered
            ? `${filtered.length} de ${calls.length} llamadas`
            : `${calls.length} llamada${calls.length !== 1 ? 's' : ''}`
          }
        </p>
      )}
    </div>
  );
}
