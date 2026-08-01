'use client';

import { ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import type { InboxAgent } from './categories';
import { normalizeCategory, CATEGORY_LABELS, CATEGORY_COLORS } from './categories';

// Shape mínima del item que consume la row. Debe matchear InboxItem del parent.
interface InboxRowItem {
  id:                      string;
  agent_id:                string;
  email_from:              string;
  email_subject:           string;
  category:                string | null;
  ai_summary:              string | null;
  item_type:               'email' | 'invoice';
  status:                  string;
  attachments:             Array<{ name: string; url: string; type: string }>;
  created_at:              string;
  auto_mode_decision:      string | null;
  auto_mode_reason:        string | null;
  auto_mode_flagged_at:    string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending:        'Pendiente',
  approved:       'Aprobado',
  rejected:       'Rechazado',
  sent:           'Enviado',
  skipped:        'Ignorado',
  auto_replied:   'Enviado automáticamente',
  escalated:      'Escalado a ti',
  info_requested: 'Info solicitada al remitente',
};

interface InboxRowProps {
  item:            InboxRowItem;
  agents:          InboxAgent[];
  isExpanded:      boolean;
  onToggle:        () => void;
  showStateBadge?: boolean;
}

export default function InboxRow({ item, isExpanded, onToggle }: InboxRowProps) {
  const cat       = normalizeCategory(item.category);
  const catColor  = CATEGORY_COLORS[cat];
  const catLabel  = CATEGORY_LABELS[cat];
  const isPending = item.status === 'pending';

  return (
    <button
      className="w-full flex items-start gap-3 px-4 py-3 text-left"
      onClick={onToggle}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
        <div className="w-2 h-2 rounded-full" style={{ background: isPending ? catColor.fg : 'var(--c-border-2)' }} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span
            className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: catColor.bg, color: catColor.fg, border: `1px solid ${catColor.border}` }}
          >
            {catLabel}
          </span>
          {item.item_type === 'invoice' && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              Factura
            </span>
          )}
          {item.auto_mode_decision === 'send' && item.status === 'auto_replied' && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#0F5132] bg-[#D1E7DD] border border-[#0F5132]/20 rounded-full px-2 py-0.5"
              title={item.auto_mode_reason ?? 'Enviado sin humano por el modo Auto'}
            >
              Enviado automático
            </span>
          )}
          {item.auto_mode_decision === 'block' && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#842029] bg-[#F8D7DA] border border-[#842029]/20 rounded-full px-2 py-0.5"
              title={item.auto_mode_reason ?? 'Bloqueado por red de seguridad'}
            >
              Bloqueado
            </span>
          )}
          {item.auto_mode_flagged_at && (
            <span
              className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-[#664D03] bg-[#FFF3CD] border border-[#664D03]/20 rounded-full px-2 py-0.5"
              title="Marcado como envío incorrecto"
            >
              Reportado
            </span>
          )}
          {!isPending && !item.auto_mode_flagged_at && (
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{STATUS_LABELS[item.status]}</span>
          )}
        </div>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
          {item.email_subject || '(sin asunto)'}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--c-text-3)' }}>{item.email_from}</p>
        {item.ai_summary && !isExpanded && (
          <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--c-text-4)' }}>{item.ai_summary}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {item.attachments?.length > 0 && (
          <Paperclip size={11} style={{ color: 'var(--c-text-4)' }} />
        )}
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
          {new Date(item.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
        </span>
        {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
      </div>
    </button>
  );
}
