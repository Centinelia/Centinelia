'use client';

/**
 * PlantillasGrid — grilla de plantillas de Canva con botón de sincronización.
 * Componente client para manejar el botón "Sincronizar desde Canva" interactivo.
 */
import { useState } from 'react';
import { RefreshCw, LayoutTemplate, ExternalLink } from 'lucide-react';

interface BrandTemplate {
  id:            string;
  name:          string;
  category:      string;
  thumbnail_url: string | null;
  created_at:    string;
}

interface Props {
  token:             string;
  naviId:            string;
  initialTemplates:  BrandTemplate[];
}

const CATEGORY_LABELS: Record<string, string> = {
  post:      'Publicación',
  reel:      'Reel',
  story:     'Historia',
  carousel:  'Carrusel',
};

export default function PlantillasGrid({ token, naviId, initialTemplates }: Props) {
  const [templates, setTemplates] = useState<BrandTemplate[]>(initialTemplates);
  const [syncing,   setSyncing]   = useState(false);
  const [syncMsg,   setSyncMsg]   = useState<string | null>(null);
  const [syncErr,   setSyncErr]   = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    setSyncErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/social/templates/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agent_id: naviId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const json = await res.json();
      // Si la respuesta trae templates actualizados, usarlos
      if (json.data?.templates) {
        setTemplates(json.data.templates as BrandTemplate[]);
      }
      setSyncMsg(`Sincronización completada. ${json.data?.synced ?? 0} plantillas importadas.`);
    } catch (err) {
      setSyncErr(err instanceof Error ? err.message : 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de acciones */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px]" style={{ color: '#6B6480' }}>
            {templates.length} {templates.length === 1 ? 'plantilla disponible' : 'plantillas disponibles'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#F3F0FF', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
          >
            <RefreshCw size={12} strokeWidth={2} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar desde Canva'}
          </button>
          {syncMsg && <p className="text-[11px]" style={{ color: '#15803D' }}>{syncMsg}</p>}
          {syncErr && <p className="text-[11px]" style={{ color: '#B91C1C' }}>{syncErr}</p>}
        </div>
      </div>

      {/* Grilla */}
      {templates.length === 0 ? (
        <div
          className="rounded-xl flex flex-col items-center gap-3 py-14"
          style={{ background: '#F8F7FF', border: '1px dashed rgba(108,59,255,0.25)' }}
        >
          <LayoutTemplate size={28} style={{ color: '#6C3BFF', opacity: 0.4 }} />
          <p className="text-[14px] font-medium" style={{ color: '#1A0A3B' }}>
            Sin plantillas aún
          </p>
          <p className="text-[12px] text-center" style={{ color: '#6B6480' }}>
            Sincroniza desde Canva para importar tus diseños de marca.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {templates.map(t => (
            <div
              key={t.id}
              className="rounded-xl overflow-hidden flex flex-col"
              style={{ border: '1px solid #E8E3F5', background: '#fff' }}
            >
              {/* Thumbnail */}
              <div className="h-36 overflow-hidden" style={{ background: '#F3F0FF' }}>
                {t.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.thumbnail_url}
                    alt={t.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <LayoutTemplate size={24} style={{ color: '#6C3BFF', opacity: 0.4 }} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="px-3 py-2.5 flex flex-col gap-1.5">
                <p className="text-[12px] font-medium truncate" style={{ color: '#1A0A3B' }} title={t.name}>
                  {t.name}
                </p>
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}
                  >
                    {CATEGORY_LABELS[t.category] ?? t.category}
                  </span>
                  <ExternalLink size={11} style={{ color: '#6B6480', opacity: 0.6 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
