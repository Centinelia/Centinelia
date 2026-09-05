'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Ban, Check, Plus, X, RefreshCw, Network } from 'lucide-react';

type Window = '24h' | '7d' | '30d';

interface Pair {
  from:     string;
  to:       string;
  total:    number;
  success:  number;
  rejected: number;
  failed:   number;
  by_tool:  Record<string, number>;
}

interface Edge {
  id:            string;
  portal_email:  string | null;
  from_meerkat:  string;
  to_meerkat:    string;
  tool_name:     string | null;
  enabled:       boolean;
  reason:        string | null;
  updated_at:    string;
}

interface RecentLog {
  from_meerkat: string;
  to_meerkat:   string;
  tool_name:    string;
  outcome:      string;
  handoff_at:   string;
}

interface Data {
  window: Window;
  pairs:  Pair[];
  edges:  Edge[];
  recent: RecentLog[];
}

const MEERKATS = ['nia', 'noah', 'nico', 'nara', 'nelia', 'neo', 'nova', 'naia', 'nox', 'niva'];

const selectStyle = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  color: '#111827',
  padding: '6px 10px',
  borderRadius: '8px',
  fontSize: '13px',
} as const;

export function HandoffsView() {
  const [win,   setWin]   = useState<Window>('7d');
  const [data,  setData]  = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newEdge, setNewEdge] = useState<{ from: string; to: string; tool: string; enabled: boolean; reason: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/handoffs?window=${win}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'fetch failed');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [win]);

  const saveEdge = async () => {
    if (!newEdge?.from || !newEdge?.to) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_meerkat: newEdge.from,
          to_meerkat:   newEdge.to,
          tool_name:    newEdge.tool || null,
          enabled:      newEdge.enabled,
          reason:       newEdge.reason || null,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setNewEdge(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const deleteEdge = async (id: string) => {
    if (!confirm('¿Eliminar este edge?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/handoffs?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const toggleEdge = async (edge: Edge) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal_email: edge.portal_email,
          from_meerkat: edge.from_meerkat,
          to_meerkat:   edge.to_meerkat,
          tool_name:    edge.tool_name,
          enabled:      !edge.enabled,
          reason:       edge.reason,
        }),
      });
      if (!res.ok) throw new Error('toggle failed');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="flex items-center gap-2 text-[13px]">
          <span style={{ color: '#6B7280' }}>Ventana</span>
          <select value={win} onChange={e => setWin(e.target.value as Window)} style={selectStyle}>
            <option value="24h">24 horas</option>
            <option value="7d">7 días</option>
            <option value="30d">30 días</option>
          </select>
        </label>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg"
          style={{ color: '#374151', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Pares reales */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[15px] font-semibold flex items-center gap-2" style={{ color: '#111827' }}>
                <Network size={15} style={{ color: '#6B7280' }} />
                Handoffs reales
              </h2>
              <span className="text-[12px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
                {data.pairs.length} pares
              </span>
            </div>
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
              {data.pairs.length === 0 && (
                <div className="p-8 text-center">
                  <Network size={20} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
                  <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin handoffs registrados en el rango.</p>
                  <p className="text-[12px] mt-1" style={{ color: '#9CA3AF' }}>
                    Aparecerán cuando un meerkat consulte o delegue a otro por voz.
                  </p>
                </div>
              )}
              {data.pairs.map((p, i) => {
                const successRate = p.total > 0 ? (p.success / p.total) * 100 : 0;
                return (
                  <div
                    key={`${p.from}::${p.to}`}
                    className="flex items-center gap-3 px-5 py-3 text-[13px] transition-colors hover:bg-gray-50"
                    style={{ borderTop: i > 0 ? '1px solid #F3F4F6' : undefined }}
                  >
                    <MeerkatPill name={p.from} />
                    <ArrowRight size={14} style={{ color: '#9CA3AF' }} />
                    <MeerkatPill name={p.to} />
                    <span className="flex-1 text-[12px] font-mono truncate" style={{ color: '#9CA3AF' }}>
                      {Object.entries(p.by_tool).map(([t, n]) => `${t}: ${n}`).join(' · ')}
                    </span>
                    <span className="text-[12px] tabular-nums" style={{ color: '#6B7280' }}>
                      <span style={{ color: '#10B981' }}>{p.success}✓</span>{' '}
                      <span style={{ color: '#F59E0B' }}>{p.rejected}⊘</span>{' '}
                      <span style={{ color: '#EF4444' }}>{p.failed}✗</span>
                    </span>
                    <span
                      className="text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-md"
                      style={{
                        background: successRate >= 80 ? '#ECFDF5' : successRate >= 50 ? '#FFFBEB' : '#FEF2F2',
                        color:      successRate >= 80 ? '#047857' : successRate >= 50 ? '#B45309' : '#B91C1C',
                      }}
                    >
                      {p.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Edges declarativos */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold flex items-center gap-2" style={{ color: '#111827' }}>
                Reglas de handoff
              </h2>
              <button
                onClick={() => setNewEdge({ from: '', to: '', tool: '', enabled: false, reason: '' })}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg"
                style={{ background: '#8B5CF6', color: '#FFFFFF' }}
              >
                <Plus size={13} />
                Nueva regla
              </button>
            </div>

            {newEdge && (
              <div className="rounded-xl bg-white p-5 mb-3" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[13px]">
                  <select value={newEdge.from} onChange={e => setNewEdge({ ...newEdge, from: e.target.value })} style={selectStyle}>
                    <option value="">De…</option>
                    {MEERKATS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={newEdge.to} onChange={e => setNewEdge({ ...newEdge, to: e.target.value })} style={selectStyle}>
                    <option value="">Hacia…</option>
                    {MEERKATS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={newEdge.tool} onChange={e => setNewEdge({ ...newEdge, tool: e.target.value })} style={selectStyle}>
                    <option value="">Todos los tools</option>
                    <option value="consultar_agente">consultar_agente</option>
                    <option value="delegar_tarea">delegar_tarea</option>
                  </select>
                  <label className="flex items-center gap-1.5" style={{ color: '#374151' }}>
                    <input type="checkbox" checked={newEdge.enabled} onChange={e => setNewEdge({ ...newEdge, enabled: e.target.checked })} />
                    Habilitado
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Razón (opcional)"
                  value={newEdge.reason}
                  onChange={e => setNewEdge({ ...newEdge, reason: e.target.value })}
                  className="w-full mt-3 px-3 py-2 text-[13px] rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
                />
                <div className="mt-3 flex gap-2 justify-end">
                  <button
                    onClick={() => setNewEdge(null)}
                    className="text-[13px] font-medium px-3 py-1.5 rounded-lg"
                    style={{ color: '#6B7280', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveEdge}
                    className="text-[13px] font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: '#8B5CF6', color: '#FFFFFF' }}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {data.edges.length === 0 && !newEdge && (
              <div className="rounded-xl p-8 text-center bg-white" style={{ border: '1px solid #E5E7EB' }}>
                <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin reglas configuradas.</p>
                <p className="text-[12px] mt-1" style={{ color: '#9CA3AF' }}>
                  Por default todos los pares están permitidos. Crea una regla para restringir un flujo específico.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {data.edges.map(e => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white text-[13px]"
                  style={{
                    border: e.enabled ? '1px solid #A7F3D0' : '1px solid #FECACA',
                    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
                  }}
                >
                  {e.enabled ? <Check size={14} style={{ color: '#10B981' }} /> : <Ban size={14} style={{ color: '#EF4444' }} />}
                  <MeerkatPill name={e.from_meerkat} />
                  <ArrowRight size={12} style={{ color: '#9CA3AF' }} />
                  <MeerkatPill name={e.to_meerkat} />
                  <span className="text-[12px] px-2 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#4B5563' }}>
                    {e.tool_name ?? 'todos los tools'}
                  </span>
                  {e.reason && <span className="text-[12px] flex-1 truncate" style={{ color: '#6B7280' }}>· {e.reason}</span>}
                  {!e.reason && <span className="flex-1" />}
                  <button
                    onClick={() => toggleEdge(e)}
                    className="text-[12px] font-medium px-2.5 py-1 rounded-md"
                    style={{
                      color:      e.enabled ? '#EF4444' : '#10B981',
                      border:     `1px solid ${e.enabled ? '#FECACA' : '#A7F3D0'}`,
                      background: e.enabled ? '#FEF2F2' : '#ECFDF5',
                    }}
                  >
                    {e.enabled ? 'Deshabilitar' : 'Habilitar'}
                  </button>
                  <button
                    onClick={() => deleteEdge(e.id)}
                    className="p-1 rounded"
                    style={{ color: '#9CA3AF' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Recent */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
                Handoffs recientes
              </h2>
              <span className="text-[12px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
                {data.recent.length} rows
              </span>
            </div>
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
              {data.recent.length === 0 && (
                <p className="p-6 text-[13px] text-center" style={{ color: '#9CA3AF' }}>Sin handoffs recientes.</p>
              )}
              {data.recent.map((l, i) => (
                <div
                  key={i}
                  className="grid gap-3 px-5 py-2.5 text-[13px] transition-colors hover:bg-gray-50 items-center"
                  style={{
                    gridTemplateColumns: '130px auto auto auto 1fr auto',
                    borderTop: i > 0 ? '1px solid #F3F4F6' : undefined,
                  }}
                >
                  <span className="font-mono tabular-nums whitespace-nowrap" style={{ color: '#9CA3AF' }}>{fmt(l.handoff_at)}</span>
                  <MeerkatPill name={l.from_meerkat} />
                  <ArrowRight size={12} style={{ color: '#9CA3AF' }} />
                  <MeerkatPill name={l.to_meerkat} />
                  <span className="text-[12px]" style={{ color: '#6B7280' }}>{l.tool_name}</span>
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md uppercase tracking-wide"
                    style={{
                      background: l.outcome === 'success' ? '#ECFDF5' : l.outcome === 'rejected' ? '#FFFBEB' : '#FEF2F2',
                      color:      l.outcome === 'success' ? '#047857' : l.outcome === 'rejected' ? '#B45309' : '#B91C1C',
                    }}
                  >
                    {l.outcome}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MeerkatPill({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium font-mono"
      style={{ background: '#F3F0FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}
    >
      {name}
    </span>
  );
}
