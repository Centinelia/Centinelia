'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Power, Check, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';

export default function AgentActions({ agentId, active }: { agentId: string; active: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);

  const toggle = async () => {
    setConfirming(false);
    setLoading(true);
    const res = await fetch(`/api/admin/agentes/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
      toast.success(active ? 'Agente desactivado' : 'Agente activado');
      setTimeout(() => { setDone(false); router.refresh(); }, 1200);
    } else {
      toast.error('Error al actualizar el agente');
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="hidden sm:flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg"
          style={{ color: active ? '#ef4444' : '#22c55e', background: active ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${active ? '#ef444430' : '#22c55e30'}` }}>
          <AlertTriangle size={11} />
          {active ? '¿Desactivar?' : '¿Activar?'}
        </span>
        <button
          onClick={toggle}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0"
          style={{ background: active ? '#ef4444' : '#22c55e', color: '#fff', opacity: loading ? 0.6 : 1 }}
        >
          <Check size={12} /> Sí
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="p-1.5 rounded-lg text-xs shrink-0 transition-colors hover:bg-[var(--c-surface-2)]"
          style={{ color: 'var(--c-text-3)' }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const label = done ? 'Actualizado' : active ? 'Desactivar' : 'Activar';

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={loading || done}
      title={label}
      className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-lg text-xs font-semibold transition-all shrink-0"
      style={{
        background: done ? 'rgba(34,197,94,0.12)' : active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
        color: done ? '#22c55e' : active ? '#ef4444' : '#22c55e',
        border: `1px solid ${done ? '#22c55e33' : active ? '#ef444433' : '#22c55e33'}`,
        opacity: loading ? 0.5 : 1,
      }}
    >
      {done ? <Check size={13} /> : <Power size={13} />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
