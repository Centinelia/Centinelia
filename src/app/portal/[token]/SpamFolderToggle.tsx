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
  initial,
  stats,
}: {
  token: string;
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
        body: JSON.stringify({ check_spam_folder: next }),
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
      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--c-text-4)' }}
        >
          Revisar carpeta de Spam
        </p>
        <button
          onClick={toggle}
          disabled={saving}
          className="w-10 h-6 rounded-full transition-colors relative"
          style={{ background: enabled ? '#6C3BFF' : 'var(--c-border)' }}
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
        style={{ color: 'var(--c-text-3)', lineHeight: 1.5 }}
      >
        Gmail/Outlook a veces marcan correos legítimos como spam por error.
        Activar para que tu empleado también revise esa carpeta y rescate lo
        importante.
      </p>
      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
        Costo estimado: ~30-50 ops adicionales/mes según volumen.
      </p>
      {enabled && stats && stats.revisados > 0 && (
        <div
          className="mt-3 pt-3 border-t"
          style={{ borderColor: 'var(--c-border)' }}
        >
          <p
            className="text-xs font-semibold mb-1"
            style={{ color: 'var(--c-text-3)' }}
          >
            Última semana:
          </p>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {stats.revisados} correos revisados · {stats.rescatados} rescatados ·{' '}
            {stats.ops_consumidas} ops consumidas
          </p>
        </div>
      )}
    </div>
  );
}
