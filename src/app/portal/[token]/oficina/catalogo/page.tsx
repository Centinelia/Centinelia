'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, BookOpen, CheckCircle, Loader2, RefreshCw, Users } from 'lucide-react';

// Config del pack cloud_catalog. Antes vivía en StorageSection (org-level).
// Post 2026-09-04: Dropbox/Drive/OneDrive son per-agent. Esta página edita
// la config compartida a nivel org (ruta + columnas). El lookup en tiempo de
// tool usa el storage del meerkat que ejecuta (con fallback a legacy).
// Ver .brain/decisions/2026-09-04-integraciones-per-agent-vs-org-level.md.

type Provider = 'dropbox' | 'google' | 'microsoft';

interface Config {
  provider:     Provider;
  doc_path:     string;
  sku_column:   string;
  desc_column:  string;
  price_column: string | null;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  dropbox:   'Dropbox',
  google:    'Google Drive',
  microsoft: 'OneDrive',
};

export default function CatalogoConfigPage() {
  const { token } = useParams<{ token: string }>();

  const [enabled,        setEnabled]        = useState(false);
  const [config,         setConfig]         = useState<Config | null>(null);
  const [provider,       setProvider]       = useState<Provider>('dropbox');
  const [docPath,        setDocPath]        = useState('');
  const [skuCol,         setSkuCol]         = useState('');
  const [descCol,        setDescCol]        = useState('');
  const [priceCol,       setPriceCol]       = useState('');
  const [headers,        setHeaders]        = useState<string[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [message,        setMessage]        = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/portal/${token}/catalog`);
      const data = await res.json();
      setEnabled(!!data.enabled);
      if (data.config) {
        setConfig(data.config);
        setProvider(data.config.provider ?? 'dropbox');
        setDocPath(data.config.doc_path ?? '');
        setSkuCol(data.config.sku_column ?? '');
        setDescCol(data.config.desc_column ?? '');
        setPriceCol(data.config.price_column ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function loadHeaders() {
    setError(null); setMessage(null);
    if (!docPath.trim()) { setError('Ingresa la ruta o ID del documento.'); return; }
    if (provider === 'dropbox' && !docPath.startsWith('/')) {
      setError('Para Dropbox la ruta debe iniciar con / (ej. /Catalogo/codigos.xlsx)');
      return;
    }
    setLoadingHeaders(true);
    try {
      const res = await fetch(`/api/portal/${token}/catalog/columns`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider, doc_path: docPath.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error cargando columnas'); setHeaders([]); }
      else { setHeaders(data.headers ?? []); setMessage(`Se detectaron ${(data.headers ?? []).length} columnas.`); }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingHeaders(false);
    }
  }

  async function saveConfig() {
    setError(null); setMessage(null);
    if (!docPath || !skuCol || !descCol) {
      setError('Ruta, columna SKU y columna descripción son requeridas.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/catalog`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          provider,
          doc_path:     docPath.trim(),
          sku_column:   skuCol,
          desc_column:  descCol,
          price_column: priceCol || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Error guardando configuración');
      else { setConfig(data.config); setMessage('Configuración guardada.'); }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8" style={{ color: '#6B6480' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-[22px] font-bold tracking-tight mb-2" style={{ color: '#1A0A3B' }}>
          Catálogo de códigos
        </h1>
        <p className="text-sm mb-6" style={{ color: '#6B6480' }}>
          Este módulo aún no está activo en tu cuenta.
        </p>
        <div
          className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs"
          style={{ background: 'rgba(108,59,255,0.05)', color: '#1A0A3B', border: '1px solid rgba(108,59,255,0.16)' }}
        >
          <BookOpen size={14} style={{ flexShrink: 0, marginTop: 2, color: '#9B6DFF' }} />
          <span>Contacta a Centinelia para activar el pack <b>cloud_catalog</b>. Permite que tus empleados busquen códigos de producto directamente en el Excel/CSV que ya usas en Dropbox, Drive u OneDrive.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight mb-2" style={{ color: '#1A0A3B' }}>
          Catálogo de códigos
        </h1>
        <p className="text-sm" style={{ color: '#6B6480' }}>
          Configura el archivo Excel o CSV que tus empleados consultan para responder preguntas sobre precios y descripciones de producto por código o SKU.
        </p>
      </div>

      <div
        className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs"
        style={{ background: 'rgba(108,59,255,0.05)', color: '#1A0A3B', border: '1px solid rgba(108,59,255,0.16)' }}
      >
        <Users size={13} style={{ flexShrink: 0, marginTop: 2, color: '#9B6DFF' }} />
        <span>
          Cada empleado que use el catálogo debe tener conectada su propia cuenta de {PROVIDER_LABEL[provider]} desde su ficha en <b>Empleados → Configurar → Almacenamiento en la nube</b>. El archivo puede estar compartido entre varios empleados.
        </span>
      </div>

      <div
        className="rounded-xl p-5"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: '#1A0A3B' }}>Proveedor</label>
            <select
              value={provider}
              onChange={e => { setProvider(e.target.value as Provider); setHeaders([]); setDocPath(''); }}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            >
              <option value="dropbox">Dropbox</option>
              <option value="google">Google Drive</option>
              <option value="microsoft">OneDrive</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium block mb-1" style={{ color: '#1A0A3B' }}>
              {provider === 'dropbox' ? 'Ruta del archivo (ej. /Catalogo/codigos.xlsx)' : 'ID del archivo'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={docPath}
                onChange={e => setDocPath(e.target.value)}
                placeholder={provider === 'dropbox' ? '/Catalogo/codigos.xlsx' : 'fileId'}
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
              />
              <button
                onClick={loadHeaders}
                disabled={loadingHeaders || !docPath}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}
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
              <label className="text-xs font-medium block mb-1" style={{ color: '#1A0A3B' }}>SKU</label>
              <select value={skuCol} onChange={e => setSkuCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                <option value="">Elige columna...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#1A0A3B' }}>Descripción</label>
              <select value={descCol} onChange={e => setDescCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                <option value="">Elige columna...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#1A0A3B' }}>Precio (opcional)</label>
              <select value={priceCol} onChange={e => setPriceCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                <option value="">Sin precio</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        )}

        {message && (
          <div className="flex items-center gap-2 text-xs mb-2" style={{ color: '#22c55e' }}>
            <CheckCircle size={12} /> {message}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 text-xs mb-2" style={{ color: '#ef4444' }}>
            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
          </div>
        )}

        {headers.length > 0 && (
          <button
            onClick={saveConfig}
            disabled={saving || !skuCol || !descCol}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#ffffff' }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Guardar configuración
          </button>
        )}

        {config && headers.length === 0 && (
          <div className="mt-4 pt-4 text-xs" style={{ color: '#6B6480', borderTop: '1px solid #F0EDF9' }}>
            <p className="mb-1"><b>Configuración actual:</b></p>
            <p><span style={{ color: '#9B8FB5' }}>Proveedor:</span> {PROVIDER_LABEL[config.provider]}</p>
            <p><span style={{ color: '#9B8FB5' }}>Archivo:</span> <code>{config.doc_path}</code></p>
            <p><span style={{ color: '#9B8FB5' }}>SKU:</span> {config.sku_column} · <span style={{ color: '#9B8FB5' }}>Desc:</span> {config.desc_column}{config.price_column ? ` · Precio: ${config.price_column}` : ''}</p>
            <p className="mt-2 text-[11px]" style={{ color: '#9B8FB5' }}>
              Presiona <b>Cargar columnas</b> arriba para volver a editar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
