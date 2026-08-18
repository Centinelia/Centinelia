'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, Trash2, BookOpen, RefreshCw } from 'lucide-react';

interface DropboxStatus {
  connected:     boolean;
  email?:        string;
  needs_reauth?: boolean;
}

interface CatalogConfig {
  doc_path:     string;
  sku_column:   string;
  desc_column:  string;
  price_column?: string | null;
}

const DBLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
    <path d="M12 4l12 8-12 8-12-8 12-8z" fill="#0061FF" transform="translate(0 2)" />
    <path d="M36 4l12 8-12 8-12-8 12-8z" fill="#0061FF" transform="translate(0 2)" />
    <path d="M12 20l12 8-12 8-12-8 12-8z" fill="#0061FF" transform="translate(0 2)" />
    <path d="M36 20l12 8-12 8-12-8 12-8z" fill="#0061FF" transform="translate(0 2)" />
    <path d="M12 36l12 8 12-8v-6l-12 8-12-8v6z" fill="#0061FF" transform="translate(0 -2)" />
  </svg>
);

export default function DropboxSection({ token }: { token: string }) {
  const [status,        setStatus]        = useState<DropboxStatus | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // Catalog config state
  const [catalogEnabled, setCatalogEnabled] = useState(false);
  const [config,         setConfig]         = useState<CatalogConfig | null>(null);
  const [docPath,        setDocPath]        = useState('');
  const [headers,        setHeaders]        = useState<string[]>([]);
  const [skuCol,         setSkuCol]         = useState('');
  const [descCol,        setDescCol]        = useState('');
  const [priceCol,       setPriceCol]       = useState('');
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [savingConfig,   setSavingConfig]   = useState(false);
  const [message,        setMessage]        = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [statusRes, configRes] = await Promise.all([
        fetch(`/api/portal/${token}/dropbox-oauth`).then(r => r.json()),
        fetch(`/api/portal/${token}/dropbox-catalog`).then(r => r.json()),
      ]);
      setStatus(statusRes);
      setCatalogEnabled(!!configRes.enabled);
      if (configRes.config) {
        setConfig(configRes.config);
        setDocPath(configRes.config.doc_path ?? '');
        setSkuCol(configRes.config.sku_column ?? '');
        setDescCol(configRes.config.desc_column ?? '');
        setPriceCol(configRes.config.price_column ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function disconnect() {
    if (!confirm('¿Desconectar Dropbox?')) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/portal/${token}/dropbox-oauth`, { method: 'DELETE' });
      setStatus({ connected: false });
      setHeaders([]);
    } finally {
      setDisconnecting(false);
    }
  }

  async function loadHeaders() {
    setError(null);
    setMessage(null);
    if (!docPath.trim() || !docPath.startsWith('/')) {
      setError('La ruta debe iniciar con / (ej. /Catalogo/codigos.xlsx)');
      return;
    }
    setLoadingHeaders(true);
    try {
      const res = await fetch(`/api/portal/${token}/dropbox-catalog/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_path: docPath.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error cargando columnas');
        setHeaders([]);
      } else {
        setHeaders(data.headers ?? []);
        setMessage(`Se detectaron ${(data.headers ?? []).length} columnas.`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingHeaders(false);
    }
  }

  async function saveConfig() {
    setError(null);
    setMessage(null);
    if (!docPath || !skuCol || !descCol) {
      setError('Ruta, columna SKU y columna descripción son requeridas.');
      return;
    }
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/portal/${token}/dropbox-catalog`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_path: docPath.trim(),
          sku_column: skuCol,
          desc_column: descCol,
          price_column: priceCol || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error guardando configuración');
      } else {
        setConfig(data.config);
        setMessage('Configuración guardada.');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingConfig(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: 'var(--c-text-3)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Provider card */}
      <div className="rounded-xl p-4"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
            <DBLogo />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                Dropbox
              </span>
              {status?.connected && !status.needs_reauth && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,97,255,0.1)', color: '#0061FF', border: '1px solid rgba(0,97,255,0.25)' }}>
                  <CheckCircle size={10} /> Conectado
                </span>
              )}
              {status?.needs_reauth && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                  Reconectar
                </span>
              )}
            </div>
            {status?.connected ? (
              <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--c-text-2)' }}>
                {status.email}
              </p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                Consulta el catálogo del cliente para llenar OCs, cotizaciones y facturas
              </p>
            )}
          </div>

          <div className="flex-shrink-0">
            {status?.connected ? (
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
                style={{ color: 'var(--c-text-3)' }}
                title="Desconectar"
              >
                {disconnecting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Trash2 size={14} />}
              </button>
            ) : (
              <a
                href={`/api/portal/${token}/dropbox-oauth/connect`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: '#0061FF', color: '#fff', textDecoration: 'none' }}
              >
                Conectar
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Catalog config — solo si conectado + feature activada */}
      {status?.connected && catalogEnabled && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-3"
            style={{ color: 'var(--c-text-4)' }}>
            Catálogo de códigos
          </p>

          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-text-2)' }}>
            Ruta del archivo en Dropbox
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={docPath}
              onChange={e => setDocPath(e.target.value)}
              placeholder="/Catalogo/codigos.xlsx"
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            <button
              onClick={loadHeaders}
              disabled={loadingHeaders || !docPath}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
            >
              {loadingHeaders ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Cargar columnas
            </button>
          </div>

          {headers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-text-2)' }}>SKU</label>
                <select value={skuCol} onChange={e => setSkuCol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
                  <option value="">Elige columna...</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-text-2)' }}>Descripción</label>
                <select value={descCol} onChange={e => setDescCol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
                  <option value="">Elige columna...</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-text-2)' }}>Precio (opcional)</label>
                <select value={priceCol} onChange={e => setPriceCol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
                  <option value="">Sin precio</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          )}

          {message && <p className="text-xs mb-2" style={{ color: '#22c55e' }}>{message}</p>}
          {error   && <p className="text-xs mb-2" style={{ color: '#ef4444' }}>{error}</p>}

          {headers.length > 0 && (
            <button
              onClick={saveConfig}
              disabled={savingConfig || !skuCol || !descCol}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: '#0061FF', color: '#fff' }}
            >
              {savingConfig && <Loader2 size={12} className="animate-spin" />}
              Guardar configuración
            </button>
          )}

          {config && !headers.length && (
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
              Configuración actual: <b>{config.doc_path}</b> · SKU: {config.sku_column} · Desc: {config.desc_column}
              {config.price_column ? ` · Precio: ${config.price_column}` : ''}
            </p>
          )}
        </div>
      )}

      {status?.connected && !catalogEnabled && (
        <div className="rounded-xl p-3 text-xs"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
          Dropbox está conectado. El pack Catálogo aún no está activo para tu cuenta. Contacta a soporte para activarlo.
        </div>
      )}

      {/* Capability callout */}
      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
        <p className="px-3 pt-2.5 pb-2 text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border)' }}>
          Tu empleado puede
        </p>
        <div className="flex flex-col gap-1.5 px-3 py-3">
          {[
            'Consultar códigos de pieza al armar órdenes de compra',
            'Buscar SKU y descripciones antes de generar cotizaciones',
            'Detectar el precio del catálogo al facturar',
            'Trabajar siempre con la versión más reciente del archivo',
          ].map(cap => (
            <div key={cap} className="flex items-center gap-2">
              <BookOpen size={10} style={{ color: '#0061FF', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{cap}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
