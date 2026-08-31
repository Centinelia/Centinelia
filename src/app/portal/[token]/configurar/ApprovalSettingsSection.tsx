'use client';

import { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { SectionHeader } from '@/components/portal-ui';

interface Settings {
  always_approve_delegations: boolean;
  auto_approve_task_plans:    boolean;
}

/**
 * F5 — este panel antes tenía 3 modos (Supervisado / Inteligente / Auto-ejecución).
 * Post-F4 el heurístico "inteligente" ya solo escala en alto stakes real (dinero,
 * contratos, envíos masivos), lo que dejó "Auto-ejecución total" redundante.
 * Colapsamos a un default (inteligente) + un toggle único de máximo control.
 * Ver [[feedback-empleados-inteligentes]].
 */
export default function ApprovalSettingsSection({ token, agentId, roleColor, hideHeader }: { token: string; agentId?: string; roleColor: string; hideHeader?: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState<string | null>(null);

  const qs = agentId ? `?agent_id=${agentId}` : '';

  useEffect(() => {
    fetch(`/api/portal/${token}/org-approval-settings${qs}`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => setSettings({ always_approve_delegations: false, auto_approve_task_plans: false }));
  }, [token, qs]);

  const alwaysOn = !!settings?.always_approve_delegations;

  const toggleAlways = async (next: boolean) => {
    if (!settings) return;
    setSaving(true);
    setMsg(null);
    const payload: Settings = {
      always_approve_delegations: next,
      // auto_approve_task_plans se mantiene siempre false desde el UI. El flag
      // sigue vivo en backend para org-level overrides raros (soporte técnico).
      auto_approve_task_plans:    false,
    };
    try {
      const res = await fetch(`/api/portal/${token}/org-approval-settings${qs}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
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
      {!hideHeader && (
        <SectionHeader
          as="h2"
          title="Aprobación entre empleados"
          tooltip="Aplica solo cuando un empleado le pide a otro hacer algo (por ejemplo Sofía le pide a Noah que envíe un correo). El nivel de autonomía de arriba controla las acciones que cada empleado hace por su cuenta."
          className="mb-4"
        />
      )}

      {!settings && (
        <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Cargando…</p>
      )}

      {settings && (
        <div className="space-y-3">
          {/* Card de default siempre visible — comunica qué hace el modo inteligente */}
          <div
            className="p-4 rounded-lg"
            style={{ background: `${roleColor}08`, border: `1px solid ${roleColor}22` }}
          >
            <div className="flex items-start gap-3">
              <Sparkles size={18} className="mt-0.5 flex-shrink-0" style={{ color: roleColor }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                  Modo inteligente
                </p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                  Tus empleados ejecutan las delegaciones solos. Solo te piden aprobación cuando la tarea toca dinero (pagos, transferencias, reembolsos), contratos, o envíos masivos a clientes.
                </p>
              </div>
            </div>
          </div>

          {/* Toggle opcional — máximo control */}
          <label
            className="flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-colors"
            style={{
              background: alwaysOn ? `${roleColor}10` : 'var(--c-surface)',
              border:     `1px solid ${alwaysOn ? roleColor : 'var(--c-border)'}`,
              opacity:    saving ? 0.6 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={alwaysOn}
              disabled={saving}
              onChange={e => toggleAlways(e.target.checked)}
              className="mt-1 flex-shrink-0 h-4 w-4 rounded"
              style={{ accentColor: roleColor }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <ShieldCheck size={14} style={{ color: alwaysOn ? roleColor : 'var(--c-text-3)' }} />
                <span className="text-sm font-semibold" style={{ color: alwaysOn ? roleColor : 'var(--c-text)' }}>
                  Aprobar CADA delegación por correo
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                Al activarlo, cualquier tarea que un empleado le pida a otro esperará tu OK por correo antes de ejecutarse. Úsalo si prefieres validar todo manualmente.
              </p>
            </div>
          </label>
        </div>
      )}

      {msg && (
        <p className="text-xs mt-2" style={{ color: 'var(--c-text-2)' }}>{msg}</p>
      )}
    </section>
  );
}
