'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';

export default function RoleKnowledgeBaseEditor({
  token,
  role,
  initialValue,
}: {
  token:        string;
  role:         string;
  initialValue: string;
}) {
  const [value, setValue]   = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [dirty, setDirty]   = useState(false);

  useDirtyWarning('kb-role', dirty);

  const SOFT_LIMIT = 5_000;
  const HARD_LIMIT = 10_000;
  const chars = value.length;
  const pct   = Math.min((chars / HARD_LIMIT) * 100, 100);
  const barColor = chars <= SOFT_LIMIT ? '#22c55e' : chars <= HARD_LIMIT ? '#f59e0b' : '#ef4444';
  const hint =
    chars <= SOFT_LIMIT ? 'Ideal' :
    chars <= HARD_LIMIT ? 'Largo pero aceptable, considera resumir' :
    'Muy extenso, considera resumir para que tu empleado lo consulte con facilidad';

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/portal/${token}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_knowledge_base: value }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500); }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
        Tu empleado consulta esta información en su día a día como <strong style={{ color: '#f59e0b' }}>{role}</strong>. Incluye procedimientos, reglas del puesto, límites de aprobación, contactos clave y cualquier detalle específico de su rol.
      </p>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); setDirty(true); }}
        rows={10}
        placeholder={`PROCEDIMIENTO:\n1. Revisar el documento recibido.\n2. Comparar contra los criterios aprobados.\n3. Si hay discrepancia mayor al 5%, escalar por email.\n\nCONTACTOS CLAVE:\n- Aprobador final: gerencia@empresa.com\n- Proveedor principal: proveedor@empresa.com\n\nLÍMITES:\n- Facturas hasta $10,000: aprobación automática.\n- Facturas mayores: requieren confirmación del dueño.`}
        className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y"
        style={{
          background: 'var(--c-input-bg)',
          border: '1px solid rgba(245,158,11,0.3)',
          color: 'var(--c-text)',
          minHeight: 180,
        }}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: barColor, fontWeight: 500 }}>
            {chars.toLocaleString('es-MX')} / {HARD_LIMIT.toLocaleString('es-MX')} caracteres
          </span>
          <span style={{ color: 'var(--c-text-4)' }}>{hint}</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--c-input-border)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
          style={{ background: saved ? '#22c55e' : '#f59e0b', color: '#fff' }}
        >
          {saving
            ? <><Loader2 size={13} className="animate-spin" />Guardando…</>
            : saved
              ? <><Check size={13} />Guardado</>
              : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
