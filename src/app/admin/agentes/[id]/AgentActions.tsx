'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Pause, Check, AlertTriangle, X } from 'lucide-react';
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
      toast.success(active ? 'Empleado pausado' : 'Empleado activado');
      setTimeout(() => { setDone(false); router.refresh(); }, 1200);
    } else {
      toast.error('Error al actualizar el empleado');
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-[12px] px-2 py-1.5 rounded-lg font-medium"
          style={{
            color:      active ? '#B91C1C' : '#047857',
            background: active ? '#FEF2F2' : '#ECFDF5',
            border:     `1px solid ${active ? '#FECACA' : '#A7F3D0'}`,
          }}
        >
          <AlertTriangle size={11} />
          {active ? '¿Pausar?' : '¿Activar?'}
        </span>
        <button
          onClick={toggle}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-medium shrink-0"
          style={{
            background: active ? '#EF4444' : '#10B981',
            color:      '#FFFFFF',
            opacity:    loading ? 0.6 : 1,
          }}
        >
          <Check size={12} /> Sí
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="p-1.5 rounded-lg shrink-0 transition-colors hover:bg-gray-100"
          style={{ color: '#6B7280' }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const label = done ? 'Actualizado' : active ? 'Pausar' : 'Activar';
  const Icon  = done ? Check : active ? Pause : Play;

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={loading || done}
      title={label}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all shrink-0"
      style={{
        background: done ? '#ECFDF5' : active ? '#FEF2F2' : '#ECFDF5',
        color:      done ? '#047857' : active ? '#B91C1C' : '#047857',
        border:     `1px solid ${done ? '#A7F3D0' : active ? '#FECACA' : '#A7F3D0'}`,
        opacity:    loading ? 0.5 : 1,
      }}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
