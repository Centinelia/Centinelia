'use client';

import { useState } from 'react';
import { Check, GitMerge, Plus, Trash2, X } from 'lucide-react';
import type { CommsRoutingConfig, CommsRoute } from '@/lib/comms/routing';

interface Props {
  token:   string;
  initial: CommsRoutingConfig;
}

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

export default function CommsRoutingEditor({ token, initial }: Props) {
  const [open,   setOpen]   = useState(false);
  const [cfg,    setCfg]    = useState<CommsRoutingConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // per-route keyword input state
  const [newKw, setNewKw] = useState<Record<string, string>>({});

  const enabledCount = cfg.routes.filter(r => r.forward_to.length > 0).length;

  function updateRoute(id: string, patch: Partial<CommsRoute>) {
    setCfg(c => ({ ...c, routes: c.routes.map(r => r.id === id ? { ...r, ...patch } : r) }));
  }

  function removeRoute(id: string) {
    setCfg(c => ({
      ...c,
      routes:           c.routes.filter(r => r.id !== id),
      default_route_id: c.default_route_id === id ? null : c.default_route_id,
    }));
  }

  function addRoute() {
    const id  = genId();
    const route: CommsRoute = { id, label: '', keywords: [], forward_to: [], response_sla_hours: 48 };
    setCfg(c => ({ ...c, routes: [...c.routes, route] }));
  }

  function addKeyword(routeId: string) {
    const kw = (newKw[routeId] ?? '').trim();
    if (!kw) return;
    updateRoute(routeId, {
      keywords: [...(cfg.routes.find(r => r.id === routeId)?.keywords ?? []), kw],
    });
    setNewKw(k => ({ ...k, [routeId]: '' }));
  }

  function removeKeyword(routeId: string, kw: string) {
    updateRoute(routeId, {
      keywords: (cfg.routes.find(r => r.id === routeId)?.keywords ?? []).filter(k => k !== kw),
    });
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ comms_routing: cfg }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-surface-2)]"
        style={{ background: 'var(--c-surface)' }}
      >
        <div className="flex items-center gap-2">
          <GitMerge size={13} style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>Ruteo de comunicados</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: cfg.enabled ? 'rgba(34,197,94,0.1)' : 'var(--c-bg)',
              color:      cfg.enabled ? '#22c55e' : 'var(--c-text-4)',
              border:     `1px solid ${cfg.enabled ? 'rgba(34,197,94,0.2)' : 'var(--c-border)'}`,
            }}
          >
            {cfg.enabled ? `Activo · ${enabledCount} ruta${enabledCount !== 1 ? 's' : ''}` : 'Desactivado'}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-5" style={{ background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)' }}>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            Clasifica correos entrantes por palabras clave y reenvíalos automáticamente al área correspondiente. También envía un acuse de recibo al remitente.
          </p>

          {/* Enable toggle */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>Ruteo automático</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>Activar para procesar correos entrantes</p>
            </div>
            <button
              onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
              className="relative flex-shrink-0 rounded-full transition-colors"
              style={{ width: 36, height: 20, background: cfg.enabled ? '#6C3BFF' : 'var(--c-border)' }}
            >
              <span className="absolute top-0.5 rounded-full transition-all"
                style={{ width: 16, height: 16, background: '#fff', left: cfg.enabled ? 18 : 2 }} />
            </button>
          </div>

          {/* Sender name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>Nombre del remitente (acuse)</label>
            <input
              type="text"
              value={cfg.sender_name}
              onChange={e => setCfg(c => ({ ...c, sender_name: e.target.value }))}
              placeholder="Comunicación Social"
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
            />
          </div>

          {/* Routes */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>Rutas de clasificación</p>
            {cfg.routes.length === 0 && (
              <p className="text-xs italic" style={{ color: 'var(--c-text-4)' }}>Aún no hay rutas. Agrega una para empezar.</p>
            )}
            {cfg.routes.map(route => (
              <div key={route.id} className="flex flex-col gap-2 p-3 rounded-xl"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                {/* Route header */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={route.label}
                    onChange={e => updateRoute(route.id, { label: e.target.value })}
                    placeholder="Nombre del área (ej: Prensa y medios)"
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                  />
                  <button onClick={() => removeRoute(route.id)} className="p-1.5 rounded-lg hover:opacity-70">
                    <Trash2 size={12} style={{ color: '#ef4444' }} />
                  </button>
                </div>

                {/* Forward-to email */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium" style={{ color: 'var(--c-text-4)' }}>Reenviar a (email del área)</label>
                  <input
                    type="email"
                    value={route.forward_to[0] ?? ''}
                    onChange={e => updateRoute(route.id, { forward_to: e.target.value ? [e.target.value] : [] })}
                    placeholder="area@municipio.gob.mx"
                    className="px-2.5 py-1.5 rounded-lg text-xs"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </div>

                {/* SLA hours */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-medium" style={{ color: 'var(--c-text-4)' }}>Plazo de respuesta</label>
                  <div className="flex gap-1.5">
                    {[24, 48, 72].map(h => (
                      <button key={h} onClick={() => updateRoute(route.id, { response_sla_hours: h })}
                        className="px-2 py-1 rounded-md text-[11px] transition-all"
                        style={{
                          background: route.response_sla_hours === h ? 'rgba(108,59,255,0.15)' : 'var(--c-surface)',
                          border:     route.response_sla_hours === h ? '1px solid rgba(108,59,255,0.4)' : '1px solid var(--c-border)',
                          color:      route.response_sla_hours === h ? '#9B6DFF' : 'var(--c-text-3)',
                        }}>
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keywords */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium" style={{ color: 'var(--c-text-4)' }}>Palabras clave (activan esta ruta)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {route.keywords.map(kw => (
                      <span key={kw} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.2)', color: '#9B6DFF' }}>
                        {kw}
                        <button onClick={() => removeKeyword(route.id, kw)}><X size={9} /></button>
                      </span>
                    ))}
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newKw[route.id] ?? ''}
                        onChange={e => setNewKw(k => ({ ...k, [route.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addKeyword(route.id); }}
                        placeholder="+ palabra clave"
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--c-surface)', border: '1px dashed var(--c-border-2)', color: 'var(--c-text-2)', outline: 'none', width: 110 }}
                      />
                      {(newKw[route.id] ?? '').trim() && (
                        <button onClick={() => addKeyword(route.id)}
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: '#6C3BFF', color: '#fff' }}>
                          <Plus size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Default route */}
                <div className="flex items-center gap-2 mt-0.5">
                  <input
                    type="checkbox"
                    id={`default-${route.id}`}
                    checked={cfg.default_route_id === route.id}
                    onChange={e => setCfg(c => ({ ...c, default_route_id: e.target.checked ? route.id : null }))}
                    style={{ accentColor: '#6C3BFF' }}
                  />
                  <label htmlFor={`default-${route.id}`} className="text-[11px] cursor-pointer" style={{ color: 'var(--c-text-4)' }}>
                    Ruta por defecto (para correos sin coincidencia)
                  </label>
                </div>
              </div>
            ))}

            <button onClick={addRoute}
              className="self-start flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
              style={{ border: '1px dashed var(--c-border-2)', color: 'var(--c-text-3)' }}>
              <Plus size={13} /> Nueva ruta
            </button>
          </div>

          {/* Acknowledgment template */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Plantilla de acuse de recibo</label>
              <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                Variables: {['{nombre}', '{asunto}', '{fecha}', '{departamento}', '{horas}', '{remitente}'].join(', ')}
              </span>
            </div>
            <textarea
              value={cfg.acknowledgment_template}
              onChange={e => setCfg(c => ({ ...c, acknowledgment_template: e.target.value }))}
              rows={8}
              className="w-full text-xs px-3 py-2.5 rounded-lg resize-y font-mono"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none', lineHeight: 1.6 }}
            />
          </div>

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
