'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { DirectorioContacto } from '@/lib/helpdesk/folio';

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
    await fetch(`/api/portal/${token}/settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directorio_interno: contacts }),
    });
    setSaving(false); setDirty(false);
  };

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--c-border-2)', background: 'var(--c-surface)' }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
          Directorio interno
          {contacts.length > 0 && (
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--c-text-4)' }}>
              {contacts.length} contacto{contacts.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--c-border)' }}>
          <p className="text-xs pt-3" style={{ color: 'var(--c-text-3)' }}>
            Tu empleado consulta este directorio para saber a quién asignar tickets y referir al usuario.
          </p>

          {contacts.map(c => (
            <div key={c.id} className="rounded-lg p-3 flex flex-col gap-2"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={c.nombre} onChange={e => update(c.id, 'nombre', e.target.value)}
                  placeholder="Nombre *"
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                <input value={c.area} onChange={e => update(c.id, 'area', e.target.value)}
                  placeholder="Área / departamento"
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                <input value={c.extension} onChange={e => update(c.id, 'extension', e.target.value)}
                  placeholder="Extensión (ej: x4521)"
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                <input value={c.telefono} onChange={e => update(c.id, 'telefono', e.target.value)}
                  placeholder="Teléfono / celular"
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
              </div>
              <div className="flex items-center gap-2">
                <input value={c.atiende} onChange={e => update(c.id, 'atiende', e.target.value)}
                  placeholder="Qué atiende: red, VPN, WiFi, switches (para el agente)"
                  className="flex-1 px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                <button onClick={() => remove(c.id)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                  style={{ background: 'none', border: 'none', color: 'var(--c-text-4)', cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={add}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', padding: 0 }}>
              <Plus size={12} /> Añadir contacto
            </button>
            {dirty && (
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                <Save size={11} /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
