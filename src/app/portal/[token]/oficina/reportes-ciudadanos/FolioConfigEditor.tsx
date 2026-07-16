'use client';

import { useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { previewFolio, DEFAULT_FOLIO_CONFIG, type FolioConfig } from '@/lib/civic/folio';

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
    await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ folio_config: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const preview = previewFolio(cfg, 42);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-surface-2)]"
        style={{ background: 'var(--c-surface)' }}
      >
        <div className="flex items-center gap-2">
          <Settings2 size={13} style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>Formato de folios</span>
          <span className="font-mono text-xs px-2 py-0.5 rounded-md"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#9B6DFF' }}>
            {preview}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Config panel */}
      {open && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-4" style={{ background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)' }}>

          {/* Prefix */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>Prefijo</label>
            <input
              type="text"
              value={cfg.prefix}
              onChange={e => update({ prefix: e.target.value.toUpperCase().slice(0, 12) })}
              placeholder="REP"
              maxLength={12}
              className="px-3 py-2 rounded-lg text-sm font-mono"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none', width: 160 }}
            />
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              Ej: REP, MTY, SRPM-311, DU, TES
            </p>
          </div>

          {/* Separator */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>Separador</label>
            <div className="flex gap-2 flex-wrap">
              {SEPARATORS.map(s => (
                <button
                  key={s.value}
                  onClick={() => update({ separator: s.value })}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: cfg.separator === s.value ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
                    border:     cfg.separator === s.value ? '1px solid rgba(108,59,255,0.4)' : '1px solid var(--c-border)',
                    color:      cfg.separator === s.value ? '#9B6DFF' : 'var(--c-text-2)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include year */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>Incluir año</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                El consecutivo reinicia cada año cuando está activado
              </p>
            </div>
            <button
              onClick={() => update({ include_year: !cfg.include_year })}
              className="relative flex-shrink-0 rounded-full transition-colors"
              style={{
                width: 36, height: 20,
                background: cfg.include_year ? '#6C3BFF' : 'var(--c-border)',
              }}
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
            <label className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>Dígitos del consecutivo</label>
            <div className="flex gap-2">
              {[4, 5, 6].map(d => (
                <button
                  key={d}
                  onClick={() => update({ digits: d })}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
                  style={{
                    background: cfg.digits === d ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
                    border:     cfg.digits === d ? '1px solid rgba(108,59,255,0.4)' : '1px solid var(--c-border)',
                    color:      cfg.digits === d ? '#9B6DFF' : 'var(--c-text-2)',
                  }}
                >
                  {'0'.repeat(d - 1)}1
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
            <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Ejemplo de folio:</span>
            <span className="font-mono font-bold text-sm" style={{ color: '#9B6DFF' }}>{preview}</span>
          </div>

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            {saved ? <><Check size={13} /> Guardado</> : saving ? 'Guardando...' : 'Guardar formato'}
          </button>
        </div>
      )}
    </div>
  );
}
