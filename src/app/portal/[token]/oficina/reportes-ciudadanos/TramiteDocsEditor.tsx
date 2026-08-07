'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, FileCheck2, Plus, Trash2, X } from 'lucide-react';
import type { TramiteDocsConfig } from '@/lib/civic/folio';

interface Props {
  token:   string;
  initial: TramiteDocsConfig;
}

export default function TramiteDocsEditor({ token, initial }: Props) {
  const [open,       setOpen]       = useState(false);
  const [cfg,        setCfg]        = useState<TramiteDocsConfig>(initial);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [newType,    setNewType]    = useState('');
  const [addingType, setAddingType] = useState(false);
  const [addDocFor,  setAddDocFor]  = useState<string | null>(null);
  const [newDoc,     setNewDoc]     = useState('');

  const typeCount = Object.keys(cfg).length;
  const docCount  = Object.values(cfg).flat().length;

  function removeType(name: string) {
    setCfg(c => { const n = { ...c }; delete n[name]; return n; });
  }

  function addType() {
    const name = newType.trim();
    if (!name || cfg[name]) return;
    setCfg(c => ({ ...c, [name]: [] }));
    setNewType('');
    setAddingType(false);
    setAddDocFor(name);
  }

  function addDoc(type: string) {
    const doc = newDoc.trim();
    if (!doc) return;
    if (!(cfg[type] ?? []).includes(doc)) {
      setCfg(c => ({ ...c, [type]: [...(c[type] ?? []), doc] }));
    }
    setNewDoc('');
    setAddDocFor(null);
  }

  function removeDoc(type: string, doc: string) {
    setCfg(c => ({ ...c, [type]: (c[type] ?? []).filter(d => d !== doc) }));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tramite_docs: cfg }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  const types = Object.entries(cfg);

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
              Expedientes y documentos
            </h2>
            {typeCount > 0 ? (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {typeCount} trámite{typeCount !== 1 ? 's' : ''} · {docCount} doc{docCount !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: '#F0EDF9', color: '#9B8FB5' }}>
                Sin configurar
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Define qué documentos requiere cada trámite para que tu equipo los pida completos.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <FileCheck2 size={14} style={{ color: '#9B8FB5' }} />
          {open
            ? <ChevronDown size={14} style={{ color: '#9B8FB5' }} />
            : <ChevronRight size={14} style={{ color: '#9B8FB5' }} />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-4 flex flex-col gap-4" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
          <p className="text-[12px]" style={{ color: '#6B6480' }}>
            Tu empleado consultará esta lista cuando un ciudadano pregunte qué le falta.
          </p>

          {types.length === 0 && (
            <p className="text-[12px] italic" style={{ color: '#9B8FB5' }}>Aún no hay tipos de trámite configurados.</p>
          )}

          {/* Trámite types list, apilada como una lista con dividers */}
          {types.length > 0 && (
            <div className="flex flex-col rounded-xl overflow-hidden"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
              {types.map(([type, docs], idx) => (
                <div
                  key={type}
                  className="px-4 py-3 flex flex-col gap-2"
                  style={{ borderBottom: idx === types.length - 1 ? 'none' : '1px solid #F0EDF9' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{type}</span>
                    <button onClick={() => removeType(type)}
                      className="p-1 rounded transition-opacity hover:opacity-70"
                      aria-label="Eliminar trámite">
                      <Trash2 size={12} style={{ color: '#9B8FB5' }} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    {docs.map(doc => (
                      <div key={doc}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md"
                        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                        <span className="text-[12px]" style={{ color: '#1A0A3B' }}>{doc}</span>
                        <button onClick={() => removeDoc(type, doc)} aria-label="Quitar documento">
                          <X size={11} style={{ color: '#9B8FB5' }} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {addDocFor === type ? (
                    <div className="flex gap-2 flex-wrap">
                      <input
                        autoFocus
                        type="text"
                        value={newDoc}
                        onChange={e => setNewDoc(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addDoc(type); if (e.key === 'Escape') { setAddDocFor(null); setNewDoc(''); }}}
                        placeholder="Nombre del documento..."
                        className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg text-[12px] outline-none"
                        style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                      />
                      <button onClick={() => addDoc(type)}
                        className="px-3 h-8 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                        style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                        Agregar
                      </button>
                      <button onClick={() => { setAddDocFor(null); setNewDoc(''); }}
                        className="px-2.5 h-8 rounded-lg text-[12px] transition-opacity hover:opacity-70"
                        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddDocFor(type); setNewDoc(''); }}
                      className="self-start flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-opacity hover:opacity-70"
                      style={{ color: '#6C3BFF' }}
                    >
                      <Plus size={11} /> Agregar documento
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new trámite type */}
          {addingType ? (
            <div className="flex gap-2 flex-wrap">
              <input
                autoFocus
                type="text"
                value={newType}
                onChange={e => setNewType(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addType(); if (e.key === 'Escape') { setAddingType(false); setNewType(''); }}}
                placeholder="Nombre del trámite (ej: Licencia de construcción)..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
              />
              <button onClick={addType}
                className="px-3 h-9 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                Crear
              </button>
              <button onClick={() => { setAddingType(false); setNewType(''); }}
                className="px-3 h-9 rounded-lg text-[13px] transition-opacity hover:opacity-70"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingType(true)}
              className="self-start flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-lg transition-opacity hover:opacity-70"
              style={{ background: '#ffffff', border: '1px dashed #E8E3F5', color: '#6B6480' }}
            >
              <Plus size={13} /> Nuevo tipo de trámite
            </button>
          )}

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
          >
            {saved ? <><Check size={13} /> Guardado</> : saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      )}
    </div>
  );
}
