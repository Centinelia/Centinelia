'use client';

/**
 * ClientEmailEditor — correo del dueño donde llegan escalaciones y avisos
 * de este empleado. Cuando el empleado necesita confirmación (Nala facturista
 * escalando una notita, Nia derivando una queja), sale desde el SMTP del
 * empleado hacia este correo. Vive en `voice_agents.client_email`.
 *
 * Dry run FASE 4 (2026-09-07): antes solo se seteaba en el registro; sin UI
 * para editarlo el dueño no podía cambiarlo → escalations caían a portal_email
 * (correo interno de Centinelia inservible para Beatriz).
 */
import { useState } from 'react';
import { Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  token:      string;
  agentId:    string;
  initEmail:  string | null;
  agentName?: string;
}

export default function ClientEmailEditor({ token, agentId, initEmail, agentName }: Props) {
  const [value, setValue]     = useState(initEmail ?? '');
  const [saving, setSaving]   = useState(false);
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const changed = value.trim() !== (initEmail ?? '').trim();

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agentId, client_email: value.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setFeedback('ok');
    } catch (e) {
      setError((e as Error).message);
      setFeedback('err');
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: 'var(--c-text-4)' }}>
          Correo para avisos y escalaciones
        </span>
        <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>
          Aquí llegan las alertas cuando {agentName ?? 'este empleado'} necesita tu confirmación o hay algo urgente que revisar. Puede ser tu correo personal o un correo de operaciones. {agentName === 'Nala' && (
            <>Además, cada escalación crea una card en <strong>Facturas → Pendientes</strong> con la foto y campos editables.</>
          )}
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            value={value}
            onChange={e => { setValue(e.target.value); setFeedback(null); }}
            placeholder="tucorreo@empresa.com"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--c-input-bg, #fff)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
          <button
            onClick={save}
            disabled={!valid || !changed || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            {saving
              ? <Loader2 size={14} className="animate-spin" />
              : <Mail size={14} />}
            Guardar
          </button>
        </div>
      </label>

      {feedback === 'ok' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#15803d' }}>
          <CheckCircle2 size={12} />
          Correo guardado. Las próximas escalaciones llegan aquí.
        </div>
      )}
      {feedback === 'err' && error && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#b91c1c' }}>
          <AlertCircle size={12} />
          {error}
        </div>
      )}
    </div>
  );
}
