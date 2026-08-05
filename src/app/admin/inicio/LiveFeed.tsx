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
  call:        '#8B5CF6',
  email:       '#3B82F6',
  lead:        '#10B981',
  appointment: '#60A5FA',
  order:       '#F59E0B',
  task:        '#6C3BFF',
  learning:    '#EC4899',
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
        <h3 className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
          Feed en vivo
        </h3>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6B7280' }}>
          {refreshing
            ? <Loader2 size={11} className="animate-spin" />
            : <Circle size={7} style={{ fill: '#10B981', color: '#10B981' }} />}
          <span>{relativeTime(new Date(lastFetch).toISOString())}</span>
        </div>
      </div>
      <div
        className="rounded-xl overflow-hidden bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
      >
        {events.length === 0 && (
          <div className="p-6 text-center text-[13px]" style={{ color: '#6B7280' }}>Sin actividad reciente.</div>
        )}
        {events.map((e, i) => {
          const Icon  = KIND_ICON[e.kind] ?? Circle;
          const color = KIND_COLOR[e.kind] ?? '#9CA3AF';
          return (
            <div
              key={e.id}
              className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
              style={{ borderTop: i === 0 ? 'none' : '1px solid #F3F4F6' }}
            >
              <div style={{ color, marginTop: 2, flexShrink: 0 }}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium" style={{ color: '#111827' }}>{e.actor}</span>
                  <span className="text-[12px] tabular-nums" style={{ color: '#9CA3AF', flexShrink: 0 }}>{relativeTime(e.ts)}</span>
                </div>
                <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B7280' }}>{e.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
