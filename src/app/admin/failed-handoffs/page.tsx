'use client';

import { useState } from 'react';
import { RotateCcw, Clock, CheckCircle2, AlertOctagon, RefreshCw } from 'lucide-react';
import { useApi } from '@/lib/hooks/useApi';

type Filter = 'all' | 'pending' | 'resolved' | 'gave_up';

interface FailedRow {
  id:                  string;
  human_request_id:    string;
  from_email:          string;
  subject:             string | null;
  retry_count:         number;
  first_failed_at:     string;
  last_attempted_at:   string;
  last_error:          string | null;
  next_retry_at:       string | null;
  resolved_at:         string | null;
  notified_admin_at:   string | null;
}

const FILTER_LABELS: Record<Filter, string> = {
  all:      'Todos',
  pending:  'En cola',
  resolved: 'Resueltos',
  gave_up:  'Sin retry',
};

export default function FailedHandoffsPage() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [acting, setActing] = useState<string | null>(null);

  const { data: items = [], isLoading: loading, mutate } =
    useApi<FailedRow[]>(`/api/admin/failed-handoffs?status=${filter}`, { key: 'items' });

  const forceRetry = async (id: string) => {
    setActing(id);
    try {
      await fetch('/api/admin/failed-handoffs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      });
      await mutate();
    } finally {
      setActing(null);
    }
  };

  const rowStatus = (r: FailedRow): { label: string; color: string; Icon: typeof Clock } => {
    if (r.resolved_at)       return { label: 'Resuelto',            color: '#22C55E', Icon: CheckCircle2 };
    if (r.notified_admin_at) return { label: 'Sin retry (avisado)', color: '#EF4444', Icon: AlertOctagon };
    if (r.next_retry_at)     return { label: 'En cola',             color: '#F59E0B', Icon: Clock };
    return { label: 'Sin retry', color: '#9B8FB5', Icon: AlertOctagon };
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Nash · Cola de reintentos</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>Respuestas humanas fallidas</h1>
          <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
            Cola de reintentos para <code style={{ background: '#F5F0FF', padding: '1px 6px', borderRadius: 4, color: '#6C3BFF', fontSize: 12 }}>processHandoffReply</code>. El cron corre cada 15 min con backoff exponencial (15/30/60/180/720 min). Tras 5 fallos avisa a hola@centinelia.mx.
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-colors flex-shrink-0"
          style={{ padding: '9px 14px', background: '#F5F0FF', color: '#6C3BFF', border: '1px solid #E8E3F5' }}
        >
          <RefreshCw size={12} />
          Refrescar
        </button>
      </div>

      {/* Filter tabs */}
      <div className="inline-flex gap-1 mb-6 p-1 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
        {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
            style={{
              background: filter === f ? '#6C3BFF' : 'transparent',
              color:      filter === f ? '#ffffff' : '#6B6480',
              boxShadow:  filter === f ? '0 2px 8px rgba(108,59,255,0.32)' : 'none',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[13px]" style={{ color: '#6B6480' }}>Cargando…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl text-center flex flex-col items-center gap-3" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '48px 24px' }}>
          <div className="flex items-center justify-center rounded-2xl" style={{ background: 'rgba(34,197,94,0.10)', width: 56, height: 56 }}>
            <CheckCircle2 size={24} style={{ color: '#22C55E' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>
              {filter === 'pending' ? 'La cola está vacía' : 'Sin registros'}
            </p>
            <p className="text-[13px] mt-1 max-w-md" style={{ color: '#6B6480' }}>
              {filter === 'pending' ? 'Ningún handoff reply está esperando reintento.' : 'No hay eventos con este filtro.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => {
            const status = rowStatus(item);
            const Icon = status.Icon;
            return (
              <div
                key={item.id}
                className="rounded-2xl"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold"
                        style={{ background: `${status.color}18`, color: status.color, border: `1px solid ${status.color}30` }}
                      >
                        <Icon size={11} />
                        {status.label}
                      </span>
                      <span className="text-[11px] font-semibold" style={{ color: '#9B8FB5' }}>
                        Intentos: {item.retry_count}/5
                      </span>
                    </div>

                    <p className="text-[15px] font-bold tracking-tight truncate" style={{ color: '#1A0A3B' }}>
                      {item.subject || '(sin asunto)'}
                    </p>
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B6480' }}>
                      De: {item.from_email}
                    </p>

                    <div className="text-[12px] mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ color: '#6B6480' }}>
                      <div>
                        <span style={{ color: '#9B8FB5' }}>Primer fallo:</span>{' '}
                        <span style={{ color: '#1A0A3B', fontWeight: 500 }}>
                          {new Date(item.first_failed_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#9B8FB5' }}>Último intento:</span>{' '}
                        <span style={{ color: '#1A0A3B', fontWeight: 500 }}>
                          {new Date(item.last_attempted_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {item.next_retry_at && (
                        <div>
                          <span style={{ color: '#9B8FB5' }}>Próximo intento:</span>{' '}
                          <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                            {new Date(item.next_retry_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                      <div>
                        <span style={{ color: '#9B8FB5' }}>Request ID:</span>{' '}
                        <span style={{ color: '#1A0A3B', fontFamily: 'monospace', fontWeight: 500 }}>
                          {item.human_request_id.slice(0, 8)}…
                        </span>
                      </div>
                    </div>

                    {item.last_error && (
                      <div className="mt-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', padding: '10px 14px' }}>
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: '#B91C1C' }}>Último error</p>
                        <p className="text-[12px] whitespace-pre-wrap font-mono leading-relaxed" style={{ color: '#78350F' }}>
                          {item.last_error}
                        </p>
                      </div>
                    )}
                  </div>

                  {!item.resolved_at && (
                    <button
                      onClick={() => forceRetry(item.id)}
                      disabled={acting === item.id}
                      className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all flex-shrink-0"
                      style={{
                        padding:    '9px 14px',
                        background: acting === item.id ? '#B9A8E8' : '#6C3BFF',
                        color:      '#ffffff',
                        boxShadow:  acting === item.id ? 'none' : '0 2px 8px rgba(108,59,255,0.32)',
                        cursor:     acting === item.id ? 'not-allowed' : 'pointer',
                      }}
                      title="Fuerza next_retry_at=NOW() para que el cron lo tome en la siguiente corrida."
                    >
                      <RotateCcw size={12} />
                      {acting === item.id ? 'Encolando…' : 'Reintentar ya'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
