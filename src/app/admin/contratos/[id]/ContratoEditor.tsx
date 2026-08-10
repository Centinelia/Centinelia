'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Save, Check, CheckCircle, Clock } from 'lucide-react';

interface Agent {
  id: string;
  business_name: string;
  client_name: string;
  portal_token: string | null;
  org_token: string | null;
  contract_text: string | null;
  contract_accepted_at: string | null;
}

export default function ContratoEditor({ agent }: { agent: Agent }) {
  const [text, setText]     = useState(agent.contract_text ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const signed     = !!agent.contract_accepted_at;
  const signedDate = agent.contract_accepted_at
    ? new Date(agent.contract_accepted_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/admin/agentes/${agent.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contract_text: text.trim() || null }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/contratos"
          className="p-2 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors"
          style={{ color: 'var(--c-text-2)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Contrato</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-2)' }}>
            {agent.business_name} · {agent.client_name}
          </p>
        </div>
        {signed ? (
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle size={12} />
            Firmado {signedDate}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.2)' }}>
            <Clock size={12} />
            Pendiente de firma
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">

        {/* Info box */}
        <div className="p-3 rounded-lg text-xs"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: 'var(--c-text-2)' }}>
          <span style={{ color: '#9B6DFF', fontWeight: 600 }}>Template automático activo.</span>
          {' '}Si dejas este campo vacío el contrato se genera automáticamente. Solo escribe aquí si necesitas personalizar para este cliente.
        </div>

        {/* Textarea */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>
            Texto personalizado <span style={{ color: 'var(--c-text-4)' }}>(opcional)</span>
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={20}
            placeholder={'Escribe el contrato personalizado aquí...\n\nSi lo dejas vacío se usa el template automático de Centinelia.'}
            className="w-full rounded-xl p-3 text-sm resize-y outline-none"
            style={{
              background:  'var(--c-input-bg)',
              border:      '1px solid var(--c-input-border)',
              color:       'var(--c-text)',
              fontFamily:  'inherit',
              lineHeight:  1.6,
            }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-4)' }}>
            {text.length} caracteres
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              background: saved ? 'rgba(34,197,94,0.15)' : '#6C3BFF',
              color:      saved ? '#22c55e'               : '#FAFBFF',
              border:     saved ? '1px solid rgba(34,197,94,0.3)' : 'none',
            }}
          >
            {saved
              ? <><Check size={14} /> Guardado</>
              : <><Save size={14} /> {saving ? 'Guardando…' : 'Guardar contrato'}</>
            }
          </button>

          {(agent.org_token || agent.portal_token) && (
            <a
              href={`/portal/${agent.org_token ?? agent.portal_token}/contrato`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
            >
              <ExternalLink size={13} /> Ver contrato
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
