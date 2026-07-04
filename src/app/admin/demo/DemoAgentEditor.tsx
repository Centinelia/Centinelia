'use client';

import { useState } from 'react';
import { Check, Loader2, Phone, ExternalLink, RefreshCw, MessageCircle } from 'lucide-react';
import type { VoiceAgent } from '@/types/agent';
import { DEMO_INSTRUCTIONS } from '@/lib/demo/instructions';

function Field({ label, name, value, onChange, textarea, rows = 4, placeholder, hint }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  textarea?: boolean; rows?: number; placeholder?: string; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>{label}</label>
      {hint && <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{hint}</p>}
      {textarea ? (
        <textarea
          name={name}
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-y font-mono"
          style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)', lineHeight: 1.6 }}
        />
      ) : (
        <input
          name={name}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
        />
      )}
    </div>
  );
}

export default function DemoAgentEditor({ agent }: { agent: VoiceAgent }) {
  const [agentName,     setAgentName]     = useState(agent.agent_name ?? '');
  const [firstMessage,  setFirstMessage]  = useState(agent.first_message ?? '');
  const [description,   setDescription]   = useState(agent.business_description ?? '');
  const [knowledgeBase, setKnowledgeBase] = useState(agent.knowledge_base ?? '');
  const [waActive,      setWaActive]      = useState(!!agent.wa_phone_number);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [applying,  setApplying]  = useState(false);
  const [applied,   setApplied]   = useState(false);
  const [error,     setError]     = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    const res = await fetch(`/api/admin/agentes/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name:           agentName || null,
        first_message:        firstMessage || null,
        business_description: description,
        knowledge_base:       knowledgeBase,
        // keep everything else unchanged
        client_name:            agent.client_name,
        client_email:           (agent as any).client_email ?? null,
        business_name:          agent.business_name,
        business_address:       agent.business_address ?? null,
        business_phone_display: agent.business_phone_display,
        transfer_whatsapp:      agent.transfer_whatsapp ?? null,
        transfer_number:        agent.transfer_number ?? null,
        calendar_url:           agent.calendar_url ?? null,
        business_website:       (agent as any).business_website ?? null,
        timezone:               agent.timezone,
        phone_number:           agent.phone_number,
        wa_phone_number:        waActive ? (agent.phone_number ?? null) : null,
        elevenlabs_voice_id:    (agent as any).elevenlabs_voice_id ?? null,
        plan:                   agent.plan,
        features:               agent.features,
        business_hours:         agent.business_hours ?? null,
        minutes_included:       agent.minutes_included,
        contract_text:          (agent as any).contract_text ?? null,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    else {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error ?? `HTTP ${res.status}`;
      console.error('Demo save error:', msg);
      setError(`Error: ${msg}`);
    }
  };

  const handleApplyInstructions = async () => {
    setApplying(true);
    setApplied(false);
    setError('');
    const res = await fetch('/api/admin/demo/apply-instructions', { method: 'POST' });
    setApplying(false);
    if (res.ok) {
      setKnowledgeBase(DEMO_INSTRUCTIONS);
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    } else {
      setError('Error al aplicar instrucciones.');
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-2xl flex flex-col gap-8">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF' }}>
            Demo
          </span>
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
            <Phone size={11} /> {agent.phone_number}
          </span>
        </div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Agente demo</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          Configura cómo se comporta el agente durante presentaciones en vivo.
        </p>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-5 rounded-2xl p-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <Field
          label="Nombre del agente"
          name="agent_name"
          value={agentName}
          onChange={setAgentName}
          placeholder="Centinelia"
          hint="El nombre con el que se presenta antes de adoptar un papel."
        />
        <Field
          label="Primer mensaje"
          name="first_message"
          value={firstMessage}
          onChange={setFirstMessage}
          placeholder="Hola. Soy Centinelia y en este demo puedo simular cualquier tipo de negocio…"
          hint="Lo primero que dice el agente al contestar la llamada."
        />
        <Field
          label="Descripción de negocio (contexto por defecto)"
          name="business_description"
          value={description}
          onChange={setDescription}
          textarea
          rows={3}
          placeholder="Agente demo de Centinelia: adopta cualquier papel que se le indique."
        />
      </div>

      {/* WhatsApp */}
      <div className="rounded-2xl p-5 flex items-center justify-between gap-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: waActive ? 'rgba(37,211,102,0.12)' : 'var(--c-surface-2)' }}>
            <MessageCircle size={16} style={{ color: waActive ? '#25D366' : 'var(--c-text-3)' }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>WhatsApp</p>
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              {waActive ? `Activo en ${agent.phone_number}` : 'Usa el mismo número de voz para WhatsApp'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWaActive(v => !v)}
          className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors"
          style={{ background: waActive ? '#25D366' : 'var(--c-border)' }}>
          <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm"
            style={{ transform: waActive ? 'translateX(20px)' : 'translateX(0)' }} />
        </button>
      </div>

      {/* Knowledge base */}
      <div className="flex flex-col gap-3 rounded-2xl p-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Instrucciones de modo demo</h2>
          <button
            type="button"
            onClick={handleApplyInstructions}
            disabled={applying}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              background: applied ? 'rgba(34,197,94,0.1)' : 'rgba(108,59,255,0.1)',
              color:      applied ? '#22c55e' : '#9B6DFF',
              border:     `1px solid ${applied ? 'rgba(34,197,94,0.25)' : 'rgba(108,59,255,0.2)'}`,
            }}
          >
            {applying
              ? <Loader2 size={11} className="animate-spin" />
              : applied
                ? <Check size={11} />
                : <RefreshCw size={11} />}
            {applying ? 'Aplicando…' : applied ? 'Aplicado' : 'Restaurar instrucciones base'}
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Aquí va el contexto que le da al agente el comportamiento de demo: escucha a Nazre, adopta el papel que le indican, improvisa detalles del negocio.
        </p>
        <textarea
          value={knowledgeBase}
          onChange={e => setKnowledgeBase(e.target.value)}
          rows={18}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-y font-mono"
          style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)', lineHeight: 1.6 }}
          placeholder="Pega aquí las instrucciones de modo demo…"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
          style={{ background: saved ? '#22c55e' : '#6C3BFF', color: '#fff' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar cambios'}
        </button>
        <a
          href={`/admin/agentes/${agent.id}/editar`}
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--c-text-3)' }}
        >
          <ExternalLink size={12} /> Editar completo
        </a>
        {error && <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>}
      </div>
    </div>
  );
}
