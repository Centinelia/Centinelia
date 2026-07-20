'use client';

import { useState } from 'react';
import { Check, Gavel } from 'lucide-react';
import type { CabildoTemplate } from '@/lib/civic/cabildo';

interface Props {
  token:   string;
  initial: CabildoTemplate;
}

const TAB_VARS: Record<string, string[]> = {
  punto_acuerdo: ['{municipio}', '{tipo_sesion}', '{numero_sesion}', '{fecha}', '{proposicion}', '{considerandos}', '{resolutivos}', '{votos_favor}', '{votos_contra}', '{abstenciones}'],
  acta_sesion:   ['{municipio}', '{tipo_sesion}', '{numero_sesion}', '{fecha}', '{lugar}', '{asistencia}', '{orden_del_dia}', '{acuerdos}'],
};

const TABS = [
  { key: 'punto_acuerdo', label: 'Punto de Acuerdo' },
  { key: 'acta_sesion',   label: 'Acta de Sesión'   },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function CabildoTemplateEditor({ token, initial }: Props) {
  const [open,    setOpen]    = useState(false);
  const [cfg,     setCfg]     = useState<CabildoTemplate>(initial);
  const [tab,     setTab]     = useState<TabKey>('punto_acuerdo');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cabildo_template: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-surface-2)]"
        style={{ background: 'var(--c-surface)' }}
      >
        <div className="flex items-center gap-2">
          <Gavel size={13} style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>Plantillas de Cabildo</span>
          {cfg.municipio && cfg.municipio !== 'Municipio' && (
            <span className="text-[10px] px-2 py-0.5 rounded-md"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
              {cfg.municipio}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-4" style={{ background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)' }}>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            Define el formato de los documentos que tu empleado genera. Usa{' '}
            <span className="font-mono text-[11px] px-1 rounded" style={{ background: 'var(--c-bg)', color: '#9B6DFF' }}>
              {'{variable}'}
            </span>{' '}
            para los campos que se rellenan automáticamente.
          </p>

          {/* Municipio */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>Nombre del municipio</label>
            <input
              type="text"
              value={cfg.municipio}
              onChange={e => setCfg(c => ({ ...c, municipio: e.target.value }))}
              placeholder="H. Ayuntamiento de Monterrey"
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: tab === t.key ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
                  border:     tab === t.key ? '1px solid rgba(108,59,255,0.4)' : '1px solid var(--c-border)',
                  color:      tab === t.key ? '#9B6DFF' : 'var(--c-text-2)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Variables hint */}
          <div className="px-3 py-2 rounded-lg text-[11px] flex flex-wrap gap-x-3 gap-y-1"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-4)' }}>
            {(TAB_VARS[tab] ?? []).map(v => (
              <span key={v} className="font-mono" style={{ color: '#9B6DFF' }}>{v}</span>
            ))}
          </div>

          {/* Template textarea */}
          <textarea
            value={tab === 'punto_acuerdo' ? cfg.punto_acuerdo : cfg.acta_sesion}
            onChange={e => setCfg(c => ({ ...c, [tab]: e.target.value }))}
            rows={16}
            className="w-full text-xs font-mono px-3 py-3 rounded-lg resize-y"
            style={{
              background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
              color: 'var(--c-text)', outline: 'none', lineHeight: 1.6,
            }}
          />

          <button
            onClick={save}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            {saved ? <><Check size={13} /> Guardado</> : saving ? 'Guardando...' : 'Guardar plantillas'}
          </button>
        </div>
      )}
    </div>
  );
}
