'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Zap } from 'lucide-react';
import { SectionHeader } from '@/components/portal-ui';

type Mode = 'auto' | 'always' | 'default';

interface Settings {
  always_approve_delegations: boolean;
  auto_approve_task_plans:    boolean;
}

const OPTIONS: { key: Mode; label: string; desc: string; icon: typeof ShieldCheck }[] = [
  {
    key:   'default',
    label: 'Automático inteligente',
    desc:  'Los empleados ejecutan tareas cortas sin pedir permiso. Tareas grandes o con palabras como "campaña", "lanzamiento" o "múltiples" piden aprobación por correo antes de ejecutar.',
    icon:  Zap,
  },
  {
    key:   'always',
    label: 'Modo supervisado',
    desc:  'TODA tarea que un empleado delegue a otro requiere tu aprobación por correo antes de ejecutarse. Ideal cuando quieres máximo control sobre lo que se envía o se hace en nombre del negocio.',
    icon:  ShieldCheck,
  },
  {
    key:   'auto',
    label: 'Auto-ejecución total',
    desc:  'Los empleados ejecutan cualquier delegación sin pedir aprobación, incluso tareas grandes. Máxima velocidad, mínima supervisión. Usa este modo solo cuando confíes plenamente en tu equipo de empleados.',
    icon:  Zap,
  },
];

export default function ApprovalSettingsSection({ token, roleColor }: { token: string; roleColor: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}/org-approval-settings`).then(r => r.json()).then(setSettings).catch(() => setSettings({ always_approve_delegations: false, auto_approve_task_plans: false }));
  }, [token]);

  const currentMode: Mode = settings?.always_approve_delegations
    ? 'always'
    : settings?.auto_approve_task_plans
      ? 'auto'
      : 'default';

  const setMode = async (mode: Mode) => {
    if (mode === currentMode || !settings) return;
    setSaving(true);
    setMsg(null);
    const payload: Settings = {
      always_approve_delegations: mode === 'always',
      auto_approve_task_plans:    mode === 'auto',
    };
    try {
      const res = await fetch(`/api/portal/${token}/org-approval-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      setSettings(payload);
      setMsg('Guardado.');
    } catch {
      setMsg('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <section id="aprobaciones" className="scroll-mt-6">
      <SectionHeader
        as="h2"
        title="Aprobación entre empleados"
        tooltip="Aplica solo cuando un empleado le pide a otro hacer algo (por ejemplo Sofía le pide a Noah que envíe un correo). El nivel de autonomía de arriba controla las acciones que cada empleado hace por su cuenta."
        className="mb-2"
      />
      <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--c-text-3)' }}>
        ¿Quieres aprobar cada delegación entre empleados antes de que se ejecute?
      </p>

      {!settings && <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Cargando…</p>}

      {settings && (
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
