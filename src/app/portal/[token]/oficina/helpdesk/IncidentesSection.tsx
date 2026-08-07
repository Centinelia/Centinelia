'use client';

import { useState } from 'react';
import { AlertTriangle, Plus, X, CheckCircle, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface Incident {
  id: string; titulo: string; descripcion: string;
  mensaje_voz: string; keywords: string[]; activo: boolean; created_at: string;
}

const inputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #E8E3F5',
  color: '#1A0A3B',
  outline: 'none',
};

export default function IncidentesSection({ token, initialIncidents }: { token: string; initialIncidents: Incident[] }) {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [showAdd, setShowAdd]     = useState(false);
  const [open, setOpen]           = useState(true);
  const [saving, setSaving]       = useState(false);

  const [titulo,      setTitulo]      = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [mensajeVoz,  setMensajeVoz]  = useState('');
  const [kwInput,     setKwInput]     = useState('');

  const active   = incidents.filter(i => i.activo);
  const resolved = incidents.filter(i => !i.activo);

  const resolve = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/${token}/incidents/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: false }),
      });
      if (res.ok) setIncidents(i => i.map(x => x.id === id ? { ...x, activo: false } : x));
    } catch {
      // silent, incident stays active
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
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: active.length > 0 ? '1px solid rgba(239,68,68,0.35)' : '1px solid #E8E3F5',
        boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-3 px-5 pt-5 pb-4 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Incidentes activos
            </h2>
            {active.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                {active.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Tu empleado informará estos incidentes antes de registrar nuevas solicitudes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <AlertTriangle size={14} style={{ color: active.length > 0 ? '#ef4444' : '#9B8FB5' }} />
          {open ? <ChevronUp size={14} style={{ color: '#9B8FB5' }} /> : <ChevronDown size={14} style={{ color: '#9B8FB5' }} />}
        </div>
      </button>

      {open && (
        <>
          {/* Active incidents list */}
          {active.length === 0 && !showAdd ? (
            <EmptyState
              icon={ShieldAlert}
              title="Sin incidentes activos"
              description="Cuando reportes un incidente, tu empleado lo anunciará en cada llamada."
            />
          ) : (
            <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
              {active.map((i, idx) => (
                <div key={i.id} className="px-5 py-4 flex items-start gap-3"
                  style={{ borderBottom: idx === active.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: '#b91c1c' }}>{i.titulo}</p>
                    <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>{i.mensaje_voz}</p>
                    {i.keywords.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        {i.keywords.map(k => (
                          <span key={k} className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.20)' }}>{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => resolve(i.id)}
                    className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-semibold shrink-0 transition-opacity hover:opacity-80"
                    style={{ background: '#ffffff', color: '#22c55e', border: '1px solid rgba(34,197,94,0.30)', cursor: 'pointer' }}>
                    <CheckCircle size={11} /> Resolver
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add form / trigger */}
          {showAdd ? (
            <div className="px-5 py-4 flex flex-col gap-2"
              style={{ borderTop: '1px solid #F0EDF9', background: 'rgba(239,68,68,0.04)' }}>
              <input value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="Título del incidente *"
                className="w-full px-3 py-2 rounded-lg text-[12px]"
                style={inputStyle} />
              <textarea value={mensajeVoz} onChange={e => setMensajeVoz(e.target.value)} rows={2}
                placeholder="Mensaje que dice el empleado al contestar llamadas *"
                className="w-full px-3 py-2 rounded-lg text-[12px] resize-none"
                style={inputStyle} />
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={1}
                placeholder="Descripción interna (opcional)"
                className="w-full px-3 py-2 rounded-lg text-[12px] resize-none"
                style={inputStyle} />
              <input value={kwInput} onChange={e => setKwInput(e.target.value)}
                placeholder="Keywords separadas por coma: sap, internet, erp"
                className="w-full px-3 py-2 rounded-lg text-[12px]"
                style={inputStyle} />
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={saving || !titulo.trim() || !mensajeVoz.trim()}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#ef4444', color: '#fff', boxShadow: '0 1px 2px rgba(239,68,68,0.24)' }}>
                  {saving ? 'Reportando...' : 'Reportar incidente'}
                </button>
                <button onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 rounded-lg text-[12px] transition-opacity hover:opacity-70"
                  style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="px-5 py-3 flex items-center" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-70"
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>
                <Plus size={12} /> Reportar incidente
              </button>
            </div>
          )}

          {/* Resolved history */}
          {resolved.length > 0 && (
            <details className="px-5 py-3" style={{ borderTop: '1px solid #F0EDF9' }}>
              <summary className="text-[12px] cursor-pointer" style={{ color: '#9B8FB5' }}>
                Ver {resolved.length} resuelto{resolved.length !== 1 ? 's' : ''}
              </summary>
              <div className="flex flex-col gap-1 mt-2">
                {resolved.map(i => (
                  <div key={i.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                    style={{ background: '#FAFAFB' }}>
                    <X size={10} style={{ color: '#9B8FB5', flexShrink: 0 }} />
                    <p className="text-[11px] truncate" style={{ color: '#6B6480' }}>{i.titulo}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
