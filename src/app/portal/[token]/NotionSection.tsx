'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { Database, ExternalLink, Loader2, RefreshCw, Unlink, CheckCircle2, ShoppingBag } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NotionStatus {
  connected:       boolean;
  workspace_name:  string | null;
  db_id:           string | null;
  products_db_id:  string | null;
  pages:           { id: string; title: string }[];
}

export default function NotionSection({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const flash = searchParams.get('notion'); // 'connected' | 'error' | null

  const [status, setStatus]       = useState<NotionStatus | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selectedPage, setSelected] = useState('');
  const [saving, setSaving]             = useState(false);
  const [disconnecting, setDisco]       = useState(false);
  const [creatingProducts, setCreatingP] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [, startTransition]       = useTransition();

  async function fetchStatus() {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/${token}/notion`);
      if (r.ok) setStatus(await r.json());
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSetupDb() {
    if (!selectedPage) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/${token}/notion`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ page_id: selectedPage }),
      });
      if (!r.ok) throw new Error('Error al crear la base de datos');
      await fetchStatus();
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateProducts() {
    setCreatingP(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/${token}/notion`, { method: 'PATCH' });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error al crear el catálogo');
      await fetchStatus();
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido');
    } finally {
      setCreatingP(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Notion? Se eliminará el acceso y la configuración de base de datos.')) return;
    setDisco(true);
    setError(null);
    try {
      await fetch(`/api/portal/${token}/notion`, { method: 'DELETE' });
      setStatus({ connected: false, workspace_name: null, db_id: null, products_db_id: null, pages: [] });
    } catch {
      setError('Error al desconectar');
    } finally {
      setDisco(false);
    }
  }

  const notionOauthUrl = `/api/integrations/notion/oauth?token=${token}`;

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)' }}>
          <NotionIcon />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Notion CRM</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
            Cada llamada crea un registro automático en tu base de datos de Notion.
          </p>
        </div>
      </div>

      {/* Flash messages */}
      {flash === 'connected' && (
        <div className="mt-3 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}>
          Notion conectado correctamente.
        </div>
      )}
      {flash === 'error' && (
        <div className="mt-3 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>
          Hubo un error al conectar Notion. Intenta de nuevo.
        </div>
      )}

      {/* Body */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
            <Loader2 size={14} className="animate-spin" /> Cargando...
          </div>
        ) : !status?.connected ? (
          /* ── NOT CONNECTED ── */
          <a href={notionOauthUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: '#000', color: '#fff' }}>
            <NotionIcon white /> Conectar Notion
          </a>
        ) : !status.db_id ? (
          /* ── CONNECTED, no DB yet — pick a page ── */
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: '#22c55e' }}>
              <CheckCircle2 size={14} /> Conectado a <span className="font-semibold">{status.workspace_name}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
              Selecciona la página de Notion donde se creará la base de datos CRM:
            </p>

            {status.pages.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                No se encontraron páginas accesibles. Asegúrate de que la integración tenga acceso a al menos una página.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={selectedPage || '__none'}
                  onValueChange={v => setSelected(v === '__none' ? '' : v)}
                >
                  <SelectTrigger className="flex-1 text-xs bg-[color:var(--c-bg)] border-[color:var(--c-border-2)]">
                    <SelectValue placeholder="Elige una página..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Elige una página...</SelectItem>
                    {status.pages.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={handleSetupDb}
                  disabled={!selectedPage || saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40"
                  style={{ background: '#6C3BFF', color: '#fff' }}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
                  Crear CRM
                </button>
              </div>
            )}

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="self-start inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ color: 'var(--c-text-3)' }}>
              <Unlink size={12} /> Desconectar
            </button>
          </div>
        ) : (
          /* ── FULLY CONFIGURED ── */
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: '#22c55e' }}>
              <CheckCircle2 size={14} /> CRM activo en <span className="font-semibold">{status.workspace_name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border-2)', color: 'var(--c-text-2)' }}>
              <Database size={13} style={{ color: '#6C3BFF', flexShrink: 0 }} />
              <span className="font-mono text-xs truncate">{status.db_id}</span>
            </div>
            {status?.products_db_id ? (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#16a34a' }}>
                <ShoppingBag size={12} />
                Catálogo de productos activo (15 productos de prueba)
              </div>
            ) : (
              <button
                onClick={handleCreateProducts}
                disabled={creatingProducts}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40"
                style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}>
                {creatingProducts ? <Loader2 size={12} className="animate-spin" /> : <ShoppingBag size={12} />}
                {creatingProducts ? 'Creando catálogo...' : 'Crear catálogo de productos de prueba'}
              </button>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => { startTransition(() => {}); fetchStatus(); }}
                className="inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                style={{ color: 'var(--c-text-3)' }}>
                <RefreshCw size={12} /> Recargar
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ color: '#ef4444' }}>
                {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                Desconectar
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>{error}</p>
        )}
      </div>
    </div>
  );
}

function NotionIcon({ white }: { white?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.137 3.88 2.723 3.88 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.147 80.477c-2.333-3.11-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.17-6.8z" fill={white ? '#fff' : '#fff'} />
      <path fillRule="evenodd" clipRule="evenodd" d="M61.35.227l-55.333 4.086C1.553 4.7 0 7.617 0 11.113v61.197c0 2.723.967 5.057 3.3 8.167l13.16 16.387c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V19.64c0-2.21-.873-2.847-3.443-4.733L74.167 2.143C69.893-.963 68.147-1.357 61.35.227zM25.92 19.523c-5.277.37-6.473.45-9.477-1.98L8.293 11.39c-.777-.78-.39-1.753.98-1.947l53.1-3.887c4.467-.39 6.793 1.167 8.54 2.527l9.123 6.61c.39.19 1.363 1.363.193 1.363l-54.31 3.113v-.647zM19.7 88.757V32.217c0-2.723.777-3.5 3.3-3.89l60.097-3.5c2.33-.39 3.3.78 3.3 3.5v56.15c0 2.723-.39 5.05-3.883 5.243L23.58 92.84c-3.497.193-3.88-1.167-3.88-4.083zm57.617-54.967c.387 1.75 0 3.5-1.75 3.693l-2.91.583v42.773c-2.527 1.363-4.853 2.137-6.797 2.137-3.107 0-3.883-.973-6.21-3.887l-19.03-29.94v28.967l6.02 1.363s0 3.5-4.857 3.5l-13.39.777c-.39-.78 0-2.723 1.357-3.11l3.497-1.167V39.033L28.84 38.64c-.39-1.75.58-4.277 3.3-4.473l14.367-.97 19.8 30.327V34.4l-5.047-.583c-.39-2.143 1.163-3.7 3.103-3.89l13.954-.157z" fill={white ? 'rgba(0,0,0,0.6)' : '#000'} />
    </svg>
  );
}
