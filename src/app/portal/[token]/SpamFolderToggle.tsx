'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CostStats {
  revisados: number;
  rescatados: number;
  ops_consumidas: number;
}

export default function SpamFolderToggle({
  token,
  agentId,
  initial,
  stats,
}: {
  token: string;
  agentId?: string;
  initial: boolean;
  stats: CostStats | null;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !enabled;
    setEnabled(next);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(agentId ? { agentId } : {}), check_spam_folder: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        next ? 'Revisará también la carpeta Spam' : 'Ya no revisará Spam'
      );
    } catch {
      setEnabled(!next);
      toast.error('No se pudo actualizar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: '#9B8FB5' }}
        >
          Revisar carpeta de Spam
        </p>
        <button
          onClick={toggle}
          disabled={saving}
          className="w-10 h-6 rounded-full transition-colors relative"
          style={{ background: enabled ? '#6C3BFF' : '#E8E3F5' }}
        >
          <div
            className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
            style={{ left: enabled ? '20px' : '4px' }}
          />
          {saving && (
            <Loader2
              size={10}
              className="animate-spin absolute inset-0 m-auto"
              style={{ color: '#fff' }}
            />
          )}
        </button>
      </div>
      <p
        className="text-xs mb-2"
        style={{ color: '#6B6480', lineHeight: 1.5 }}
      >
        Gmail/Outlook a veces marcan correos legítimos como spam por error.
        Activar para que tu empleado también revise esa carpeta y rescate lo
        importante.
      </p>
      <p className="text-xs" style={{ color: '#9B8FB5' }}>
        Costo estimado: ~30-50 tareas adicionales/mes según volumen.
      </p>
      {enabled && stats && stats.revisados > 0 && (
        <div
          className="mt-3 pt-3 border-t"
          style={{ borderColor: '#E8E3F5' }}
        >
          <p
            className="text-xs font-semibold mb-1"
            style={{ color: '#6B6480' }}
          >
            Última semana:
          </p>
          <p className="text-xs" style={{ color: '#6B6480' }}>
            {stats.revisados} correos revisados · {stats.rescatados} rescatados ·{' '}
            {stats.ops_consumidas} tareas consumidas
          </p>
        </div>
      )}
    </div>
  );
}
