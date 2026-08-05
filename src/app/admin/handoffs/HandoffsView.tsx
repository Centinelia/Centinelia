'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Ban, Check, Plus, X } from 'lucide-react';

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm flex items-center gap-2">
          <span style={{ color: 'var(--c-text-2)' }}>Ventana</span>
          <select
            value={win}
            onChange={e => setWin(e.target.value as Window)}
            className="px-2 py-1 rounded border"
            style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--c-text)' }}
          >
            <option value="24h">24 horas</option>
            <option value="7d">7 días</option>
            <option value="30d">30 días</option>
          </select>
        </label>
        {loading && <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Cargando…</span>}
      </div>

      {error && <div className="p-3 rounded text-sm" style={{ background: 'rgba(255,80,80,0.1)', color: '#ff7070' }}>{error}</div>}

      {data && (
        <>
          {/* Pares reales (histórico) */}
          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text)' }}>Handoffs reales últimos {win} — {data.pairs.length} pares únicos</h2>
            {data.pairs.length === 0 && <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Sin handoffs registrados en el rango.</p>}
            <div className="space-y-1.5">
              {data.pairs.map(p => {
                const successRate = p.total > 0 ? (p.success / p.total) * 100 : 0;
                return (
                  <div key={`${p.from}::${p.to}`} className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                    <span className="font-mono flex-shrink-0" style={{ color: '#9B6DFF', minWidth: '60px' }}>{p.from}</span>
                    <ArrowRight size={14} style={{ color: 'var(--c-text-3)' }} />
                    <span className="font-mono flex-shrink-0" style={{ color: '#9B6DFF', minWidth: '60px' }}>{p.to}</span>
                    <span className="flex-1 text-xs" style={{ color: 'var(--c-text-3)' }}>
                      {Object.entries(p.by_tool).map(([t, n]) => `${t}:${n}`).join(' · ')}
                    </span>
                    <span className="text-xs" style={{ color: successRate >= 80 ? '#4ade80' : successRate >= 50 ? '#facc15' : '#f87171' }}>
                      {p.success}✓ {p.rejected}⊘ {p.failed}✗
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--c-text)', minWidth: '40px', textAlign: 'right' }}>{p.total}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Edges declarativos */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Edges declarativos — {data.edges.length}</h2>
              <button
                onClick={() => setNewEdge({ from: '', to: '', tool: '', enabled: false, reason: '' })}
                className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
                style={{ background: '#6C3BFF', color: '#FAFBFF' }}
              >
                <Plus size={12} />
                Nuevo edge
              </button>
            </div>

            {newEdge && (
              <div className="p-4 rounded-lg mb-3" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                  <select value={newEdge.from} onChange={e => setNewEdge({ ...newEdge, from: e.target.value })} className="px-2 py-1 rounded border" style={{ background: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
                    <option value="">from…</option>
                    {MEERKATS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={newEdge.to} onChange={e => setNewEdge({ ...newEdge, to: e.target.value })} className="px-2 py-1 rounded border" style={{ background: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
                    <option value="">to…</option>
                    {MEERKATS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={newEdge.tool} onChange={e => setNewEdge({ ...newEdge, tool: e.target.value })} className="px-2 py-1 rounded border" style={{ background: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
                    <option value="">todos los tools</option>
                    <option value="consultar_agente">consultar_agente</option>
                    <option value="delegar_tarea">delegar_tarea</option>
                  </select>
                  <label className="flex items-center gap-1.5" style={{ color: 'var(--c-text-2)' }}>
                    <input type="checkbox" checked={newEdge.enabled} onChange={e => setNewEdge({ ...newEdge, enabled: e.target.checked })} />
                    enabled
                  </label>
                </div>
                <input type="text" placeholder="Razón (opcional)" value={newEdge.reason} onChange={e => setNewEdge({ ...newEdge, reason: e.target.value })} className="w-full mt-2 px-2 py-1 text-xs rounded border" style={{ background: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-text)' }} />
                <div className="mt-2 flex gap-2 justify-end">
                  <button onClick={() => setNewEdge(null)} className="text-xs px-3 py-1.5 rounded" style={{ color: 'var(--c-text-3)' }}>Cancelar</button>
                  <button onClick={saveEdge} className="text-xs px-3 py-1.5 rounded" style={{ background: '#6C3BFF', color: '#FAFBFF' }}>Guardar</button>
                </div>
              </div>
            )}

            {data.edges.length === 0 && <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Sin edges declarativos. Por default todos los pares están permitidos.</p>}
            <div className="space-y-1.5">
              {data.edges.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm" style={{
                  background: 'var(--c-surface)',
                  border: `1px solid ${e.enabled ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                }}>
                  {e.enabled ? <Check size={14} style={{ color: '#4ade80' }} /> : <Ban size={14} style={{ color: '#f87171' }} />}
                  <span className="font-mono" style={{ color: '#9B6DFF' }}>{e.from_meerkat}</span>
                  <ArrowRight size={12} style={{ color: 'var(--c-text-3)' }} />
                  <span className="font-mono" style={{ color: '#9B6DFF' }}>{e.to_meerkat}</span>
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{e.tool_name ?? 'todos'}</span>
                  {e.portal_email && <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>· {e.portal_email}</span>}
                  {e.reason && <span className="text-xs flex-1" style={{ color: 'var(--c-text-3)' }}>· {e.reason}</span>}
                  <button onClick={() => toggleEdge(e)} className="text-xs px-2 py-1 rounded" style={{ color: e.enabled ? '#f87171' : '#4ade80', border: `1px solid ${e.enabled ? '#f87171' : '#4ade80'}` }}>
                    {e.enabled ? 'Deshabilitar' : 'Habilitar'}
                  </button>
                  <button onClick={() => deleteEdge(e.id)} className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Recent */}
          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text)' }}>Handoffs recientes ({data.recent.length})</h2>
            <div className="rounded border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {data.recent.length === 0 && <p className="p-4 text-xs text-center" style={{ color: 'var(--c-text-3)' }}>Sin handoffs.</p>}
              {data.recent.map((l, i) => (
                <div key={i} className="flex items-baseline gap-3 px-4 py-2 text-xs" style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                  <span className="font-mono flex-shrink-0" style={{ color: 'var(--c-text-3)', minWidth: '95px' }}>{fmt(l.handoff_at)}</span>
                  <span className="font-mono flex-shrink-0" style={{ color: '#9B6DFF' }}>{l.from_meerkat} → {l.to_meerkat}</span>
                  <span style={{ color: 'var(--c-text-3)' }}>{l.tool_name}</span>
                  <span style={{ color: l.outcome === 'success' ? '#4ade80' : l.outcome === 'rejected' ? '#facc15' : '#f87171' }}>{l.outcome}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
