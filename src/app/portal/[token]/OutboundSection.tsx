'use client';

import { useState, useRef } from 'react';
import { Phone, Plus, Upload, Trash2, Loader2, Check, X, PhoneCall, RefreshCw } from 'lucide-react';

interface Contact {
  id:         string;
  nombre:     string | null;
  telefono:   string;
  motivo:     string | null;
  status:     'pending' | 'calling' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
}

const STATUS_LABEL: Record<Contact['status'], string> = {
  pending:   'En lista',
  calling:   'Llamando…',
  completed: 'Completada',
  failed:    'Fallida',
  cancelled: 'Cancelada',
};
const STATUS_COLOR: Record<Contact['status'], string> = {
  pending:   'rgba(255,255,255,0.08)',
  calling:   'rgba(108,59,255,0.15)',
  completed: 'rgba(34,197,94,0.12)',
  failed:    'rgba(239,68,68,0.12)',
  cancelled: 'rgba(255,255,255,0.06)',
};
const STATUS_TEXT: Record<Contact['status'], string> = {
  pending:   'var(--c-text-2)',
  calling:   '#9B6DFF',
  completed: '#22c55e',
  failed:    '#ef4444',
  cancelled: 'var(--c-text-3)',
};

function StatusPill({ status }: { status: Contact['status'] }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: STATUS_COLOR[status], color: STATUS_TEXT[status] }}>
      {status === 'calling' && <span className="w-1.5 h-1.5 rounded-full bg-[#9B6DFF] animate-pulse" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function parseCSV(text: string): Array<{ nombre?: string; telefono: string; motivo?: string }> {
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
  const hasHeader = header.some(h => ['nombre', 'name', 'telefono', 'phone', 'tel'].includes(h));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const iNombre   = hasHeader ? header.findIndex(h => ['nombre', 'name'].includes(h))   : 0;
  const iTelefono = hasHeader ? header.findIndex(h => ['telefono', 'phone', 'tel'].includes(h)) : (hasHeader ? 1 : 0);
  const iMotivo   = hasHeader ? header.findIndex(h => ['motivo', 'reason', 'nota'].includes(h)) : -1;

  return dataLines
    .map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/['"]/g, ''));
      const telefono = cols[iTelefono]?.trim();
      if (!telefono) return null;
      return {
        nombre:   iNombre   >= 0 ? cols[iNombre]?.trim()  || undefined : undefined,
        telefono,
        motivo:   iMotivo   >= 0 ? cols[iMotivo]?.trim()  || undefined : undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
}

export default function OutboundSection({
  token,
  initialContacts,
}: {
  token:            string;
  initialContacts:  Contact[];
}) {
  const [contacts,  setContacts]  = useState<Contact[]>(initialContacts);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [calling,   setCalling]   = useState(false);
  const [callResult, setCallResult] = useState<{ triggered: number; failed: number } | null>(null);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState('');

  const [nombre,    setNombre]    = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [motivo,    setMotivo]    = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const pendingContacts = contacts.filter(c => c.status === 'pending');
  const selectedPending = [...selected].filter(id => contacts.find(c => c.id === id && c.status === 'pending'));

  const toggleAll = () => {
    if (selected.size === pendingContacts.length && pendingContacts.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingContacts.map(c => c.id)));
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`);
      if (res.ok) setContacts(await res.json());
    } finally {
      setRefreshing(false);
    }
  };

  const handleCall = async () => {
    if (!selectedPending.length) return;
    setCalling(true);
    setCallResult(null);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/llamar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedPending }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al llamar'); return; }
      setCallResult({ triggered: data.triggered, failed: data.failed });
      setSelected(new Set());
      await refresh();
    } finally {
      setCalling(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefono.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre || undefined, telefono, motivo: motivo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return; }
      setContacts(prev => [...(Array.isArray(data) ? data : [data]), ...prev]);
      setNombre(''); setTelefono(''); setMotivo('');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { setError('No se encontraron contactos válidos en el CSV'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: parsed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al importar'); return; }
      setContacts(prev => [...(Array.isArray(data) ? data : [data]), ...prev]);
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!selected.size) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/salientes/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al eliminar'); return; }
      setContacts(prev => prev.filter(c => !selected.has(c.id)));
      setSelected(new Set());
    } finally {
      setDeleting(false);
    }
  };

  const inputStyle = {
    background: 'var(--c-input-bg)',
    border:     '1px solid var(--c-input-border)',
    color:      'var(--c-text)',
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>Llamadas salientes</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Agrega contactos, selecciónalos y el agente los llama automáticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            <Upload size={12} />
            Subir CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSV} />
          <button
            type="button"
            onClick={() => { setShowForm(f => !f); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            <Plus size={12} />
            Agregar
          </button>
        </div>
      </div>

      {/* Add contact form */}
      {showForm && (
        <form onSubmit={handleAddContact}
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Nuevo contacto</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              placeholder="Nombre (opcional)"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
            <input
              placeholder="Teléfono *"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              required
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
            <input
              placeholder="Motivo de la llamada (opcional)"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !telefono.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: '#6C3BFF', color: '#fff' }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setNombre(''); setTelefono(''); setMotivo(''); }}
              className="px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--c-text-3)' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* CSV hint */}
      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
        Formato CSV: columnas <span className="font-mono">nombre, telefono, motivo</span> — la primera fila puede ser encabezado.
      </p>

      {/* Contacts table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3"
            style={{ background: 'var(--c-surface)' }}>
            <PhoneCall size={32} style={{ color: 'var(--c-text-3)' }} />
            <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>No hay contactos aún</p>
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Agrega contactos manualmente o sube un CSV</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-border)' }}>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === pendingContacts.length && pendingContacts.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                    style={{ accentColor: '#6C3BFF' }}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Teléfono</th>
                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Motivo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.id}
                  onClick={() => c.status === 'pending' && toggle(c.id)}
                  style={{
                    background:  selected.has(c.id) ? 'rgba(108,59,255,0.06)' : (i % 2 === 0 ? 'var(--c-surface)' : 'var(--c-surface-2)'),
                    borderBottom: '1px solid var(--c-border)',
                    cursor:       c.status === 'pending' ? 'pointer' : 'default',
                  }}
                >
                  <td className="px-4 py-3">
                    {c.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ accentColor: '#6C3BFF' }}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--c-text)' }}>
                    {c.nombre ?? <span style={{ color: 'var(--c-text-3)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--c-text-2)' }}>{c.telefono}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-xs max-w-[200px] truncate" style={{ color: 'var(--c-text-3)' }}>
                    {c.motivo ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Action bar */}
      {contacts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleCall}
            disabled={calling || selectedPending.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-40"
            style={{ background: selectedPending.length > 0 ? '#6C3BFF' : 'var(--c-surface-2)', color: selectedPending.length > 0 ? '#fff' : 'var(--c-text-3)' }}
          >
            {calling
              ? <Loader2 size={14} className="animate-spin" />
              : <Phone size={14} />}
            {calling ? 'Llamando…' : `Llamar seleccionados${selectedPending.length > 0 ? ` (${selectedPending.length})` : ''}`}
          </button>

          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Eliminar {selected.size > 1 ? `(${selected.size})` : ''}
            </button>
          )}

          {callResult && (
            <span className="text-xs flex items-center gap-1.5" style={{ color: callResult.failed > 0 ? '#f59e0b' : '#22c55e' }}>
              <Check size={12} />
              {callResult.triggered} llamada{callResult.triggered !== 1 ? 's' : ''} iniciada{callResult.triggered !== 1 ? 's' : ''}
              {callResult.failed > 0 && `, ${callResult.failed} fallida${callResult.failed !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          <X size={14} />
          {error}
        </div>
      )}
    </div>
  );
}
