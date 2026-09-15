/**
 * DraftPreview — presentación de un borrador de contenido.
 *
 * Componente puramente presentacional (sin fetch ni estado).
 * Muestra imagen/video, caption, hashtags y fecha programada.
 *
 * Reutilizable en BandejaAprobacion, CalendarioEditorial y sub-página
 * de interacciones.
 */
import { Image, Video, Hash, CalendarClock } from 'lucide-react';

export interface ContentDraft {
  id:             string;
  caption?:       string | null;
  hashtags?:      string[] | null;
  media_urls?:    string[] | null;
  scheduled_for?: string | null;
  status:         string;
  /** Nombre de la plantilla usada, si aplica. */
  brand_templates?: { name: string; category: string } | null;
  social_accounts?: { external_username: string } | null;
}

interface DraftPreviewProps {
  draft: ContentDraft;
  /** Controla si se muestra el badge de estado. Default: true */
  showStatus?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_approval: { label: 'Pendiente',   color: '#F59E0B' },
  approved:         { label: 'Aprobado',    color: '#10B981' },
  scheduled:        { label: 'Programado',  color: '#6C3BFF' },
  published:        { label: 'Publicado',   color: '#10B981' },
  rejected:         { label: 'Rechazado',   color: '#EF4444' },
  failed:           { label: 'Fallido',     color: '#EF4444' },
};

function MediaThumbnail({ urls }: { urls: string[] }) {
  const first = urls[0];
  const isVideo = first.match(/\.(mp4|mov|webm|avi)(\?|$)/i);

  if (isVideo) {
    return (
      <div
        className="w-full h-40 rounded-lg flex items-center justify-center relative overflow-hidden"
        style={{ background: '#1A0A3B', border: '1px solid rgba(108,59,255,0.2)' }}
      >
        <Video size={32} style={{ color: '#6C3BFF', opacity: 0.7 }} />
        <span
          className="absolute bottom-2 left-2 text-[11px] font-medium px-2 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
        >
          Video
        </span>
        {urls.length > 1 && (
          <span
            className="absolute bottom-2 right-2 text-[11px] font-medium px-2 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
          >
            +{urls.length - 1}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-40 rounded-lg overflow-hidden relative" style={{ background: '#F3F0FF' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={first}
        alt="Vista previa"
        className="w-full h-full object-cover"
        onError={e => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      {urls.length > 1 && (
        <span
          className="absolute bottom-2 right-2 text-[11px] font-medium px-2 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
        >
          +{urls.length - 1}
        </span>
      )}
    </div>
  );
}

export default function DraftPreview({ draft, showStatus = true }: DraftPreviewProps) {
  const statusInfo = STATUS_LABELS[draft.status] ?? { label: draft.status, color: '#6B6480' };
  const hasMedia   = (draft.media_urls ?? []).length > 0;
  const tags       = draft.hashtags ?? [];

  return (
    <article
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{
        background: '#FAFAFF',
        border:     '1px solid #E8E3F5',
      }}
    >
      {/* Encabezado: cuenta + estado */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium" style={{ color: '#6B6480' }}>
          {draft.social_accounts?.external_username
            ? `@${draft.social_accounts.external_username}`
            : draft.brand_templates?.name ?? 'Publicación'}
        </span>
        {showStatus && (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ background: `${statusInfo.color}18`, color: statusInfo.color, border: `1px solid ${statusInfo.color}30` }}
          >
            {statusInfo.label}
          </span>
        )}
      </div>

      {/* Vista previa de media */}
      {hasMedia && <MediaThumbnail urls={draft.media_urls!} />}

      {/* Sin media — placeholder */}
      {!hasMedia && (
        <div
          className="w-full h-24 rounded-lg flex items-center justify-center"
          style={{ background: '#F3F0FF', border: '1px dashed rgba(108,59,255,0.3)' }}
        >
          <Image size={24} style={{ color: '#6C3BFF', opacity: 0.4 }} />
        </div>
      )}

      {/* Caption */}
      {draft.caption && (
        <p
          className="text-[13px] leading-relaxed line-clamp-3"
          style={{ color: '#1A0A3B' }}
        >
          {draft.caption}
        </p>
      )}

      {/* Hashtags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 6).map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}
            >
              <Hash size={9} strokeWidth={2} />
              {tag.replace(/^#/, '')}
            </span>
          ))}
          {tags.length > 6 && (
            <span className="text-[11px]" style={{ color: '#6B6480' }}>
              +{tags.length - 6}
            </span>
          )}
        </div>
      )}

      {/* Fecha programada */}
      {draft.scheduled_for && (
        <div className="flex items-center gap-1.5" style={{ color: '#6B6480' }}>
          <CalendarClock size={12} strokeWidth={1.75} />
          <span className="text-[11px]">
            {new Intl.DateTimeFormat('es-MX', {
              weekday: 'short', day: 'numeric', month: 'short',
              hour:    '2-digit', minute: '2-digit',
            }).format(new Date(draft.scheduled_for))}
          </span>
        </div>
      )}
    </article>
  );
}
