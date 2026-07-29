'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, X } from 'lucide-react';

interface Call {
  id:            string;
  outcome:       string;
  caller_number: string;
  created_at:    string;
}

interface Toast {
  id:      string;
  message: string;
  color:   string;
}

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Nuevo lead',
  appointment_booked: 'Cita agendada',
  order_taken:        'Pedido tomado',
  transferred:        'Llamada transferida',
  info_provided:      'Llamada atendida',
  missed:             'Llamada perdida',
  other:              'Llamada completada',
};

const OUTCOME_COLORS: Record<string, string> = {
  lead_created:       '#6C3BFF',
  appointment_booked: '#3b82f6',
  order_taken:        '#f59e0b',
  transferred:        '#a855f7',
  missed:             '#ef4444',
  other:              '#6b7280',
};

export default function LiveNotifications({ token }: { token: string }) {
  const lastSeen = useRef<string>(new Date().toISOString());
  const [toasts, setToasts] = useState<Toast[]>([]);

  function dismiss(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  function addToast(call: Call) {
    const toast: Toast = {
      id:      call.id,
      message: `${OUTCOME_LABELS[call.outcome] ?? 'Llamada'} · ${call.caller_number || 'Número desconocido'}`,
      color:   OUTCOME_COLORS[call.outcome] ?? '#6b7280',
    };
    setToasts(prev => [toast, ...prev].slice(0, 3));
    setTimeout(() => dismiss(call.id), 7000);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Centinelia · Nueva actividad', {
        body: toast.message,
        icon: '/logo.png',
        tag:  call.id,
      });
    }
  }

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/portal/${token}/events?since=${encodeURIComponent(lastSeen.current)}`
        );
        if (!res.ok) return;
        const data: { calls: Call[] } = await res.json();
        if (data.calls?.length) {
          lastSeen.current = data.calls[0].created_at;
          data.calls.forEach(addToast);
        }
      } catch { /* network error, ignore */ }
    };

    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position:       'fixed',
      bottom:         16,
      right:          16,
      zIndex:         9999,
      display:        'flex',
      flexDirection:  'column',
      gap:            8,
      maxWidth:       320,
      width:          'calc(100vw - 32px)',
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          10,
            padding:      '11px 14px',
            borderRadius: 12,
            background:   'var(--c-surface)',
            border:       `1px solid ${toast.color}35`,
            boxShadow:    '0 8px 28px rgba(0,0,0,0.35)',
            animation:    'liveSlide 0.2s ease',
          }}
        >
          <div style={{
            width:        32,
            height:       32,
            borderRadius: 8,
            flexShrink:   0,
            background:   `${toast.color}15`,
            border:       `1px solid ${toast.color}30`,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}>
            <Phone size={14} style={{ color: toast.color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nueva actividad</p>
            <p style={{ fontSize: 12, color: 'var(--c-text-2)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.message}</p>
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', padding: 2, flexShrink: 0 }}
            aria-label="Cerrar"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <style>{`@keyframes liveSlide { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  );
}
