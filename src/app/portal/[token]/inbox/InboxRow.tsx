'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Paperclip, Users, MoreVertical, Loader2 } from 'lucide-react';
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
  origin_scope?:           'per_agent' | 'org_shared' | null;
  assigned_by?:            'per_agent' | 'rule' | 'llm' | 'fallback' | 'human' | null;
  assignment_confidence?:  number | null;
  assignment_metadata?:    Record<string, unknown> | null;
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

const ASSIGNED_BY_LABEL: Record<string, string> = {
  per_agent: 'Buzón propio del empleado',
  rule:      'Ruta por regla',
  llm:       'Ruteado por IA',
  fallback:  'Asignado por defecto',
  human:     'Asignado manualmente',
};

interface InboxRowProps {
  item:            InboxRowItem;
  agents:          InboxAgent[];
  isExpanded:      boolean;
  onToggle:        () => void;
  showStateBadge?: boolean;
  /** Si se provee, muestra menú de reasignar. Devuelve true si el update fue exitoso. */
  onReassign?:     (itemId: string, newAgentId: string) => Promise<boolean>;
}

export default function InboxRow({ item, agents, isExpanded, onToggle, showStateBadge = false, onReassign }: InboxRowProps) {
  const cat       = normalizeCategory(item.category);
  const catColor  = CATEGORY_COLORS[cat];
  const catLabel  = CATEGORY_LABELS[cat];
  const isPending = ['pending', 'escalated', 'info_requested'].includes(item.status);

  const agent      = agents.find(a => a.id === item.agent_id) ?? null;
  const agentLabel = agent?.agent_name ?? agent?.business_name ?? null;
  const showAgent  = agents.length > 1 && !!agentLabel;
  const isShared   = item.origin_scope === 'org_shared';

  return (
    <button
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--c-hover)]"
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
          {isShared && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(108,59,255,0.10)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
              title={
                item.assigned_by
                  ? `${ASSIGNED_BY_LABEL[item.assigned_by] ?? item.assigned_by}${
                      typeof item.assignment_confidence === 'number'
                        ? ` · ${Math.round(item.assignment_confidence * 100)}% confianza`
                        : ''
                    }`
                  : 'Correo recibido en la bandeja compartida'
              }
            >
              <Users size={9} />
              Compartida
            </span>
          )}
          {showAgent && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
              style={{
                background: isShared ? 'rgba(108,59,255,0.06)' : 'var(--c-surface)',
                color:      isShared ? '#6C3BFF' : 'var(--c-text-3)',
                border:     `1px solid ${isShared ? 'rgba(108,59,255,0.20)' : 'var(--c-border)'}`,
              }}
              title={
                item.assigned_by === 'human' ? 'Reasignado manualmente'
                : item.assigned_by === 'llm' ? 'Asignado por dispatcher IA'
                : item.assigned_by === 'rule' ? 'Asignado por regla'
                : item.assigned_by === 'fallback' ? 'Asignado como fallback'
                : undefined
              }
            >
              {isShared ? '→ ' : ''}{agentLabel}
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
          {!isPending && !item.auto_mode_flagged_at && !showStateBadge && (
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{STATUS_LABELS[item.status]}</span>
          )}
        </div>
        <p
          className={`text-sm truncate ${isPending ? 'font-semibold' : 'font-normal'}`}
          style={{ color: isPending ? 'var(--c-text)' : 'var(--c-text-3)' }}
        >
          {item.email_subject || '(sin asunto)'}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--c-text-3)' }}>{item.email_from}</p>
        {item.ai_summary && !isExpanded && (
          <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--c-text-4)' }}>{item.ai_summary}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {showStateBadge && item.status === 'escalated' && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.30)' }}
          >
            Escalado
          </span>
        )}
        {showStateBadge && item.status === 'info_requested' && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309', border: '1px solid rgba(245,158,11,0.30)' }}
          >
            Info solicitada
          </span>
        )}
        {item.attachments?.length > 0 && (
          <Paperclip size={11} style={{ color: 'var(--c-text-4)' }} />
        )}
        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
          {new Date(item.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
        </span>
        {onReassign && agents.length > 1 && (
          <ReassignMenu
            item={item}
            agents={agents}
            onReassign={onReassign}
          />
        )}
        {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
      </div>
    </button>
  );
}

// ─── Reassign menu ────────────────────────────────────────────────────────

function ReassignMenu({
  item, agents, onReassign,
}: {
  item:       InboxRowItem;
  agents:     InboxAgent[];
  onReassign: (itemId: string, newAgentId: string) => Promise<boolean>;
}) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const handlePick = async (newAgentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (newAgentId === item.agent_id || saving) return;
    setSaving(newAgentId);
    try {
      const ok = await onReassign(item.id, newAgentId);
      if (ok) setOpen(false);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1 rounded-md transition-colors hover:bg-[var(--c-surface-2)]"
        style={{ background: 'none', border: 'none', color: 'var(--c-text-4)', cursor: 'pointer' }}
        title="Reasignar a otro empleado"
      >
        <MoreVertical size={13} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] rounded-lg overflow-hidden"
          style={{
            background: 'var(--c-modal, #fff)',
            border:     '1px solid var(--c-border)',
            boxShadow:  '0 12px 32px rgba(26,10,59,0.14)',
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
              Reasignar a
            </p>
          </div>
          <ul className="py-1 max-h-[240px] overflow-y-auto">
            {agents.map(a => {
              const isCurrent = a.id === item.agent_id;
              const label     = a.agent_name ?? a.business_name ?? a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={e => handlePick(a.id, e)}
                    disabled={isCurrent || saving !== null}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--c-surface-2)] disabled:opacity-60 disabled:cursor-default"
                    style={{
                      background: isCurrent ? 'var(--c-surface-2)' : 'none',
                      border:     'none',
                      cursor:     isCurrent ? 'default' : 'pointer',
                      color:      'var(--c-text)',
                    }}
                  >
                    <span className="truncate">{label}</span>
                    {saving === a.id && <Loader2 size={11} className="animate-spin flex-shrink-0" />}
                    {isCurrent && !saving && <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>Actual</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
