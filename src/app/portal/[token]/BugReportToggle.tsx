'use client';

import { useState } from 'react';
import { Bug, Check } from 'lucide-react';

interface Props {
  token: string;
  initial: boolean;
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: on ? '#6C3BFF' : 'var(--c-surface-2)',
        outline: on ? '2px solid rgba(108,59,255,0.3)' : '1px solid var(--c-border)',
        outlineOffset: 0, position: 'relative',
        transition: 'background 0.2s, outline 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

export default function BugReportToggle({ token, initial }: Props) {
  const [enabled, setEnabled] = useState(initial);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  async function update(value: boolean) {
    setSaving(true);
    setSaved(false);
    setEnabled(value);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_bug_reports: value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '12px 14px', borderRadius: 12,
      background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bug size={15} color="#ef4444" />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', margin: 0, lineHeight: 1.3 }}>
            Reportes de fallas a Centinelia
            {saved && (
              <span style={{ marginLeft: 8, fontSize: 11, color: '#22c55e', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Check size={11} /> Guardado
              </span>
            )}
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-text-3)', margin: '2px 0 0', lineHeight: 1.4 }}>
            Permite que los usuarios del portal reporten fallas directamente a nuestro equipo. No consume tareas ni minutos.
          </p>
        </div>
      </div>
      <Toggle on={enabled} onChange={update} disabled={saving} />
    </div>
  );
}
