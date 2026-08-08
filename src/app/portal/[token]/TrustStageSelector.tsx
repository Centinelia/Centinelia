'use client';

import { useState } from 'react';
import { Check, Eye, Bell, Zap } from 'lucide-react';

interface Props {
  token:      string;
  initStage:  number;
}

const STAGES = [
  {
    value: 1,
    icon:  Eye,
    name:  'Observador',
    short: 'Solo informa, no actúa',
    desc:  'Tu empleado responde preguntas y recopila información, pero no ejecuta ninguna acción. Tú o tu equipo toman todas las decisiones. En correos: solo clasifica y resume, no redacta respuestas — tú escribes desde cero.',
  },
  {
    value: 2,
    icon:  Bell,
    name:  'Supervisado',
    short: 'Actúa y te avisa de cada paso',
    desc:  'Tu empleado ejecuta sus responsabilidades, pero te notifica inmediatamente por cada acción que toma. En correos: redacta el borrador y siempre espera tu aprobación antes de enviar.',
  },
  {
    value: 3,
    icon:  Zap,
    name:  'Autónomo',
    short: 'Actúa con criterio propio',
    desc:  'Tu empleado trabaja de forma independiente dentro de sus límites de autoridad. Solo te avisa cuando algo requiere tu atención. En correos: una capa de seguridad revisa cada borrador y escala solo los que involucran compromisos, quejas graves o datos delicados.',
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
        Cuánta independencia tiene en las acciones que ejecuta por su cuenta (llamadas, correos, captura de leads). A medida que confías en su desempeño, súbelo de Supervisado a Autónomo.
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
              className="flex flex-col gap-2 rounded-xl p-4 text-left transition-all"
              style={{
                background: active ? `rgba(${accentRGB}, 0.08)` : '#FAFAFB',
                border:     active ? `1.5px solid rgba(${accentRGB}, 0.5)` : '1.5px solid #E8E3F5',
                cursor:     'pointer',
              }}
            >
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
