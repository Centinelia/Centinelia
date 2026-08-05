'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2, X, Eye, EyeOff, Loader2 } from 'lucide-react';

interface Props {
  agentId:     string;
  displayName: string;
}

export default function DangerZone({ agentId, displayName }: Props) {
  const router = useRouter();
  const [step,      setStep]      = useState<'idle' | 'confirm'>('idle');
  const [password,  setPassword]  = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [nameCheck, setNameCheck] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/agentes/${agentId}`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push('/admin/clientes');
      router.refresh();
      return;
    }
    const { error: err } = await res.json().catch(() => ({ error: 'Error al eliminar' }));
    setError(err ?? 'Error al eliminar');
  };

  const canDelete = password.length > 0
    && nameCheck.trim().toLowerCase() === displayName.trim().toLowerCase();

  return (
    <div
      className="rounded-xl bg-white overflow-hidden"
      style={{ border: '1px solid #FECACA', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #FEE2E2', background: '#FEF2F2' }}>
        <h2 className="text-[11px] uppercase tracking-wider font-medium flex items-center gap-1.5" style={{ color: '#B91C1C' }}>
          <AlertTriangle size={13} />
          Zona peligrosa
        </h2>
        <p className="text-[12px] mt-1" style={{ color: '#7F1D1D' }}>
          Eliminación definitiva del empleado. No se puede deshacer.
        </p>
      </div>

      <div className="px-5 py-4">
        {step === 'idle' ? (
          <button
            type="button"
            onClick={() => setStep('confirm')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-red-50"
            style={{ background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA' }}
          >
            <Trash2 size={13} />
            Eliminar este empleado
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-lg px-3 py-2.5 flex items-start gap-2"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
            >
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#B91C1C' }} />
              <div className="text-[12px]" style={{ color: '#7F1D1D' }}>
                Vas a eliminar <strong>{displayName}</strong> permanentemente. Sus llamadas,
                leads, citas y tareas se pierden. El número Vapi y los créditos se quedan
                en la cuenta del cliente.
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
                Escribe el nombre exacto del empleado para confirmar
              </label>
              <input
                type="text"
                value={nameCheck}
                onChange={e => setNameCheck(e.target.value)}
                placeholder={displayName}
                className="w-full text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[#EF4444]"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
                Contraseña de administrador
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Contraseña que solo el encargado sabe"
                  className="w-full text-[13px] px-3 py-2 pr-9 rounded-lg outline-none focus:border-[#EF4444]"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: '#9CA3AF' }}
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[12px]" style={{ color: '#B91C1C' }}>{error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity"
                style={{
                  background: '#EF4444',
                  color:      '#FFFFFF',
                  opacity:    canDelete && !loading ? 1 : 0.4,
                  cursor:     canDelete && !loading ? 'pointer' : 'not-allowed',
                }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {loading ? 'Eliminando' : 'Eliminar permanentemente'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('idle'); setPassword(''); setNameCheck(''); setError(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
                style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
              >
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
