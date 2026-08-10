'use client';

import { useState } from 'react';
import { PhoneForwarded } from 'lucide-react';

interface Props {
  token:                         string;
  initialValue:                  string | null;
  suggestedFromTransferWhatsapp: string | null;
  apiPath:                       string; // e.g. `/api/portal/${token}/org`
}

const E164_RE = /^\+[1-9]\d{7,14}$/;

export default function FallbackNumberSection({
  token: _token,
  initialValue,
  suggestedFromTransferWhatsapp,
  apiPath,
}: Props) {
  const [value,  setValue]  = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);

  const isValid  = value === '' || E164_RE.test(value);
  const suggestion =
    suggestedFromTransferWhatsapp && !initialValue
      ? suggestedFromTransferWhatsapp
      : null;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(apiPath, {
      method:  'PATCH',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ fallback_phone_number: value || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError((json as { error?: string }).error ?? 'No se pudo guardar. Verifica el formato.');
      return;
    }
    setSaved(true);
  }

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-xl"
      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
    >
      <div className="flex items-center gap-2" style={{ color: '#1A0A3B' }}>
        <PhoneForwarded size={18} />
        <h3 className="font-semibold">Numero de respaldo</h3>
      </div>
      <p className="text-sm" style={{ color: '#4A3B6B' }}>
        Cuando se agoten tus minutos del ciclo, las llamadas entrantes se transferiran a este numero personal en lugar de colgarse. Se te avisara por WhatsApp cuando esto ocurra.
      </p>
      <input
        type="tel"
        placeholder="+528112345678"
        value={value}
        onChange={e => {
          setValue(e.target.value.trim());
          setSaved(false);
        }}
        className="px-3 py-2 rounded-lg border text-sm font-mono"
        style={{ borderColor: isValid ? '#E8E3F5' : '#DC2626' }}
      />
      {!isValid && (
        <p className="text-xs" style={{ color: '#DC2626' }}>
          Formato invalido. Usa E.164, por ejemplo +528112345678.
        </p>
      )}
      {suggestion && (
        <button
          type="button"
          onClick={() => setValue(suggestion)}
          className="text-xs text-left underline"
          style={{ color: '#6C3BFF' }}
        >
          Usar {suggestion} (tu WhatsApp de escalacion)
        </button>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!isValid || saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{
            background: '#6C3BFF',
            opacity:    !isValid || saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        {saved && (
          <span className="text-xs" style={{ color: '#10B981' }}>
            Guardado.
          </span>
        )}
        {error && (
          <span className="text-xs" style={{ color: '#DC2626' }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
