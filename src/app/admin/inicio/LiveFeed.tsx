'use client';

import { useEffect, useState } from 'react';
import { Loader2, PhoneCall, Mail, UserPlus, Calendar, ShoppingBag, CheckSquare, Sparkles, Circle } from 'lucide-react';

interface ActivityEvent {
  id:       string;
  ts:       string;
  kind:     string;
  actor:    string;
  message:  string;
  agentId?: string;
  status?:  string;
}

const KIND_ICON: Record<string, React.ComponentType<{ size: number }>> = {
  call:        PhoneCall,
  email:       Mail,
  lead:        UserPlus,
  appointment: Calendar,
  order:       ShoppingBag,
  task:        CheckSquare,
  learning:    Sparkles,
};

const KIND_COLOR: Record<string, string> = {
  call:        '#a855f7',
  email:       '#3b82f6',
  lead:        '#22c55e',
  appointment: '#60a5fa',
  order:       '#f59e0b',
  task:        '#6C3BFF',
  learning:    '#e879f9',
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.round((now - t) / 1000);
  if (secs < 60) return `hace ${secs}s`;
  if (secs < 3600) return `hace ${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)}h`;
  return `hace ${Math.floor(secs / 86400)}d`;
}

export default function LiveFeed({ initial }: { initial: ActivityEvent[] }) {
  const [events, setEvents]   = useState<ActivityEvent[]>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch]   = useState<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setRefreshing(true);
      try {
        const res  = await fetch('/api/admin/activity-feed', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setEvents(data.events);
          setLastFetch(Date.now());
        }
      } catch {
        /* silently retry next tick */
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    const id = window.setInterval(refresh, 15_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
          Feed en vivo
        </h2>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-4)' }}>
          {refreshing ? <Loader2 size={11} className="animate-spin" /> : <Circle size={7} style={{ fill: '#22c55e', color: '#22c55e' }} />}
          <span>{relativeTime(new Date(lastFetch).toISOString())}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {events.length === 0 && (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--c-text-4)' }}>Sin actividad reciente.</div>
        )}
        {events.map((e, i) => {
          const Icon  = KIND_ICON[e.kind] ?? Circle;
          const color = KIND_COLOR[e.kind] ?? '#9ca3af';
          return (
            <div
              key={e.id}
              className="flex items-start gap-3 px-4 py-2.5"
              style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}
            >
              <div style={{ color, marginTop: 2, flexShrink: 0 }}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{e.actor}</span>
                  <span className="text-xs" style={{ color: 'var(--c-text-4)', flexShrink: 0 }}>{relativeTime(e.ts)}</span>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>{e.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
