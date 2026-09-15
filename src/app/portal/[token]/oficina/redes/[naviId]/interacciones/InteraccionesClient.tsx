'use client';

/**
 * InteraccionesClient — lista interactiva de comentarios y DMs pendientes.
 *
 * Permite aprobar la respuesta de Navi, editarla, o marcar como atendido.
 * Las acciones se ejecutan via fetch optimista (sin endpoint dedicado de
 * interacciones en Task 6 — se usa PATCH de drafts indirectamente o
 * se actualiza response_status via un PUT futuro).
 *
 * Nota: la API de Task 6 no incluye endpoint de interacciones; las acciones
 * aquí disparan actualizaciones via Supabase (por ahora UI-only con estado
 * optimista + recarga desde servidor en revisión).
 */
import { useState } from 'react';
import { MessageSquare, Mail, Check, X, ThumbsUp, AlertTriangle } from 'lucide-react';
import type { SocialInteraction } from './page';

interface Props {
  token:               string;
  naviId:              string;
  initialInteractions: SocialInteraction[];
}

const SENTIMENT_CONFIG: Record<string, { label: string; color: string }> = {
  positive: { label: 'Positivo',  color: '#15803D' },
  neutral:  { label: 'Neutral',   color: '#6B6480' },
  negative: { label: 'Negativo',  color: '#B91C1C' },
  crisis:   { label: 'Crisis',    color: '#B91C1C' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_approval:    { label: 'Pendiente',  color: '#F59E0B' },
  escalated_to_human: { label: 'Escalado',   color: '#EF4444' },
};

function InteractionCard({
  item,
  onMarkHandled,
}: {
  item:           SocialInteraction;
  onMarkHandled:  (id: string) => void;
}) {
  const sentiment  = SENTIMENT_CONFIG[item.sentiment ?? 'neutral'];
  const status     = STATUS_CONFIG[item.response_status] ?? { label: item.response_status, color: '#6B6480' };
  const Icon       = item.interaction_type === 'comment' ? MessageSquare : Mail;

  const dateLabel = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(item.created_at));

  return (
    <article
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ border: '1px solid #E8E3F5', background: '#fff' }}
    >
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: '#6B6480' }} strokeWidth={1.75} />
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#6B6480' }}>
            {item.interaction_type === 'comment' ? 'Comentario' : 'Mensaje directo'}
          </span>
          <span className="text-[10px]" style={{ color: '#9CA3AF' }}>
            {dateLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ background: `${status.color}18`, color: status.color }}
          >
            {status.label}
          </span>
          <span
            className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ background: `${sentiment.color}18`, color: sentiment.color }}
          >
            {sentiment.label}
          </span>
        </div>
      </div>

      {/* Texto entrante */}
      <div
        className="rounded-lg p-3 text-[13px] leading-relaxed"
        style={{ background: '#F8F7FF', color: '#1A0A3B' }}
      >
        {item.incoming_text ?? '(sin texto)'}
      </div>

      {/* Respuesta de Navi */}
      {item.navi_response && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B6480' }}>
            Respuesta de Navi
          </p>
          <div
            className="rounded-lg p-3 text-[12px] leading-relaxed"
            style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#1A0A3B' }}
          >
            {item.navi_response}
          </div>
        </div>
      )}

      {/* Aviso escalado */}
      {item.response_status === 'escalated_to_human' && (
        <div
          className="flex items-start gap-2 rounded-lg p-2.5"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
        >
          <AlertTriangle size={13} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
          <p className="text-[11px]" style={{ color: '#B91C1C' }}>
            Escalado para revisión humana. Responde directamente en Instagram si es urgente.
          </p>
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={() => onMarkHandled(item.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-opacity"
          style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}
          aria-label="Marcar como atendido"
        >
          <Check size={11} strokeWidth={2.5} />
          Atendido
        </button>
        {item.navi_response && (
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-opacity"
            style={{ background: '#6C3BFF', color: '#fff' }}
            aria-label="Aprobar respuesta de Navi"
          >
            <ThumbsUp size={11} strokeWidth={2} />
            Aprobar respuesta
          </button>
        )}
      </div>
    </article>
  );
}

export default function InteraccionesClient({ token: _token, naviId: _naviId, initialInteractions }: Props) {
  const [items,    setItems]    = useState<SocialInteraction[]>(initialInteractions);
  const [filter,   setFilter]   = useState<'all' | 'comment' | 'dm'>('all');

  const handleMarkHandled = (id: string) => {
    // Optimistic removal — el cron lo marcará handled en DB eventualmente.
    // En producción, aquí iría un PATCH a un endpoint de interacciones.
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const visible = filter === 'all'
    ? items
    : items.filter(i => i.interaction_type === (filter as 'comment' | 'dm'));

  const commentCount = items.filter(i => i.interaction_type === 'comment').length;
  const dmCount      = items.filter(i => i.interaction_type === 'dm').length;

  if (items.length === 0) {
    return (
      <div
        className="rounded-xl flex flex-col items-center gap-3 py-14"
        style={{ background: '#F8F7FF', border: '1px dashed rgba(108,59,255,0.25)' }}
      >
        <MessageSquare size={28} style={{ color: '#6C3BFF', opacity: 0.4 }} />
        <p className="text-[14px] font-medium" style={{ color: '#1A0A3B' }}>
          Sin interacciones pendientes
        </p>
        <p className="text-[12px]" style={{ color: '#6B6480' }}>
          Navi está al día con todos los comentarios y mensajes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex gap-2">
        {([
          { key: 'all',     label: 'Todos',       count: items.length },
          { key: 'comment', label: 'Comentarios', count: commentCount },
          { key: 'dm',      label: 'DMs',         count: dmCount },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{
              background: filter === key ? '#6C3BFF' : '#F3F0FF',
              color:      filter === key ? '#fff'     : '#6C3BFF',
              border:     filter === key ? 'none'     : '1px solid rgba(108,59,255,0.2)',
            }}
          >
            {label}
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: filter === key ? 'rgba(255,255,255,0.2)' : 'rgba(108,59,255,0.12)',
                color:      filter === key ? '#fff'                    : '#6C3BFF',
              }}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex flex-col gap-3">
        {visible.map(item => (
          <InteractionCard key={item.id} item={item} onMarkHandled={handleMarkHandled} />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-[13px] text-center py-6" style={{ color: '#6B6480' }}>
          Sin {filter === 'comment' ? 'comentarios' : 'mensajes directos'} pendientes.
        </p>
      )}
    </div>
  );
}
