'use client';

import { useState } from 'react';
import { Check, FileCheck2, Plus, Trash2, X } from 'lucide-react';
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

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-surface-2)]"
        style={{ background: 'var(--c-surface)' }}
      >
        <div className="flex items-center gap-2">
          <FileCheck2 size={13} style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>Expedientes y documentos</span>
          {typeCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-md"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
              {typeCount} trámite{typeCount !== 1 ? 's' : ''} · {docCount} doc{docCount !== 1 ? 's' : ''}
            </span>
          )}
          {typeCount === 0 && (
            <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>Sin configurar</span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Config panel */}
      {open && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-4" style={{ background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)' }}>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            Define qué documentos se requieren por tipo de trámite. Tu empleado consultará esta lista cuando un ciudadano pregunte qué le falta.
          </p>

          {/* Trámite types */}
          {Object.keys(cfg).length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--c-text-4)' }}>Aún no hay tipos de trámite configurados.</p>
          )}

          <div className="flex flex-col gap-3">
            {Object.entries(cfg).map(([type, docs]) => (
              <div key={type} className="rounded-lg p-3 flex flex-col gap-2"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                {/* Type header */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>{type}</span>
                  <button onClick={() => removeType(type)} className="p-1 rounded transition-colors hover:bg-[var(--c-surface-2)]">
                    <Trash2 size={12} style={{ color: 'var(--c-text-4)' }} />
                  </button>
                </div>

                {/* Document list */}
                <div className="flex flex-col gap-1">
                  {docs.map(doc => (
                    <div key={doc} className="flex items-center justify-between gap-2 px-2 py-1 rounded-md"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                      <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>{doc}</span>
                      <button onClick={() => removeDoc(type, doc)}>
                        <X size={11} style={{ color: 'var(--c-text-4)' }} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add document inline */}
                {addDocFor === type ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newDoc}
                      onChange={e => setNewDoc(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addDoc(type); if (e.key === 'Escape') { setAddDocFor(null); setNewDoc(''); }}}
                      placeholder="Nombre del documento..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg text-xs"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                    />
                    <button onClick={() => addDoc(type)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: '#6C3BFF', color: '#fff' }}>
                      Agregar
                    </button>
                    <button onClick={() => { setAddDocFor(null); setNewDoc(''); }}
                      className="px-2 py-1.5 rounded-lg text-xs"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddDocFor(type); setNewDoc(''); }}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors hover:bg-[var(--c-surface)]"
                    style={{ color: 'var(--c-text-3)' }}
                  >
                    <Plus size={11} /> Agregar documento
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add new trámite type */}
          {addingType ? (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={newType}
                onChange={e => setNewType(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addType(); if (e.key === 'Escape') { setAddingType(false); setNewType(''); }}}
                placeholder="Nombre del trámite (ej: Licencia de construcción)..."
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
              />
              <button onClick={addType}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                Crear
              </button>
              <button onClick={() => { setAddingType(false); setNewType(''); }}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingType(true)}
              className="self-start flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
              style={{ border: '1px dashed var(--c-border-2)', color: 'var(--c-text-3)' }}
            >
              <Plus size={13} /> Nuevo tipo de trámite
            </button>
          )}

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            {saved ? <><Check size={13} /> Guardado</> : saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      )}
    </div>
  );
}
