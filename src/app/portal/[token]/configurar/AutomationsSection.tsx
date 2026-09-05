'use client';

import { useState, useEffect } from 'react';
import { Bell, Lightbulb, Brain } from 'lucide-react';
import type { AutomationName } from '@/types/agent';

interface AutomationView {
  enabled:             boolean;
  estimated_tareas_mo: string;
  last_ran_at:         string | null;
  requires_email:      boolean;
  available:           boolean;
}

const META: Record<AutomationName, { title: string; desc: string; Icon: typeof Bell }> = {
  heartbeat: {
    title: 'Reporte diario de actividad',
    desc: 'Cada mañana tu empleado te manda un email con lo que hizo el día anterior: llamadas, correos, documentos, tareas y citas.',
    Icon: Bell,
  },
  weekly_insights: {
    title: 'Recomendaciones semanales',
    desc: 'Cada lunes recibes 2 a 4 recomendaciones basadas en toda la actividad de tu empleado la semana pasada.',
    Icon: Lightbulb,
  },
  learn: {
    title: 'Aprendizaje quincenal',
    desc: 'Cada 15 días tu empleado aprende reglas de tu negocio observando correos, llamadas, documentos y tareas de las últimas 2 semanas.',
    Icon: Brain,
  },
  // brief_del_dia se configura via brief_del_dia_config (solo Nox), no aparece en la UI de Automations
  brief_del_dia: {
    title: 'Brief del día',
    desc:  'Nox prepara cada mañana un resumen ejecutivo con correos urgentes, agenda, tareas y escalaciones pendientes.',
    Icon:  Bell,
  },
};

const AUTOMATION_ORDER: AutomationName[] = ['heartbeat', 'weekly_insights', 'learn'];

interface Props {
  token:     string;
  agentId:   string;
  roleColor: string;
}

export default function AutomationsSection({ token, agentId, roleColor }: Props) {
  const [state,   setState]   = useState<Record<AutomationName, AutomationView> | null>(null);
  const [quota,   setQuota]   = useState<{ used: number; limit: number; resets_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<AutomationName | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/agentes/${agentId}/automations`);
      if (!res.ok) {
        setError('No se pudo cargar la configuración.');
        return;
      }
      const json = await res.json();
      setState(json.automations);
      setQuota(json.quota);
    } catch {
      setError('No se pudo cargar la configuración.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (agentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function toggle(name: AutomationName, enabled: boolean) {
    setPending(name);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/agentes/${agentId}/automations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation: name, enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? 'No se pudo actualizar.');
      } else {
        await load();
      }
    } catch {
      setError('No se pudo actualizar.');
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando automatizaciones...</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {quota && (
        <div
          className="rounded-xl px-4 py-2.5 text-sm"
          style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        >
          <span style={{ color: 'var(--c-text-2)' }}>
            Pool mensual:{' '}
            <strong style={{ color: 'var(--c-text)' }}>{quota.used}/{quota.limit}</strong>{' '}
            tareas usadas.
          </span>
          {quota.resets_at && (
            <span style={{ color: 'var(--c-text-3)' }}>
              {' '}Se renueva el {new Date(quota.resets_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </span>
          )}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl px-4 py-2.5 text-sm"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {AUTOMATION_ORDER.map((name) => {
          const meta     = META[name];
          const cfg      = state?.[name];
          const isActive = !!cfg?.enabled;
          const unavailable = !!(cfg?.requires_email && !cfg?.available);
          const isDisabled  = unavailable || pending === name || state === null;

          return (
            <div
              key={name}
              className="rounded-xl p-4"
              style={{
                background: 'var(--c-surface-2)',
                border: `1px solid ${isActive ? `${roleColor}40` : 'var(--c-border)'}`,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <meta.Icon
                    size={18}
                    className="flex-shrink-0 mt-0.5"
                    style={{ color: isActive ? roleColor : 'var(--c-text-4)' }}
                  />
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                      {meta.title}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                      {meta.desc}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                      Costo estimado: {cfg?.estimated_tareas_mo ?? '...'}
                    </p>
                    {unavailable && (
                      <p className="text-xs font-medium" style={{ color: '#f59e0b' }}>
                        Requiere correo conectado.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => toggle(name, !isActive)}
                  disabled={isDisabled}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={
                    isActive
                      ? { background: roleColor, color: '#fff', opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }
                      : {
                          background: 'var(--c-surface)',
                          border: '1px solid var(--c-border)',
                          color: 'var(--c-text-2)',
                          opacity: isDisabled ? 0.4 : 1,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }
                  }
                >
                  {pending === name ? '...' : isActive ? 'Activo' : 'Activar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
