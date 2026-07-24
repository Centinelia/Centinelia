'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play } from 'lucide-react';

export default function PauseResumeButton({ agentId, clientPaused }: {
  agentId: string;
  clientPaused: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async () => {
    const action = clientPaused ? 'resume' : 'pause';
    const confirm_msg = clientPaused
      ? '¿Reanudar tu empleado? Volverá a atender llamadas de inmediato.'
      : '¿Pausar tu empleado? Dejará de atender llamadas hasta que lo reanudes.';
    if (!confirm(confirm_msg)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/portal/agents/${agentId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error' }));
        alert(error);
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
      style={clientPaused
        ? { background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }
        : { background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }
      }
    >
      {clientPaused
        ? <><Play size={12} /><span className="inline sm:hidden xl:inline">{loading ? 'Reanudando…' : 'Reanudar'}</span></>
        : <><Pause size={12} /><span className="inline sm:hidden xl:inline">{loading ? 'Pausando…' : 'Pausar'}</span></>
      }
    </button>
  );
}
