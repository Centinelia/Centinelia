'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Gavel } from 'lucide-react';
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
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cabildo_template: cfg }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4 text-left transition-colors hover:bg-[#FAFAFB]"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Plantillas de Cabildo
            </h2>
            {cfg.municipio && cfg.municipio !== 'Municipio' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                {cfg.municipio}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Define el formato de Punto de Acuerdo y Acta de Sesión que genera tu empleado.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Gavel size={14} style={{ color: '#9B8FB5' }} />
          {open
            ? <ChevronDown size={14} style={{ color: '#9B8FB5' }} />
            : <ChevronRight size={14} style={{ color: '#9B8FB5' }} />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-4 flex flex-col gap-4" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
          <p className="text-[12px]" style={{ color: '#6B6480' }}>
            Usa{' '}
            <span className="font-mono text-[11px] px-1 rounded" style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6C3BFF' }}>
              {'{variable}'}
            </span>{' '}
            para los campos que se rellenan automáticamente.
          </p>

          {/* Municipio */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium" style={{ color: '#6B6480' }}>Nombre del municipio</label>
            <input
              type="text"
              value={cfg.municipio}
              onChange={e => setCfg(c => ({ ...c, municipio: e.target.value }))}
              placeholder="H. Ayuntamiento de Monterrey"
              className="px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={{
                  background: tab === t.key ? '#6C3BFF' : '#ffffff',
                  border:     tab === t.key ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                  color:      tab === t.key ? '#ffffff' : '#6B6480',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Variables hint */}
          <div className="px-3 py-2 rounded-lg text-[11px] flex flex-wrap gap-x-3 gap-y-1"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#9B8FB5' }}>
            {(TAB_VARS[tab] ?? []).map(v => (
              <span key={v} className="font-mono" style={{ color: '#6C3BFF' }}>{v}</span>
            ))}
          </div>

          {/* Template textarea */}
          <textarea
            value={tab === 'punto_acuerdo' ? cfg.punto_acuerdo : cfg.acta_sesion}
            onChange={e => setCfg(c => ({ ...c, [tab]: e.target.value }))}
            rows={16}
            className="w-full text-[12px] font-mono px-3 py-3 rounded-lg resize-y outline-none"
            style={{
              background: '#ffffff', border: '1px solid #E8E3F5',
              color: '#1A0A3B', lineHeight: 1.6,
            }}
          />

          <button
            onClick={save}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
          >
            {saved ? <><Check size={13} /> Guardado</> : saving ? 'Guardando...' : 'Guardar plantillas'}
          </button>
        </div>
      )}
    </div>
  );
}
