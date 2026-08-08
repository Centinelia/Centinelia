'use client';

import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Save, Loader } from 'lucide-react';

export default function PassphraseEditor({
  token,
  initial,
}: {
  token:   string;
  initial: string;
}) {
  const [value,   setValue]   = useState(initial);
  const [visible, setVisible] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  async function save() {
    const phrase = value.trim();
    if (!phrase) { setError('Escribe una frase antes de guardar'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ owner_passphrase: phrase }),
      });
      if (!res.ok) { setError('No se pudo guardar'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: '#1A0A3B', lineHeight: 1.6 }}>
        Cuando llames desde cualquier teléfono y digas esta frase, el empleado sabrá que eres tú o alguien del equipo autorizado y podrá compartir información operativa interna.
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={e => { setValue(e.target.value); setSaved(false); }}
            placeholder='Ej. "Sol de verano", "Proyecto alfa", "Doce trece catorce"'
            className="w-full rounded-xl px-4 py-2.5 text-sm pr-10"
            style={{
              background:  '#FAFAFB',
              border:      '1px solid #E8E3F5',
              color:       '#1A0A3B',
              outline:     'none',
              fontFamily:  visible ? 'inherit' : 'monospace',
              letterSpacing: visible ? 'normal' : '0.15em',
            }}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
          />
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
            style={{ color: '#6B6480', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex-shrink-0"
          style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer' }}
        >
          {saving
            ? <Loader size={14} className="animate-spin" />
            : saved
              ? <ShieldCheck size={14} />
              : <Save size={14} />
          }
          {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
        </button>
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          {error}
        </p>
      )}

      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
        <ShieldCheck size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs" style={{ color: 'rgba(245,158,11,0.9)', lineHeight: 1.55 }}>
          Mantén esta frase confidencial. El empleado nunca la revelará a terceros, pero solo funciona si nadie más la conoce. Usa algo que recuerdes fácil pero que no sea obvio.
        </p>
      </div>
    </div>
  );
}
