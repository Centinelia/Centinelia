'use client';

import { useState } from 'react';
import { Check, Mail } from 'lucide-react';

interface Props {
  token:        string;
  initWhatsApp: boolean;
  initEmail:    boolean;
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width:           44,
        height:          24,
        borderRadius:    12,
        border:          'none',
        cursor:          disabled ? 'default' : 'pointer',
        background:      on ? '#6C3BFF' : 'var(--c-surface-2)',
        outline:         on ? '2px solid rgba(108,59,255,0.3)' : '1px solid var(--c-border)',
        outlineOffset:   0,
        position:        'relative',
        transition:      'background 0.2s, outline 0.2s',
        flexShrink:      0,
      }}
    >
      <span style={{
        position:   'absolute',
        top:        3,
        left:       on ? 23 : 3,
        width:      18,
        height:     18,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.18s',
        boxShadow:  '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

export default function NotificationsToggle({ token, initWhatsApp: _initWhatsApp, initEmail }: Props) {
  // WhatsApp está oculto en UI (2026-08-06). El backend sigue leyendo
  // notify_whatsapp; cuando volvamos a exponerlo, re-agregar la row abajo.
  const [email,  setEmail]  = useState(initEmail);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved,  setSaved]  = useState<string | null>(null);

  async function update(field: 'notify_whatsapp' | 'notify_email', value: boolean) {
    setSaving(field);
    setSaved(null);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [field]: value }),
      });
      setSaved(field);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  const rows: {
    field: 'notify_whatsapp' | 'notify_email';
    icon:  React.ReactNode;
    label: string;
    desc:  string;
    value: boolean;
    set:   (v: boolean) => void;
  }[] = [
    {
      field: 'notify_email',
      icon:  <Mail size={15} color="#6C3BFF" />,
      label: 'Resumen diario por email',
      desc:  'Al cierre del día recibes un email con todo lo que hicieron tus empleados: llamadas, correos respondidos, tareas de oficina, delegaciones, documentos, encuestas y más. Los eventos urgentes (nuevos leads, transferencias) te llegan al momento.',
      value: email,
      set:   (v) => { setEmail(v); update('notify_email', v); },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(r => (
        <div
          key={r.field}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            16,
            padding:        '12px 14px',
            borderRadius:   12,
            background:     'var(--c-surface-2)',
            border:         '1px solid var(--c-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width:          32,
              height:         32,
              borderRadius:   8,
              background:     'var(--c-surface)',
              border:         '1px solid var(--c-border)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}>
              {r.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', margin: 0, lineHeight: 1.3 }}>
                {r.label}
                {saved === r.field && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#22c55e', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={11} /> Guardado</span>
                )}
              </p>
              <p style={{ fontSize: 12, color: 'var(--c-text-3)', margin: '2px 0 0', lineHeight: 1.4 }}>
                {r.desc}
              </p>
            </div>
          </div>
          <Toggle on={r.value} onChange={r.set} disabled={saving === r.field} />
        </div>
      ))}
    </div>
  );
}
