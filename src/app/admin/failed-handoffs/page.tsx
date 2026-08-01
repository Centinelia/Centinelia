'use client';

import { useEffect, useState, useCallback } from 'react';
import { RotateCcw, Clock, CheckCircle2, AlertOctagon, RefreshCw } from 'lucide-react';

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
  const [filter, setFilter]   = useState<Filter>('pending');
  const [items, setItems]     = useState<FailedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/failed-handoffs?status=${filter}`);
      const d = await r.json();
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const forceRetry = async (id: string) => {
    setActing(id);
    try {
      await fetch('/api/admin/failed-handoffs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      });
      await load();
    } finally {
      setActing(null);
    }
  };

  const rowStatus = (r: FailedRow): { label: string; color: string; Icon: typeof Clock } => {
    if (r.resolved_at)       return { label: 'Resuelto',            color: '#22c55e', Icon: CheckCircle2 };
    if (r.notified_admin_at) return { label: 'Sin retry (avisado)', color: '#ef4444', Icon: AlertOctagon };
    if (r.next_retry_at)     return { label: 'En cola',             color: '#f59e0b', Icon: Clock };
    return { label: 'Sin retry', color: '#94a3b8', Icon: AlertOctagon };
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Respuestas humanas fallidas</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
            Cola de reintentos para <code>processHandoffReply</code>. El cron corre cada 15 min con backoff exponencial (15/30/60/180/720 min). Tras 5 fallos avisa a hola@centinelia.mx.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}
        >
          <RefreshCw size={12} />
          Refrescar
        </button>
      </div>

      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'var(--c-surface-2)' }}>
        {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: filter === f ? '#6C3BFF' : 'transparent',
              color:      filter === f ? '#fff' : 'var(--c-text-3)',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
          {filter === 'pending' ? 'La cola está vacía. Ningún handoff reply está esperando reintento.' : 'Sin registros para este filtro.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => {
            const status = rowStatus(item);
            const Icon = status.Icon;
            return (
              <div
                key={item.id}
                className="rounded-xl p-4"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: `${status.color}18`, color: status.color, border: `1px solid ${status.color}30` }}
                      >
                        <Icon size={11} />
                        {status.label}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                        Intentos: {item.retry_count}/5
                      </span>
                    </div>

                    <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
                      {item.subject || '(sin asunto)'}
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>
                      De: {item.from_email}
                    </p>

                    <div className="text-xs mt-3 grid grid-cols-2 gap-x-4 gap-y-1" style={{ color: 'var(--c-text-4)' }}>
                      <div>
                        <span style={{ color: 'var(--c-text-4)' }}>Primer fallo:</span>{' '}
                        <span style={{ color: 'var(--c-text-3)' }}>
                          {new Date(item.first_failed_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--c-text-4)' }}>Último intento:</span>{' '}
                        <span style={{ color: 'var(--c-text-3)' }}>
                          {new Date(item.last_attempted_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {item.next_retry_at && (
                        <div>
                          <span style={{ color: 'var(--c-text-4)' }}>Próximo intento:</span>{' '}
                          <span style={{ color: '#f59e0b' }}>
                            {new Date(item.next_retry_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                      <div>
                        <span style={{ color: 'var(--c-text-4)' }}>Request ID:</span>{' '}
                        <span style={{ color: 'var(--c-text-3)', fontFamily: 'monospace' }}>
                          {item.human_request_id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>

                    {item.last_error && (
                      <div className="mt-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: '#ef4444' }}>Último error</p>
                        <p className="text-xs whitespace-pre-wrap font-mono leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                          {item.last_error}
                        </p>
                      </div>
                    )}
                  </div>

                  {!item.resolved_at && (
                    <button
                      onClick={() => forceRetry(item.id)}
                      disabled={acting === item.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                      style={{ background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
                      title="Fuerza next_retry_at=NOW() para que el cron lo tome en la siguiente corrida. Resetea contador."
                    >
                      <RotateCcw size={12} />
                      {acting === item.id ? 'Encolando...' : 'Reintentar ya'}
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
