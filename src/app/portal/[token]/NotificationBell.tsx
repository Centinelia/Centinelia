'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle, Phone, X } from 'lucide-react';

interface Call {
  id:            string;
  outcome:       string;
  caller_number: string;
  created_at:    string;
}

interface Notif {
  id:      string;
  message: string;
  color:   string;
  time:    string;
  read:    boolean;
}

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       '🎯 Nuevo lead',
  appointment_booked: '📅 Cita agendada',
  order_taken:        '🛒 Pedido tomado',
  transferred:        '📞 Llamada transferida',
  info_provided:      'ℹ️ Llamada atendida',
  missed:             '📵 Llamada perdida',
  other:              '📱 Llamada completada',
};

const OUTCOME_COLORS: Record<string, string> = {
  lead_created:       '#6C3BFF',
  appointment_booked: '#3b82f6',
  order_taken:        '#f59e0b',
  transferred:        '#a855f7',
  missed:             '#ef4444',
  other:              '#6b7280',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Hace ${hr} h`;
  return `Hace ${Math.floor(hr / 24)} d`;
}

export default function NotificationBell({ token }: { token: string }) {
  const lastSeen  = useRef<string>(new Date().toISOString());
  const panelRef  = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open,   setOpen]   = useState(false);

  function addNotif(call: Call) {
    const n: Notif = {
      id:      call.id,
      message: `${OUTCOME_LABELS[call.outcome] ?? '📱 Llamada'} · ${call.caller_number || 'Número desconocido'}`,
      color:   OUTCOME_COLORS[call.outcome] ?? '#6b7280',
      time:    call.created_at,
      read:    false,
    };
    setNotifs(prev => [n, ...prev].slice(0, 20));
    setUnread(prev => prev + 1);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Centinelia · Nueva actividad', { body: n.message, icon: '/logo.png', tag: call.id });
    }
  }

  function dismiss(id: string) {
    setNotifs(prev => {
      const target = prev.find(n => n.id === id);
      if (target && !target.read) setUnread(u => Math.max(0, u - 1));
      return prev.filter(n => n.id !== id);
    });
  }

  function clearAll() {
    setNotifs([]);
    setUnread(0);
  }

  // Poll for new calls every 30s
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/portal/${token}/events?since=${encodeURIComponent(lastSeen.current)}`);
        if (!res.ok) return;
        const data: { calls: Call[] } = await res.json();
        if (data.calls?.length) {
          lastSeen.current = data.calls[0].created_at;
          data.calls.forEach(addNotif);
        }
      } catch { /* network error, ignore */ }
    };
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Request browser notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Mark all as read when panel opens
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    }, 400);
    return () => clearTimeout(t);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        aria-label="Notificaciones"
        style={{
          position:       'relative',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          34,
          height:         34,
          borderRadius:   10,
          background:     open ? 'var(--c-surface)' : 'var(--c-surface-2)',
          border:         open ? '1px solid rgba(108,59,255,0.35)' : '1px solid var(--c-border)',
          cursor:         'pointer',
          color:          open ? '#9B6DFF' : 'var(--c-text-2)',
          flexShrink:     0,
          transition:     'background 0.15s, color 0.15s, border-color 0.15s',
        }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span style={{
            position:     'absolute',
            top:          4,
            right:        4,
            width:        7,
            height:       7,
            borderRadius: '50%',
            background:   '#ef4444',
            border:       '1.5px solid var(--c-modal)',
            animation:    'bellPulse 2s ease infinite',
          }} />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position:      'absolute',
            top:           'calc(100% + 8px)',
            right:         0,
            width:         300,
            maxHeight:     400,
            borderRadius:  14,
            background:    'var(--c-modal)',
            border:        '1px solid var(--c-border)',
            boxShadow:     '0 16px 48px rgba(0,0,0,0.35)',
            zIndex:        100,
            overflow:      'hidden',
            display:       'flex',
            flexDirection: 'column',
            animation:     'bellDrop 0.15s ease',
          }}
        >
          {/* Header */}
          <div style={{
            padding:        '11px 14px',
            borderBottom:   '1px solid var(--c-border)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexShrink:     0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              Actividad reciente
            </span>
            {notifs.length > 0 && (
              <button
                onClick={clearAll}
                style={{ fontSize: 11, color: 'var(--c-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
              >
                Limpiar
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: 'var(--c-text-3)', margin: 0 }}>Todo en orden</p>
              </div>
            ) : notifs.map((n, i) => (
              <div
                key={n.id}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          10,
                  padding:      '9px 14px',
                  borderBottom: i < notifs.length - 1 ? '1px solid var(--c-border-2)' : 'none',
                  background:   n.read ? 'transparent' : `${n.color}08`,
                  transition:   'background 0.3s',
                }}
              >
                <div style={{
                  width:          28,
                  height:         28,
                  borderRadius:   7,
                  flexShrink:     0,
                  background:     `${n.color}15`,
                  border:         `1px solid ${n.color}30`,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                }}>
                  <Phone size={12} style={{ color: n.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.message}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--c-text-4)', margin: '2px 0 0' }}>
                    {timeAgo(n.time)}
                  </p>
                </div>
                <button
                  onClick={() => dismiss(n.id)}
                  aria-label="Eliminar"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)', padding: 2, flexShrink: 0 }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bellPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bellDrop {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
