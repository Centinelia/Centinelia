'use client';

import { useEffect, useState } from 'react';
import { Zap, Timer } from 'lucide-react';
import { SectionHeader } from '@/components/portal-ui';

type Mode = 'instant' | 'batched';

const OPTIONS: { key: Mode; label: string; desc: string; icon: typeof Zap }[] = [
  {
    key:   'instant',
    label: 'Procesar al instante',
    desc:  'Cuando programas una llamada saliente o creas una campaña lista para salir "ahora", el sistema la ejecuta en segundos. Ideal si quieres máxima velocidad y responder en tiempo real.',
    icon:  Zap,
  },
  {
    key:   'batched',
    label: 'Consolidar cada hora',
    desc:  'El sistema agrupa el trabajo y lo procesa una vez por hora en horarios predecibles. Menos ruido, envíos concentrados, más fácil de auditar. Ideal si prefieres tandas ordenadas.',
    icon:  Timer,
  },
];

export default function InstantProcessingSection({ token, agentId, roleColor, hideHeader }: { token: string; agentId?: string; roleColor: string; hideHeader?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<string | null>(null);

  const qs = agentId ? `?agent_id=${agentId}` : '';

  useEffect(() => {
    fetch(`/api/portal/${token}/org-approval-settings${qs}`)
      .then(r => r.json())
      .then(d => setEnabled(typeof d.instant_processing_enabled === 'boolean' ? d.instant_processing_enabled : true))
      .catch(() => setEnabled(true));
  }, [token, qs]);

  const setMode = async (mode: Mode) => {
    const next = mode === 'instant';
    if (enabled === next || enabled === null) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/portal/${token}/org-approval-settings${qs}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ instant_processing_enabled: next }),
      });
      if (!res.ok) throw new Error('save failed');
      setEnabled(next);
      setMsg('Guardado.');
    } catch {
      setMsg('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const currentMode: Mode | null = enabled === null ? null : enabled ? 'instant' : 'batched';

  return (
    <section id="ritmo-de-trabajo" className="scroll-mt-6">
      {!hideHeader && (
        <>
          <SectionHeader
            as="h2"
            title="Ritmo de trabajo"
            tooltip="Controla la velocidad a la que el sistema procesa llamadas salientes programadas y otros trabajos automáticos."
            className="mb-2"
          />
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--c-text-3)' }}>
            ¿Prefieres que las cosas pasen al instante o consolidadas por hora?
          </p>
        </>
      )}

      {enabled === null && <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Cargando…</p>}

      {enabled !== null && (
        <div className="space-y-2">
          {OPTIONS.map(o => {
            const active = currentMode === o.key;
            const Icon   = o.icon;
            return (
              <button
                key={o.key}
                type="button"
                disabled={saving}
                onClick={() => setMode(o.key)}
                className="w-full text-left p-4 rounded-lg transition-all"
                style={{
                  background: active ? `${roleColor}10` : 'var(--c-surface)',
                  border:     `1px solid ${active ? roleColor : 'var(--c-border)'}`,
                  cursor:     saving ? 'wait' : 'pointer',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    <Icon size={18} style={{ color: active ? roleColor : 'var(--c-text-3)' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold" style={{ color: active ? roleColor : 'var(--c-text)' }}>{o.label}</span>
                      {active && <span className="text-xs" style={{ color: roleColor }}>· Activo</span>}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>{o.desc}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {msg && (
        <p className="text-xs mt-2" style={{ color: 'var(--c-text-2)' }}>{msg}</p>
      )}
    </section>
  );
}
