'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

interface Props {
  token:             string;
  agentId?:          string;
  initGreeting:      string;
  initTransferRules: string;
}

export default function AgentCustomization({ token, agentId, initGreeting, initTransferRules }: Props) {
  const [greeting,      setGreeting]      = useState(initGreeting);
  const [transferRules, setTransferRules] = useState(initTransferRules);
  const [saved,         setSaved]         = useState<'greeting' | 'rules' | null>(null);
  const [saving,        setSaving]        = useState<'greeting' | 'rules' | null>(null);

  async function save(field: 'first_message' | 'transfer_rules', value: string, key: 'greeting' | 'rules') {
    setSaving(key);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...(agentId ? { agentId } : {}), [field]: value }),
      });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)', marginBottom: 6 }}>
          Saludo de bienvenida
        </label>
        <p style={{ fontSize: 12, color: 'var(--c-text-3)', margin: '0 0 10px' }}>
          Lo primero que dice tu empleado al contestar. Déjalo vacío para usar el saludo estándar.
        </p>
        <input
          type="text"
          value={greeting}
          onChange={e => setGreeting(e.target.value)}
          onBlur={() => save('first_message', greeting, 'greeting')}
          placeholder="Gracias por llamar a [negocio], ¿en qué le puedo ayudar?"
          style={{
            width:        '100%',
            padding:      '10px 12px',
            borderRadius: 10,
            background:   'var(--c-surface-2)',
            border:       '1px solid var(--c-border)',
            color:        'var(--c-text)',
            fontSize:     13,
            outline:      'none',
            boxSizing:    'border-box',
          }}
        />
        <SaveIndicator active={saved === 'greeting'} saving={saving === 'greeting'} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)', marginBottom: 6 }}>
          Reglas de transferencia
        </label>
        <p style={{ fontSize: 12, color: 'var(--c-text-3)', margin: '0 0 10px' }}>
          Instrucciones personalizadas sobre cuándo y cómo transferir a un humano.
        </p>
        <textarea
          value={transferRules}
          onChange={e => setTransferRules(e.target.value)}
          onBlur={() => save('transfer_rules', transferRules, 'rules')}
          rows={4}
          placeholder="Ej: Transfiere cuando el cliente mencione una queja o pida hablar con el gerente."
          style={{
            width:        '100%',
            padding:      '10px 12px',
            borderRadius: 10,
            background:   'var(--c-surface-2)',
            border:       '1px solid var(--c-border)',
            color:        'var(--c-text)',
            fontSize:     13,
            outline:      'none',
            resize:       'vertical',
            fontFamily:   'inherit',
            lineHeight:   1.6,
            boxSizing:    'border-box',
          }}
        />
        <SaveIndicator active={saved === 'rules'} saving={saving === 'rules'} />
      </div>
    </div>
  );
}

function SaveIndicator({ active, saving }: { active: boolean; saving: boolean | null }) {
  if (saving) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, color: 'var(--c-text-3)', marginTop: 6 }}>Guardando…</span>;
  }
  if (!active) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22c55e', marginTop: 6 }}>
      <Check size={11} /> Guardado
    </span>
  );
}
