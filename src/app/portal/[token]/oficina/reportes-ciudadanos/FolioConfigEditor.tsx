'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { previewFolio, type FolioConfig } from '@/lib/civic/folio';

const SEPARATORS = [
  { value: '-',  label: 'Guión  (-)' },
  { value: '/',  label: 'Diagonal  (/)' },
  { value: '_',  label: 'Guión bajo  (_)' },
  { value: '',   label: 'Sin separador' },
];

interface Props {
  token:   string;
  initial: FolioConfig;
}

export default function FolioConfigEditor({ token, initial }: Props) {
  const [open,   setOpen]   = useState(false);
  const [cfg,    setCfg]    = useState<FolioConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  function update(patch: Partial<FolioConfig>) {
    setCfg(c => ({ ...c, ...patch }));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ folio_config: cfg }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  const preview = previewFolio(cfg, 42);

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
              Formato de folios
            </h2>
            <span className="font-mono text-[12px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6C3BFF' }}>
              {preview}
            </span>
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Define cómo se numeran los reportes que registra tu equipo.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Settings2 size={14} style={{ color: '#9B8FB5' }} />
          {open
            ? <ChevronDown size={14} style={{ color: '#9B8FB5' }} />
            : <ChevronRight size={14} style={{ color: '#9B8FB5' }} />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-4 flex flex-col gap-4" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>

          {/* Prefix */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium" style={{ color: '#6B6480' }}>Prefijo</label>
            <input
              type="text"
              value={cfg.prefix}
              onChange={e => update({ prefix: e.target.value.toUpperCase().slice(0, 12) })}
              placeholder="REP"
              maxLength={12}
              className="px-3 py-2 rounded-lg text-[13px] font-mono outline-none"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', width: 160 }}
            />
            <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
              Ej: REP, MTY, SRPM-311, DU, TES
            </p>
          </div>

          {/* Separator */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium" style={{ color: '#6B6480' }}>Separador</label>
            <div className="flex gap-1.5 flex-wrap">
              {SEPARATORS.map(s => (
                <button
                  key={s.value}
                  onClick={() => update({ separator: s.value })}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                  style={{
                    background: cfg.separator === s.value ? '#6C3BFF' : '#ffffff',
                    border:     cfg.separator === s.value ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                    color:      cfg.separator === s.value ? '#ffffff' : '#6B6480',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include year */}
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
            <div>
              <p className="text-[12px] font-medium" style={{ color: '#1A0A3B' }}>Incluir año</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#9B8FB5' }}>
                El consecutivo reinicia cada año cuando está activado
              </p>
            </div>
            <button
              onClick={() => update({ include_year: !cfg.include_year })}
              className="relative flex-shrink-0 rounded-full transition-colors"
              style={{
                width: 36, height: 20,
                background: cfg.include_year ? '#6C3BFF' : '#E8E3F5',
              }}
              aria-label="Toggle incluir año"
            >
              <span className="absolute top-0.5 rounded-full transition-all"
                style={{
                  width: 16, height: 16,
                  background: '#fff',
                  left: cfg.include_year ? 18 : 2,
                }} />
            </button>
          </div>

          {/* Digits */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium" style={{ color: '#6B6480' }}>Dígitos del consecutivo</label>
            <div className="flex gap-1.5">
              {[4, 5, 6].map(d => (
                <button
                  key={d}
                  onClick={() => update({ digits: d })}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-mono font-medium transition-all"
                  style={{
                    background: cfg.digits === d ? '#6C3BFF' : '#ffffff',
                    border:     cfg.digits === d ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                    color:      cfg.digits === d ? '#ffffff' : '#6B6480',
                  }}
                >
                  {'0'.repeat(d - 1)}1
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="px-4 py-3 rounded-lg flex items-center gap-3"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
            <span className="text-[12px]" style={{ color: '#6B6480' }}>Ejemplo de folio:</span>
            <span className="font-mono font-bold text-[13px]" style={{ color: '#6C3BFF' }}>{preview}</span>
          </div>

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
          >
            {saved ? <><Check size={13} /> Guardado</> : saving ? 'Guardando...' : 'Guardar formato'}
          </button>
        </div>
      )}
    </div>
  );
}
