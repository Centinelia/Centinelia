'use client';

import { useState } from 'react';
import { Check, Zap, ShieldCheck, Eye } from 'lucide-react';
import ApprovalSettingsSection from './ApprovalSettingsSection';
import InstantProcessingSection from './InstantProcessingSection';

/**
 * Consolida en una sola card las 3 opciones que antes vivían separadas en
 * el tab Autonomía y le sonaban repetitivas al cliente ("cuántas versiones
 * de Autónomo tiene esto?"): trust_stage per-empleado, aprobación entre
 * empleados (org), ritmo de trabajo (org).
 *
 * Regla de scope: el modo principal solo cambia `trust_stage` (per-empleado).
 * Los toggles org-level viven detrás de "Avanzado" con etiqueta explícita
 * de que aplican a toda la cuenta.
 */
interface Props {
  token:     string;
  agentId:   string;
  agentName: string;
  initStage: number;
  roleColor: string;
  isOwner:   boolean;
}

const ACCENT = '108, 59, 255';

export default function AutonomySection({ token, agentId, agentName, initStage, roleColor, isOwner }: Props) {
  const [stage,  setStage]  = useState(initStage);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  async function setTrustStage(v: number) {
    if (v === stage) return;
    setStage(v);
    setSaved(false);
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId, trust_stage: v }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  // 3 = Autónomo (default), 2 = Máximo control (Supervisado), 1 = Observador (pruebas).
  const isAutonomo = stage === 3;
  const isControl  = stage === 2;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
        Elige cómo trabaja este empleado. Por default actúa como uno real; sube el control solo si prefieres validar cada paso.
      </p>

      <button
        type="button"
        disabled={saving}
        onClick={() => setTrustStage(3)}
        className="relative flex items-start gap-3 rounded-xl p-4 text-left transition-all"
        style={{
          background: isAutonomo ? `rgba(${ACCENT}, 0.08)` : '#FAFAFB',
          border:     isAutonomo ? `1.5px solid rgba(${ACCENT}, 0.5)` : '1.5px solid #E8E3F5',
          cursor:     saving ? 'wait' : 'pointer',
        }}
      >
        <span
          className="absolute -top-2 left-3 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
          style={{ background: '#6C3BFF', color: '#ffffff', letterSpacing: '0.05em' }}
        >
          Recomendado
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            background: isAutonomo ? `rgba(${ACCENT}, 0.15)` : '#ffffff',
            border:     `1px solid ${isAutonomo ? `rgba(${ACCENT}, 0.3)` : '#E8E3F5'}`,
          }}
        >
          <Zap size={14} style={{ color: isAutonomo ? '#6C3BFF' : '#6B6480' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: isAutonomo ? '#6C3BFF' : '#1A0A3B' }}>
            Autónomo
          </p>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: '#6B6480' }}>
            Ejecuta sus responsabilidades solo. Escala contigo solo cuando toca dinero, contratos o casos delicados.
          </p>
        </div>
        {isAutonomo && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: '#6C3BFF' }}
          >
            <Check size={11} color="white" />
          </div>
        )}
      </button>

      <button
        type="button"
        disabled={saving}
        onClick={() => setTrustStage(2)}
        className="flex items-start gap-3 rounded-xl p-4 text-left transition-all"
        style={{
          background: isControl ? `rgba(${ACCENT}, 0.08)` : '#FAFAFB',
          border:     isControl ? `1.5px solid rgba(${ACCENT}, 0.5)` : '1.5px solid #E8E3F5',
          cursor:     saving ? 'wait' : 'pointer',
        }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            background: isControl ? `rgba(${ACCENT}, 0.15)` : '#ffffff',
            border:     `1px solid ${isControl ? `rgba(${ACCENT}, 0.3)` : '#E8E3F5'}`,
          }}
        >
          <ShieldCheck size={14} style={{ color: isControl ? '#6C3BFF' : '#6B6480' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: isControl ? '#6C3BFF' : '#1A0A3B' }}>
            Máximo control
          </p>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: '#6B6480' }}>
            Redacta borradores y espera tu OK por correo antes de enviar. Útil las primeras semanas con un empleado nuevo si quieres validar su tono.
          </p>
        </div>
        {isControl && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: '#6C3BFF' }}
          >
            <Check size={11} color="white" />
          </div>
        )}
      </button>

      <div className="flex items-center justify-end h-4">
        {saving && <span className="text-[11px]" style={{ color: '#6B6480' }}>Guardando…</span>}
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>

      <details className="rounded-lg group mt-1" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
        <summary
          className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none"
          style={{ userSelect: 'none' }}
        >
          <span className="text-xs font-semibold flex-1" style={{ color: '#1A0A3B' }}>
            Avanzado
          </span>
          <span className="text-[10px] transition-transform group-open:rotate-180" style={{ color: '#6B6480' }}>▾</span>
        </summary>
        <div className="px-4 pb-4 flex flex-col gap-4">

          {/* Observador — solo pruebas */}
          <button
            type="button"
            disabled={saving}
            onClick={() => setTrustStage(1)}
            className="flex items-start gap-3 rounded-xl p-3 text-left transition-all"
            style={{
              background: stage === 1 ? `rgba(${ACCENT}, 0.08)` : '#ffffff',
              border:     stage === 1 ? `1.5px solid rgba(${ACCENT}, 0.5)` : '1.5px solid #E8E3F5',
              cursor:     saving ? 'wait' : 'pointer',
            }}
          >
            <Eye size={13} className="mt-0.5" style={{ color: stage === 1 ? '#6C3BFF' : '#6B6480' }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold" style={{ color: stage === 1 ? '#6C3BFF' : '#1A0A3B' }}>
                Observador (solo para pruebas)
              </p>
              <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>
                Solo clasifica y resume lo que entra. No redacta ni envía nada. Reserva este modo para pruebas o cuentas en pausa.
              </p>
            </div>
            {stage === 1 && (
              <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#6C3BFF' }}>
                <Check size={9} color="white" />
              </div>
            )}
          </button>

          {/* Sub-secciones per-empleado — solo owners */}
          {isOwner && (
            <div className="flex flex-col gap-3 pt-2" style={{ borderTop: '1px dashed #E8E3F5' }}>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#1A0A3B' }}>
                  Aprobación cuando {agentName || 'este empleado'} delega
                </p>
                <p className="text-[11px] mb-2" style={{ color: '#6B6480' }}>
                  Cuando {agentName || 'este empleado'} le pide a otro empleado hacer algo.
                </p>
                <ApprovalSettingsSection token={token} agentId={agentId} roleColor={roleColor} hideHeader />
              </div>

              <div className="pt-3" style={{ borderTop: '1px dashed #E8E3F5' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#1A0A3B' }}>
                  Ritmo de trabajo de {agentName || 'este empleado'}
                </p>
                <p className="text-[11px] mb-2" style={{ color: '#6B6480' }}>
                  Velocidad con la que {agentName || 'este empleado'} procesa sus llamadas salientes programadas y trabajos automáticos.
                </p>
                <InstantProcessingSection token={token} agentId={agentId} roleColor={roleColor} hideHeader />
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
