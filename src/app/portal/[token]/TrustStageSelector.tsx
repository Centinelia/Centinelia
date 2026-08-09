'use client';

import { useState } from 'react';
import { Check, Eye, Bell, Zap } from 'lucide-react';

interface Props {
  token:      string;
  initStage:  number;
}

// Autónomo es el default y la norma — así es como funciona un empleado
// real. Observador y Supervisado son escalones de control cuando el
// usuario quiere freno mano deliberado. NUNCA reordenar sin actualizar
// la copy correspondiente. Ver [[feedback-empleados-inteligentes]].
const STAGES = [
  {
    value:       3,
    icon:        Zap,
    name:        'Autónomo',
    short:       'Trabaja como un empleado real',
    desc:        'Ejecuta sus responsabilidades sin pedirte permiso paso por paso. Una capa de seguridad revisa cada correo y solo te consulta cuando el caso lo amerita (queja legal, compromiso alto stakes, datos sensibles). Si algo sale mal, tú reportas mal envío y aprende al instante.',
    recommended: true,
  },
  {
    value:       2,
    icon:        Bell,
    name:        'Supervisado',
    short:       'Redacta pero espera tu aprobación',
    desc:        'Redacta el borrador de cada correo, pero nunca envía sin tu OK. Útil las primeras 2 semanas con un empleado nuevo si prefieres validar su tono manualmente antes de dejarlo volar.',
    recommended: false,
  },
  {
    value:       1,
    icon:        Eye,
    name:        'Observador',
    short:       'Solo mira, no actúa',
    desc:        'Solo clasifica y resume lo que entra. No redacta ni envía nada — tú escribes cada respuesta desde cero. Reserva este modo para pruebas o cuentas en pausa.',
    recommended: false,
  },
];

export default function TrustStageSelector({ token, initStage }: Props) {
  const [stage,  setStage]  = useState(initStage);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  async function select(v: number) {
    if (v === stage) return;
    setStage(v);
    setSaved(false);
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ trust_stage: v }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
        Por defecto tu empleado trabaja como uno real: decide y actúa dentro de sus límites. Baja el nivel solo si prefieres validar cada paso manualmente.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STAGES.map(s => {
          const Icon      = s.icon;
          const active    = stage === s.value;
          const accentRGB = '108, 59, 255';
          return (
            <button
              key={s.value}
              onClick={() => select(s.value)}
              className="relative flex flex-col gap-2 rounded-xl p-4 text-left transition-all"
              style={{
                background: active ? `rgba(${accentRGB}, 0.08)` : '#FAFAFB',
                border:     active ? `1.5px solid rgba(${accentRGB}, 0.5)` : '1.5px solid #E8E3F5',
                cursor:     'pointer',
              }}
            >
              {s.recommended && (
                <span
                  className="absolute -top-2 left-3 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: '#6C3BFF', color: '#ffffff', letterSpacing: '0.05em' }}
                >
                  Recomendado
                </span>
              )}
              <div className="flex items-center justify-between">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: active ? `rgba(${accentRGB}, 0.15)` : '#ffffff',
                    border:     `1px solid ${active ? `rgba(${accentRGB}, 0.3)` : '#E8E3F5'}`,
                  }}
                >
                  <Icon size={13} style={{ color: active ? '#6C3BFF' : '#6B6480' }} />
                </div>
                {active && (
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: '#6C3BFF' }}
                  >
                    <Check size={9} color="white" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: active ? '#6C3BFF' : '#1A0A3B' }}>
                  {s.name}
                </p>
                <p className="text-[10px] mt-0.5 font-medium" style={{ color: active ? 'rgba(108,59,255,0.7)' : '#6B6480' }}>
                  {s.short}
                </p>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: '#9B8FB5' }}>
                {s.desc}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end h-4">
        {saving && <span className="text-[11px]" style={{ color: '#6B6480' }}>Guardando…</span>}
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
