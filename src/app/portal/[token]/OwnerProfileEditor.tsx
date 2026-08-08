'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

interface Props {
  token:        string;
  initialValue: string;
}

const PLACEHOLDER = `Ej:
Soy responsable de una clínica dental en Monterrey con 3 sucursales. Recibo alrededor de 80 llamadas al día.

MIS PRIORIDADES (en orden):
1. Pacientes con cita para hoy o mañana — siempre urgente
2. Prospectos nuevos — capturar datos completos antes de transferir
3. Proveedores — tomar mensaje y avisar al equipo

CÓMO ME GUSTA QUE SE HAGAN LAS COSAS:
- Reportes diarios en punto de las 8am por correo
- Si hay un problema con un paciente, avísame inmediatamente, no al final del día
- Nunca prometemos descuentos sin mi autorización

QUÉ SIGNIFICA URGENTE PARA MÍ:
Un paciente con dolor, una cancelación de último minuto o una queja directa.`;

export default function OwnerProfileEditor({ token, initialValue }: Props) {
  const [value,  setValue]  = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  async function handleBlur() {
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

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); }}
        onBlur={handleBlur}
        rows={10}
        placeholder={PLACEHOLDER}
        className="w-full rounded-lg text-[13px] leading-relaxed outline-none resize-y"
        style={{
          padding:    '12px 14px',
          background: '#ffffff',
          border:     '1px solid #E8E3F5',
          color:      '#1A0A3B',
          fontFamily: 'inherit',
          minHeight:  200,
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
          Se comparte con todos tus empleados. Se guarda automáticamente al salir del campo.
        </p>
        {saving && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#6B6480' }}>
            <Loader2 size={11} className="animate-spin" /> Guardando
          </span>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: '#22c55e' }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
