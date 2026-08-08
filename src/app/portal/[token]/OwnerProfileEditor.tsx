'use client';

import { useState } from 'react';
import { Check, Loader2, ListOrdered, Compass, Zap } from 'lucide-react';

interface Props {
  token:        string;
  initialValue: string;
}

const PLACEHOLDER = `Ej:
Soy responsable de una clínica dental en Monterrey con 3 sucursales. Recibo alrededor de 80 llamadas al día.

MIS PRIORIDADES (en orden):
1. Pacientes con cita para hoy o mañana, siempre urgente
2. Prospectos nuevos, capturar datos completos antes de transferir
3. Proveedores, tomar mensaje y avisar al equipo

CÓMO ME GUSTA QUE SE HAGAN LAS COSAS:
- Reportes diarios en punto de las 8am por correo
- Si hay un problema con un paciente, avísame inmediatamente, no al final del día
- Nunca prometemos descuentos sin mi autorización

QUÉ SIGNIFICA URGENTE PARA MÍ:
Un paciente con dolor, una cancelación de último minuto o una queja directa.`;

const PROMPTS = [
  { icon: ListOrdered, label: 'Tus prioridades', hint: 'Qué atender primero' },
  { icon: Compass,     label: 'Cómo trabajas',   hint: 'Reglas y preferencias' },
  { icon: Zap,         label: 'Qué es urgente',  hint: 'Cuándo interrumpirte' },
];

export default function OwnerProfileEditor({ token, initialValue }: Props) {
  const [value,  setValue]  = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [focused, setFocused] = useState(false);

  async function handleBlur() {
    setFocused(false);
    if (value === initialValue) return;
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ owner_profile: value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const chars = value.length;
  const lines = value.split('\n').filter(l => l.trim().length > 0).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Intro: por qué llenar esto + qué incluir */}
      <div>
        <p className="text-[13px]" style={{ color: '#6B6480' }}>
          Cuéntale a tus empleados quién eres, cuáles son tus prioridades y cómo te gusta que se hagan las cosas. Mientras más sepan de ti, mejor se adaptarán a tu estilo.
        </p>
      </div>

      {/* Chips de sugerencias — 3 categorías a incluir */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PROMPTS.map(p => {
          const Icon = p.icon;
          return (
            <div key={p.label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.1)' }}>
                <Icon size={13} style={{ color: '#6C3BFF' }} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-tight" style={{ color: '#1A0A3B' }}>{p.label}</p>
                <p className="text-[10px] leading-tight mt-0.5" style={{ color: '#9B8FB5' }}>{p.hint}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Textarea premium */}
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); }}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        rows={12}
        placeholder={PLACEHOLDER}
        className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-all"
        style={{
          padding:    '16px 18px',
          background: '#ffffff',
          border:     `1px solid ${focused ? '#6C3BFF' : '#E8E3F5'}`,
          boxShadow:  focused ? '0 0 0 3px rgba(108,59,255,0.08)' : 'none',
          color:      '#1A0A3B',
          fontFamily: 'inherit',
          minHeight:  260,
        }}
      />

      {/* Footer: counters + save state */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[11px] tabular-nums" style={{ color: '#9B8FB5' }}>
            <strong style={{ color: '#6B6480' }}>{lines}</strong> {lines === 1 ? 'línea' : 'líneas'}
            {' · '}
            <strong style={{ color: '#6B6480' }}>{chars.toLocaleString('es-MX')}</strong> caracteres
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: '#9B8FB5' }}>
            Se comparte con todos tus empleados. Se guarda al salir del campo.
          </span>
          {saving && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              <Loader2 size={11} className="animate-spin" /> Guardando
            </span>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
              <Check size={11} strokeWidth={2.5} /> Guardado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
