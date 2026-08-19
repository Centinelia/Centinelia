'use client';

import { useState } from 'react';
import { Lock, Eye, EyeOff, Check, Loader2, AlertTriangle } from 'lucide-react';

export default function ChangePasswordCard({ token }: { token: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurr, setShowCurr] = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) { setMsg({ ok: false, text: 'La contraseña nueva debe tener al menos 8 caracteres.' }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: 'La confirmación no coincide con la contraseña nueva.' }); return; }
    if (next === current) { setMsg({ ok: false, text: 'La contraseña nueva debe ser distinta de la actual.' }); return; }

    setBusy(true);
    try {
      const res = await fetch(`/api/portal/${token}/change-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ current_password: current, new_password: next }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: j.error ?? 'No se pudo actualizar.' }); setBusy(false); return; }
      setMsg({ ok: true, text: 'Contraseña actualizada. La próxima vez que inicies sesión, usa la nueva.' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch {
      setMsg({ ok: false, text: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #F0EDF9' }}>
        <Lock size={14} style={{ color: '#6C3BFF' }} />
        <div>
          <h2 className="text-sm font-bold" style={{ color: '#1A0A3B' }}>Contraseña de la cuenta</h2>
          <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
            Cámbiala cuando quieras. Necesitas tu contraseña actual para confirmar.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="p-5 flex flex-col gap-4">
        {/* Actual */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: '#1A0A3B' }}>Contraseña actual</label>
          <div className="relative">
            <input
              type={showCurr ? 'text' : 'password'}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 pr-10 rounded-lg text-sm"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            />
            <button
              type="button" onClick={() => setShowCurr(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6480' }}
            >
              {showCurr ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Nueva */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: '#1A0A3B' }}>Contraseña nueva</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={next}
              onChange={e => setNext(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="w-full px-3 py-2 pr-10 rounded-lg text-sm"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            />
            <button
              type="button" onClick={() => setShowNew(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6480' }}
            >
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Confirmar */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: '#1A0A3B' }}>Confirma la nueva</label>
          <input
            type={showNew ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
          />
        </div>

        {msg && (
          <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
            style={{
              background: msg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border:     msg.ok ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.22)',
              color:      msg.ok ? '#15803d' : '#b91c1c',
            }}>
            {msg.ok ? <Check size={13} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || !current || !next || !confirm}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            {busy ? <><Loader2 size={13} className="animate-spin" /> Actualizando</> : 'Actualizar contraseña'}
          </button>
        </div>
      </form>
    </div>
  );
}
