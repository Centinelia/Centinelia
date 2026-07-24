'use client';

import { useState } from 'react';
import { AlertTriangle, Plus, X, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface Incident {
  id: string; titulo: string; descripcion: string;
  mensaje_voz: string; keywords: string[]; activo: boolean; created_at: string;
}

export default function IncidentesSection({ token, initialIncidents }: { token: string; initialIncidents: Incident[] }) {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [showAdd, setShowAdd]     = useState(false);
  const [open, setOpen]           = useState(true);
  const [saving, setSaving]       = useState(false);

  const [titulo,      setTitulo]      = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [mensajeVoz,  setMensajeVoz]  = useState('');
  const [kwInput,     setKwInput]     = useState('');

  const active = incidents.filter(i => i.activo);

  const resolve = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/${token}/incidents/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: false }),
      });
      if (res.ok) setIncidents(i => i.map(x => x.id === id ? { ...x, activo: false } : x));
    } catch {
      // silent — incident stays active
    }
  };

  const handleAdd = async () => {
    if (!titulo.trim() || !mensajeVoz.trim()) return;
    setSaving(true);
    try {
      const keywords = kwInput.split(',').map(k => k.trim()).filter(Boolean);
      const res = await fetch(`/api/portal/${token}/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, descripcion, mensaje_voz: mensajeVoz, keywords }),
      });
      if (res.ok) {
        const d = await res.json();
        setIncidents(prev => [d.incident, ...prev]);
        setShowAdd(false); setTitulo(''); setDescripcion(''); setMensajeVoz(''); setKwInput('');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: active.length > 0 ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--c-border-2)', background: 'var(--c-surface)' }}>

      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <AlertTriangle size={14} style={{ color: active.length > 0 ? '#ef4444' : 'var(--c-text-3)', flexShrink: 0 }} />
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
          Incidentes activos
          {active.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {active.length}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--c-border)' }}>
          <p className="text-xs pt-3" style={{ color: 'var(--c-text-3)' }}>
            Tu empleado informará estos incidentes antes de registrar nuevas solicitudes.
          </p>

          {/* Active incidents */}
          {active.map(i => (
            <div key={i.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: '#fca5a5' }}>{i.titulo}</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>{i.mensaje_voz}</p>
                {i.keywords.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {i.keywords.map(k => (
                      <span key={k} className="px-1 py-0.5 rounded text-[10px]"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>{k}</span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => resolve(i.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold shrink-0 transition-opacity hover:opacity-80"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer' }}>
                <CheckCircle size={10} /> Resolver
              </button>
            </div>
          ))}

          {active.length === 0 && !showAdd && (
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin incidentes activos.</p>
          )}

          {/* Add form */}
          {showAdd ? (
            <div className="flex flex-col gap-2 p-3 rounded-lg"
              style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.2)' }}>
              <input value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="Título del incidente *"
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
              <textarea value={mensajeVoz} onChange={e => setMensajeVoz(e.target.value)} rows={2}
                placeholder="Mensaje que dice el empleado al contestar llamadas *"
                className="w-full px-3 py-2 rounded-lg text-xs resize-none"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={1}
                placeholder="Descripción interna (opcional)"
                className="w-full px-3 py-2 rounded-lg text-xs resize-none"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
              <input value={kwInput} onChange={e => setKwInput(e.target.value)}
                placeholder="Keywords separadas por coma: sap, internet, erp"
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={saving || !titulo.trim() || !mensajeVoz.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#ef4444', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Reportando...' : 'Reportar incidente'}
                </button>
                <button onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs self-start transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>
              <Plus size={12} /> Reportar incidente
            </button>
          )}

          {/* Resolved history (collapsed) */}
          {incidents.filter(i => !i.activo).length > 0 && (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--c-text-4)' }}>
                Ver {incidents.filter(i => !i.activo).length} resueltos
              </summary>
              <div className="flex flex-col gap-1 mt-2">
                {incidents.filter(i => !i.activo).map(i => (
                  <div key={i.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                    style={{ background: 'var(--c-surface-2)', opacity: 0.6 }}>
                    <X size={10} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                    <p className="text-[11px] truncate" style={{ color: 'var(--c-text-3)' }}>{i.titulo}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
