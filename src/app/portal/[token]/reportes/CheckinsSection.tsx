'use client';

import { useState, useEffect, useCallback } from 'react';
import { Copy, ChevronDown, ChevronUp, Inbox, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { marked } from 'marked';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

interface HeartbeatRun {
  id:         string;
  agent_id:   string;
  ran_at:     string;
  frequency:  'daily' | 'weekly';
  subject:    string;
  content_md: string;
  read_at:    string | null;
}

export interface CheckinsSectionAgent {
  id:              string;
  business_name:   string;
  meerkat_role_id: string | null;
}

interface Props {
  token:  string;
  agents: CheckinsSectionAgent[];
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)  return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7)   return `Hace ${days} días`;
  const weeks = Math.floor(days / 7);
  return `Hace ${weeks} sem`;
}

export default function CheckinsSection({ token, agents }: Props) {
  const [runs, setRuns]           = useState<HeartbeatRun[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expandedId, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/heartbeat-runs`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs ?? []);
      }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic update
    setRuns(prev => prev.map(r => r.id === id ? { ...r, read_at: new Date().toISOString() } : r));
    fetch(`/api/portal/${token}/heartbeat-runs/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }, [token]);

  const toggle = (id: string) => {
    const opening = expandedId !== id;
    setExpanded(opening ? id : null);
    if (opening) {
      const run = runs.find(r => r.id === id);
      if (run && !run.read_at) markRead(id);
    }
  };

  const copy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const agentInfo = (agentId: string) => {
    const a = agents.find(x => x.id === agentId);
    if (!a || !a.meerkat_role_id) return { name: a?.business_name ?? 'Agente', color: '#6C3BFF' };
    const meerkat = MEERKAT_MAP[a.meerkat_role_id as keyof typeof MEERKAT_MAP];
    return { name: meerkat?.nombre ?? a.business_name, color: meerkat?.color ?? '#6C3BFF' };
  };

  const unreadCount = runs.filter(r => !r.read_at).length;

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-xl h-14 animate-pulse" style={{ background: 'var(--c-surface-2)' }} />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-8 rounded-xl" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
        <Inbox size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--c-text-4)' }} />
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Los check-ins de Nox y Niva aparecerán aquí cuando ejecuten.
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-4)' }}>
          Configura la frecuencia en la sección de cada agente.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Check-ins de tus coordinadores
          </span>
          {unreadCount > 0 && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(108,59,255,0.12)', color: '#6C3BFF' }}
            >
              {unreadCount} sin leer
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="Actualizar lista de check-ins"
          title="Actualizar"
          className="p-1.5 rounded-lg"
          style={{ color: 'var(--c-text-4)' }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {runs.map(run => {
        const isExpanded = expandedId === run.id;
        const isUnread   = !run.read_at;
        const info       = agentInfo(run.agent_id);
        return (
          <div
            key={run.id}
            className="rounded-xl overflow-hidden"
            style={{
              border:     `1px solid ${isExpanded ? info.color + '44' : 'var(--c-border)'}`,
              background: isExpanded ? `${info.color}08` : 'var(--c-surface-2)',
            }}
          >
            <button
              type="button"
              onClick={() => toggle(run.id)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--c-hover)]"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="flex-shrink-0 pt-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: isUnread ? info.color : 'transparent',
                    border:     isUnread ? 'none' : '1px solid var(--c-border-2)',
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: `${info.color}18`, color: info.color, border: `1px solid ${info.color}30` }}
                  >
                    {info.name}
                  </span>
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: 'var(--c-text-4)' }}
                  >
                    {run.frequency === 'weekly' ? 'Semanal' : 'Diario'}
                  </span>
                </div>
                <p
                  className={`text-sm truncate ${isUnread ? 'font-semibold' : 'font-normal'}`}
                  style={{ color: isUnread ? 'var(--c-text)' : 'var(--c-text-3)' }}
                >
                  {run.subject}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                  {relativeTime(run.ran_at)}
                </span>
                {isExpanded
                  ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} />
                  : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4" style={{ borderTop: `1px solid ${info.color}20` }}>
                <div
                  className="text-xs leading-relaxed mt-3 mb-3 prose prose-sm max-w-none"
                  style={{ color: 'var(--c-text-2)' }}
                  dangerouslySetInnerHTML={{ __html: marked.parse(run.content_md) as string }}
                />
                <button
                  type="button"
                  onClick={() => copy(run.content_md)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}
                >
                  <Copy size={12} />
                  Copiar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
