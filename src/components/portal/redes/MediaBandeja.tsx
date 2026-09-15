'use client';

/**
 * MediaBandeja — galería de archivos de media subidos por el cliente.
 *
 * Carga user_media_uploads via GET /api/portal/[token]/social/media.
 * Permite subir nuevos archivos con un selector (POST multipart
 * /api/portal/[token]/social/media/upload?agent_id=X).
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Image as ImageIcon, Video, Upload, RefreshCw, Trash2 } from 'lucide-react';

interface MediaItem {
  id:            string;
  filename:      string;
  file_url:      string;
  media_type:    string;
  file_size?:    number | null;
  status:        string;
  created_at:    string;
}

interface Props {
  token:  string;
  naviId: string;
}

function MediaCard({ item }: { item: MediaItem }) {
  const isVideo = item.media_type?.startsWith('video/') || /\.(mp4|mov|webm)/i.test(item.filename);
  const sizeKb  = item.file_size ? Math.round(item.file_size / 1024) : null;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{ border: '1px solid #E8E3F5', background: '#FAFAFF' }}
    >
      {/* Thumbnail */}
      <div
        className="h-32 flex items-center justify-center"
        style={{ background: '#F3F0FF' }}
      >
        {isVideo
          ? <Video   size={28} style={{ color: '#6C3BFF', opacity: 0.6 }} />
          : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.file_url}
              alt={item.filename}
              className="w-full h-full object-cover"
              onError={e => {
                (e.currentTarget as HTMLImageElement).replaceWith(
                  Object.assign(document.createElement('div'), {
                    className: 'flex items-center justify-center w-full h-full',
                    innerHTML: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#6C3BFF' stroke-width='1.5' opacity='0.5'><rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><path d='m21 15-5-5L5 21'/></svg>`,
                  }),
                );
              }}
            />
          )
        }
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 flex flex-col gap-1">
        <p className="text-[11px] font-medium truncate" style={{ color: '#1A0A3B' }} title={item.filename}>
          {item.filename}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: '#6B6480' }}>
            {sizeKb ? `${sizeKb > 1024 ? `${Math.round(sizeKb / 1024)} MB` : `${sizeKb} KB`}` : ''}
          </span>
          <span
            className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{
              background: item.status === 'available' ? '#F0FDF4' : '#FEF9C3',
              color:      item.status === 'available' ? '#15803D' : '#A16207',
            }}
          >
            {item.status === 'available' ? 'Disponible' : item.status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MediaBandeja({ token, naviId }: Props) {
  const [items,     setItems]     = useState<MediaItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/social/media?agent_id=${naviId}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar archivos');
    } finally {
      setLoading(false);
    }
  }, [token, naviId]);

  useEffect(() => { void loadMedia(); }, [loadMedia]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const form = new FormData();
      form.append('file', files[0]);
      form.append('agent_id', naviId);

      const res = await fetch(`/api/portal/${token}/social/media/upload`, {
        method: 'POST',
        body:   form,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      // Recargar la galería
      await loadMedia();
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2" style={{ color: '#6B6480' }}>
        <RefreshCw size={16} className="animate-spin" />
        <span className="text-[13px]">Cargando archivos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg px-4 py-3 text-[13px]" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Botón de subida */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
            Archivos de media
          </p>
          <p className="text-[11px]" style={{ color: '#6B6480' }}>
            {items.length} {items.length === 1 ? 'archivo' : 'archivos'} disponibles
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            <Upload size={12} strokeWidth={2} />
            {uploading ? 'Subiendo...' : 'Subir archivo'}
          </button>
          {uploadErr && (
            <p className="text-[10px]" style={{ color: '#B91C1C' }}>{uploadErr}</p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          aria-label="Seleccionar archivo de media"
          onChange={e => { void handleUpload(e.target.files); }}
        />
      </div>

      {/* Galería */}
      {items.length === 0 ? (
        <div
          className="rounded-xl flex flex-col items-center justify-center gap-3 py-12"
          style={{ background: '#F8F7FF', border: '1px dashed rgba(108,59,255,0.25)' }}
        >
          <div className="flex items-center gap-2" style={{ color: '#6B6480' }}>
            <ImageIcon size={20} style={{ opacity: 0.5 }} />
            <Video     size={20} style={{ opacity: 0.5 }} />
          </div>
          <p className="text-[13px] font-medium" style={{ color: '#1A0A3B' }}>
            Sin archivos aún
          </p>
          <p className="text-[12px]" style={{ color: '#6B6480' }}>
            Sube imágenes o videos para que Navi los use en publicaciones.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[12px] font-medium transition-opacity disabled:opacity-50 mt-1"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            <Upload size={12} strokeWidth={2} />
            Subir primer archivo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map(item => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
