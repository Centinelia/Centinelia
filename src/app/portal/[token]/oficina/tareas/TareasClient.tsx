'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ListChecks, ClipboardCheck, Calendar, CheckCircle2 } from 'lucide-react';
import AgentTasksSection    from './AgentTasksSection';
import PlanApprovalsSection from '../tareas-programadas/PlanApprovalsSection';
import TareasProgramadasSection from '../tareas-programadas/TareasProgramadasSection';

type Tab = 'tareas' | 'programadas';

interface AgentInfo {
  id:              string;
  agent_name:      string | null;
  role:            string | null;
  is_coordinator:  boolean;
  meerkat_role_id: string | null;
}

interface Counters {
  activas:      number;
  aprobaciones: number;
  semana:       number;
  programadas:  number;
}

interface Props {
  token:    string;
  agents:   AgentInfo[];
  counters: Counters;
}

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'tareas',      label: 'En curso',    icon: ListChecks },
  { key: 'programadas', label: 'Programadas', icon: Calendar },
];

interface KpiInlineProps {
  label:  string;
  value:  number;
  accent: string;
}

function KpiInline({ label, value, accent }: KpiInlineProps) {
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-2.5 rounded-xl min-w-0"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] truncate" style={{ color: '#6B6480' }}>
        {label}
      </p>
      <p className="text-[20px] font-bold leading-none tabular-nums" style={{ color: accent }}>
        {value.toLocaleString('es-MX')}
      </p>
    </div>
  );
}

export default function TareasClient({ token, agents, counters }: Props) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const initial      = (searchParams.get('tab') as Tab) === 'programadas' ? 'programadas' : 'tareas';
  const [tab, setTab] = useState<Tab>(initial);

  useEffect(() => {
    const q = new URLSearchParams(Array.from(searchParams.entries()));
    if (tab === 'tareas') q.delete('tab'); else q.set('tab', tab);
    const url = q.toString() ? `${pathname}?${q.toString()}` : pathname;
    router.replace(url, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  const totalUrgente = counters.activas + counters.aprobaciones;

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
          Tareas
        </p>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          Trabajo de tu equipo
        </h1>
        <p className="text-[14px]" style={{ color: '#6B6480' }}>
          {totalUrgente > 0 ? (
            <>
              <strong style={{ color: '#1A0A3B' }}>{counters.activas}</strong> {counters.activas === 1 ? 'tarea' : 'tareas'} en curso
              {counters.aprobaciones > 0 && <> · <strong style={{ color: '#F59E0B' }}>{counters.aprobaciones}</strong> {counters.aprobaciones === 1 ? 'espera' : 'esperan'} tu aprobación</>}
              {' · '}{counters.semana} completadas esta semana
            </>
          ) : (
            <>Todo listo. {counters.semana} completadas esta semana.</>
          )}
        </p>
      </header>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiInline label="En curso"     value={counters.activas}      accent="#6C3BFF" />
        <KpiInline label="Por aprobar"  value={counters.aprobaciones} accent="#F59E0B" />
        <KpiInline label="7 días"       value={counters.semana}       accent="#22C55E" />
        <KpiInline label="Programadas"  value={counters.programadas}  accent="#3B82F6" />
      </section>

      {/* ── Pills de vista ────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => {
          const active = tab === t.key;
          const Icon   = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
              style={{
                background: active ? '#1A0A3B' : '#ffffff',
                color:      active ? '#ffffff' : '#6B6480',
                border:     active ? '1px solid #1A0A3B' : '1px solid #E8E3F5',
              }}
            >
              <Icon size={14} strokeWidth={1.75} />
              {t.label}
              {t.key === 'tareas' && counters.aprobaciones > 0 && (
                <span
                  className="ml-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                  style={{
                    minWidth:   16,
                    height:     16,
                    padding:    '0 5px',
                    background: active ? 'rgba(245,158,11,0.9)' : '#F59E0B',
                    color:      '#ffffff',
                  }}
                >
                  {counters.aprobaciones}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      {tab === 'tareas' && (
        <div className="flex flex-col gap-4">
          <PlanApprovalsSection token={token} />
          <AgentTasksSection    token={token} />
        </div>
      )}

      {tab === 'programadas' && (
        <TareasProgramadasSection token={token} agents={agents} />
      )}
    </div>
  );
}
