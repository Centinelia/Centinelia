'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp, BookUser } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { DirectorioContacto } from '@/lib/helpdesk/folio';
import { EmptyState } from '@/components/ui/empty-state';

const inputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #E8E3F5',
  color: '#1A0A3B',
  outline: 'none',
};

export default function DirectorioEditor({ token, initial }: { token: string; initial: DirectorioContacto[] }) {
  const [contacts, setContacts] = useState<DirectorioContacto[]>(initial);
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  const update = (id: string, field: keyof DirectorioContacto, value: string) => {
    setContacts(c => c.map(x => x.id === id ? { ...x, [field]: value } : x));
    setDirty(true);
  };

  const add = () => {
    setContacts(c => [...c, { id: uuid(), nombre: '', area: '', extension: '', telefono: '', atiende: '' }]);
    setDirty(true);
  };

  const remove = (id: string) => { setContacts(c => c.filter(x => x.id !== id)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directorio_interno: contacts }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: '1px solid #E8E3F5',
        boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-3 px-5 pt-5 pb-4 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Directorio interno
            </h2>
            {contacts.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {contacts.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Tu empleado consulta este directorio para saber a quién asignar tickets y referir al usuario.
          </p>
        </div>
        <div className="flex items-center shrink-0 mt-1" style={{ color: '#9B8FB5' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <>
          {contacts.length === 0 ? (
            <EmptyState
              icon={BookUser}
              title="Directorio vacío"
              description="Añade contactos internos para que tu empleado pueda referir al usuario."
              action={
                <button onClick={add}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
                  style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                  <Plus size={12} /> Añadir contacto
                </button>
              }
            />
          ) : (
            <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
              {contacts.map((c, idx) => (
                <div key={c.id} className="px-5 py-4 flex flex-col gap-2"
                  style={{ borderBottom: idx === contacts.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={c.nombre} onChange={e => update(c.id, 'nombre', e.target.value)}
                      placeholder="Nombre *"
                      className="px-3 py-2 rounded-lg text-[12px]"
                      style={inputStyle} />
                    <input value={c.area} onChange={e => update(c.id, 'area', e.target.value)}
                      placeholder="Área o departamento"
                      className="px-3 py-2 rounded-lg text-[12px]"
                      style={inputStyle} />
                    <input value={c.extension} onChange={e => update(c.id, 'extension', e.target.value)}
                      placeholder="Extensión (ej: x4521)"
                      className="px-3 py-2 rounded-lg text-[12px]"
                      style={inputStyle} />
                    <input value={c.telefono} onChange={e => update(c.id, 'telefono', e.target.value)}
                      placeholder="Teléfono o celular"
                      className="px-3 py-2 rounded-lg text-[12px]"
                      style={inputStyle} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={c.atiende} onChange={e => update(c.id, 'atiende', e.target.value)}
                      placeholder="Qué atiende: red, VPN, WiFi, switches (para el agente)"
                      className="flex-1 px-3 py-2 rounded-lg text-[12px]"
                      style={inputStyle} />
                    <button onClick={() => remove(c.id)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                      style={{ background: 'none', border: 'none', color: '#9B8FB5', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer actions */}
          <div className="px-5 py-3 flex items-center gap-2"
            style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
            {contacts.length > 0 && (
              <button onClick={add}
                className="flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-70"
                style={{ background: 'none', border: 'none', color: '#6C3BFF', cursor: 'pointer', padding: 0 }}>
                <Plus size={12} /> Añadir contacto
              </button>
            )}
            {dirty && (
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 ml-auto px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                <Save size={11} /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
