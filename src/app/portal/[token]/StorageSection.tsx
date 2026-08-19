'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, Trash2, BookOpen, RefreshCw, Cloud } from 'lucide-react';

// Estado unificado de los 3 providers de almacenamiento en la nube.
// Drive y OneDrive vienen "gratis" al conectar Gmail/Outlook (mismo OAuth).
// Dropbox es OAuth separado.

interface ProviderState {
  connected: boolean;
  email?:    string;
  via?:      string;  // 'gmail' | 'outlook' | 'dropbox' — qué OAuth lo activó
}

interface StorageStatus {
  google:    ProviderState;
  microsoft: ProviderState;
  dropbox:   ProviderState & { needs_reauth?: boolean };
}

type CatalogProvider = 'dropbox' | 'google' | 'microsoft';

interface CatalogConfig {
  provider:    CatalogProvider;
  doc_path:    string;
  sku_column:  string;
  desc_column: string;
  price_column?: string | null;
}

const DBLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
    <path d="M12 6l12 8-12 8L0 14l12-8z" fill="#0061FF" />
    <path d="M36 6l12 8-12 8-12-8 12-8z" fill="#0061FF" />
    <path d="M12 22l12 8-12 8L0 30l12-8z" fill="#0061FF" />
    <path d="M36 22l12 8-12 8-12-8 12-8z" fill="#0061FF" />
  </svg>
);

const DriveLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
    <path d="M6 38h36l-6-10H12L6 38z" fill="#FBBC04" />
    <path d="M24 4h12L24 24H12L24 4z" fill="#4285F4" />
    <path d="M4 38l8-14L24 4 12 24 6 38H4z" fill="#34A853" />
  </svg>
);

const OneDriveLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
    <path d="M12 22a8 8 0 0116 0" fill="none" stroke="#0078D4" strokeWidth="3" />
    <ellipse cx="24" cy="30" rx="20" ry="8" fill="#0078D4" />
  </svg>
);

export default function StorageSection({ token }: { token: string }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnectingDbx, setDisconnectingDbx] = useState(false);

  // Catalog state
  const [catalogEnabled, setCatalogEnabled] = useState(false);
  const [config,         setConfig]         = useState<CatalogConfig | null>(null);
  const [provider,       setProvider]       = useState<CatalogProvider>('dropbox');
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
      const [emailRes, dbxRes, catRes] = await Promise.all([
        fetch(`/api/portal/${token}/email-oauth`).then(r => r.json()).catch(() => ({ integrations: [] })),
        fetch(`/api/portal/${token}/dropbox-oauth`).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`/api/portal/${token}/catalog`).then(r => r.json()).catch(() => ({ enabled: false, config: null })),
      ]);
      const emails = (emailRes.integrations ?? []) as Array<{ provider: string; email?: string }>;
      const gmail   = emails.find(e => e.provider === 'gmail');
      const outlook = emails.find(e => e.provider === 'outlook');
      setStatus({
        google:    { connected: !!gmail,   email: gmail?.email,   via: 'gmail'   },
        microsoft: { connected: !!outlook, email: outlook?.email, via: 'outlook' },
        dropbox:   { connected: !!dbxRes.connected, email: dbxRes.email, via: 'dropbox', needs_reauth: dbxRes.needs_reauth },
      });
      setCatalogEnabled(!!catRes.enabled);
      if (catRes.config) {
        setConfig(catRes.config);
        setProvider(catRes.config.provider ?? 'dropbox');
        setDocPath(catRes.config.doc_path ?? '');
        setSkuCol(catRes.config.sku_column ?? '');
        setDescCol(catRes.config.desc_column ?? '');
        setPriceCol(catRes.config.price_column ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function disconnectDropbox() {
    if (!confirm('¿Desconectar Dropbox?')) return;
    setDisconnectingDbx(true);
    try {
      await fetch(`/api/portal/${token}/dropbox-oauth`, { method: 'DELETE' });
      setStatus(s => s ? { ...s, dropbox: { connected: false } } : s);
      setHeaders([]);
    } finally {
      setDisconnectingDbx(false);
    }
  }

  async function loadHeaders() {
    setError(null);
    setMessage(null);
    if (!docPath.trim()) {
      setError('Ingresa el path o ID del documento.');
      return;
    }
    if (provider === 'dropbox' && !docPath.startsWith('/')) {
      setError('Para Dropbox el path debe iniciar con / (ej. /Catalogo/codigos.xlsx)');
      return;
    }
    setLoadingHeaders(true);
    try {
      const res = await fetch(`/api/portal/${token}/catalog/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, doc_path: docPath.trim() }),
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
      setError('Path, columna SKU y columna descripción son requeridas.');
      return;
    }
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/portal/${token}/catalog`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
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

  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: 'var(--c-text-3)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  const connectedProviders: Array<{ id: CatalogProvider; label: string }> = [];
  if (status.dropbox.connected)   connectedProviders.push({ id: 'dropbox',   label: 'Dropbox' });
  if (status.google.connected)    connectedProviders.push({ id: 'google',    label: 'Google Drive' });
  if (status.microsoft.connected) connectedProviders.push({ id: 'microsoft', label: 'OneDrive' });

  return (
    <div className="flex flex-col gap-4">

      {/* ── Providers row ─────────────────────────────────────────────── */}
      <div className="rounded-xl p-4"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        <p className="text-[10px] font-semibold tracking-widest uppercase mb-3"
          style={{ color: 'var(--c-text-4)' }}>
          Servicios conectados
        </p>

        {/* Google Drive */}
        <ProviderRow
          logo={<DriveLogo />}
          name="Google Drive"
          hint="Se conecta con tu cuenta Gmail"
          state={status.google}
        />

        {/* OneDrive */}
        <ProviderRow
          logo={<OneDriveLogo />}
          name="OneDrive"
          hint="Se conecta con tu cuenta Outlook"
          state={status.microsoft}
        />

        {/* Dropbox */}
        <ProviderRow
          logo={<DBLogo />}
          name="Dropbox"
          hint="Conexión independiente"
          state={status.dropbox}
          connectHref={`/api/portal/${token}/dropbox-oauth/connect`}
          onDisconnect={disconnectDropbox}
          disconnecting={disconnectingDbx}
        />
      </div>

      {/* ── Catálogo config (si feature activo + hay al menos 1 provider) ── */}
      {catalogEnabled && connectedProviders.length > 0 && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-3"
            style={{ color: 'var(--c-text-4)' }}>
            Catálogo de códigos
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-text-2)' }}>Proveedor</label>
              <select value={provider} onChange={e => { setProvider(e.target.value as CatalogProvider); setHeaders([]); }}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
                {connectedProviders.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-text-2)' }}>
                {provider === 'dropbox' ? 'Ruta del archivo (ej. /Catalogo/codigos.xlsx)' : 'ID del archivo'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={docPath}
                  onChange={e => setDocPath(e.target.value)}
                  placeholder={provider === 'dropbox' ? '/Catalogo/codigos.xlsx' : 'fileId'}
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
            </div>
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
              style={{ background: '#6C3BFF', color: '#fff' }}
            >
              {savingConfig && <Loader2 size={12} className="animate-spin" />}
              Guardar configuración
            </button>
          )}

          {config && !headers.length && (
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
              Configuración actual: <b>{config.provider}</b> · <code>{config.doc_path}</code> · SKU: {config.sku_column} · Desc: {config.desc_column}
              {config.price_column ? ` · Precio: ${config.price_column}` : ''}
            </p>
          )}
        </div>
      )}

      {!catalogEnabled && connectedProviders.length > 0 && (
        <div className="rounded-xl p-3 text-xs"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
          Almacenamiento conectado. El pack Catálogo de códigos aún no está activo para tu cuenta. Contacta a soporte para activarlo.
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
            'Buscar y leer archivos, subir documentos, organizar carpetas',
            'Trabajar siempre con la versión más reciente de tu catálogo',
          ].map(cap => (
            <div key={cap} className="flex items-center gap-2">
              <BookOpen size={10} style={{ color: '#6C3BFF', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{cap}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderRow({ logo, name, hint, state, connectHref, onDisconnect, disconnecting }: {
  logo: React.ReactNode;
  name: string;
  hint: string;
  state: { connected: boolean; email?: string; needs_reauth?: boolean };
  connectHref?: string;
  onDisconnect?: () => void;
  disconnecting?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--c-border)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{name}</span>
          {state.connected && !state.needs_reauth && (
            <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
              <CheckCircle size={10} /> Conectado
            </span>
          )}
          {state.needs_reauth && (
            <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              Reconectar
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: state.connected ? 'var(--c-text-2)' : 'var(--c-text-3)' }}>
          {state.connected ? state.email : hint}
        </p>
      </div>
      <div className="flex-shrink-0">
        {state.connected && onDisconnect ? (
          <button
            onClick={onDisconnect}
            disabled={disconnecting}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
            style={{ color: 'var(--c-text-3)' }}
            title="Desconectar"
          >
            {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        ) : connectHref ? (
          <a
            href={connectHref}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#0061FF', color: '#fff', textDecoration: 'none' }}
          >
            Conectar
          </a>
        ) : null}
      </div>
    </div>
  );
}

export { Cloud };  // re-export para uso en IntegrationsHub row icon
