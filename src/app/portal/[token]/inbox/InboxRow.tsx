'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Paperclip, Users, MoreVertical, Loader2, Zap, ShieldCheck, AlertTriangle, Ban } from 'lucide-react';
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

/** Extrae el "nombre del remitente" del formato "Nombre <email>". Fallback al email si no hay display name. */
function parseSender(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

/** Formatea la fecha corta: "hoy 14:30" / "ayer" / "5 ago" según cuán reciente. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate())
    return 'Ayer';
  return d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

export default function InboxRow({ item, agents, isExpanded, onToggle, showStateBadge = false, onReassign }: InboxRowProps) {
  const cat       = normalizeCategory(item.category);
  const catColor  = CATEGORY_COLORS[cat];
  const catLabel  = CATEGORY_LABELS[cat];
  const isPending = ['pending', 'escalated', 'info_requested'].includes(item.status);
  const isEscalated = item.status === 'escalated';

  const agent      = agents.find(a => a.id === item.agent_id) ?? null;
  const agentLabel = agent?.agent_name ?? agent?.business_name ?? null;
  const showAgent  = agents.length > 1 && !!agentLabel;
  const isShared   = item.origin_scope === 'org_shared';

  const { name: senderName, email: senderEmail } = parseSender(item.email_from);
  const hasSummary = !!item.ai_summary;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="group w-full text-left transition-all relative flex items-stretch"
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        borderRadius: 12,
      }}
    >
      {/* Rail izquierdo — color de categoría, más grueso si pendiente */}
      <span
        aria-hidden
        className="flex-shrink-0 rounded-l-xl transition-colors"
        style={{
          width: isPending ? 4 : 3,
          background: isPending ? catColor.fg : `${catColor.fg}30`,
        }}
      />

      {/* Contenido del row */}
      <div
        className="flex-1 min-w-0 flex items-start gap-3 px-4 py-3 transition-colors rounded-r-xl group-hover:bg-[#F5F2FB]"
        style={{
          background: isEscalated ? 'rgba(239,68,68,0.03)' : (isPending ? '#FDFCFF' : '#ffffff'),
          border: `1px solid ${isEscalated ? 'rgba(239,68,68,0.2)' : '#F0EDF9'}`,
          borderLeft: 'none',
        }}
      >
        {/* Contenido principal */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">

          {/* Fila 1: category + chips accesorios (compartida, agente, auto-mode) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
              style={{ background: catColor.bg, color: catColor.fg, border: `1px solid ${catColor.border}`, letterSpacing: '0.05em' }}
            >
              {catLabel}
            </span>
            {item.item_type === 'invoice' && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309', border: '1px solid rgba(245,158,11,0.25)', letterSpacing: '0.05em' }}
              >
                Factura
              </span>
            )}
            {isShared && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.22)', letterSpacing: '0.05em' }}
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
                <Users size={9} strokeWidth={2.5} />
                Compartida
              </span>
            )}
            {showAgent && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium"
                style={{
                  background: '#FAFAFB',
                  color:      '#6B6480',
                  border:     '1px solid #E8E3F5',
                }}
                title={
                  item.assigned_by === 'human' ? 'Reasignado manualmente'
                  : item.assigned_by === 'llm' ? 'Asignado por dispatcher IA'
                  : item.assigned_by === 'rule' ? 'Asignado por regla'
                  : item.assigned_by === 'fallback' ? 'Asignado como fallback'
                  : undefined
                }
              >
                {isShared && <span style={{ color: '#9B8FB5' }}>→</span>}
                {agentLabel}
              </span>
            )}
            {item.auto_mode_decision === 'send' && item.status === 'auto_replied' && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)', letterSpacing: '0.05em' }}
                title={item.auto_mode_reason ?? 'Enviado sin humano por el modo Auto'}
              >
                <Zap size={9} strokeWidth={2.5} />
                Auto
              </span>
            )}
            {item.auto_mode_decision === 'block' && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.10)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.25)', letterSpacing: '0.05em' }}
                title={item.auto_mode_reason ?? 'Bloqueado por red de seguridad'}
              >
                <Ban size={9} strokeWidth={2.5} />
                Bloqueado
              </span>
            )}
            {item.auto_mode_flagged_at && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.10)', color: '#B45309', border: '1px solid rgba(245,158,11,0.25)', letterSpacing: '0.05em' }}
                title="Marcado como envío incorrecto"
              >
                <AlertTriangle size={9} strokeWidth={2.5} />
                Reportado
              </span>
            )}
            {!isPending && !item.auto_mode_flagged_at && !showStateBadge && item.status !== 'auto_replied' && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: '#FAFAFB', color: '#9B8FB5', border: '1px solid #F0EDF9', letterSpacing: '0.05em' }}
              >
                {item.status === 'sent' && <ShieldCheck size={9} strokeWidth={2.5} />}
                {STATUS_LABELS[item.status] ?? item.status}
              </span>
            )}
          </div>

          {/* Fila 2: subject prominente */}
          <p
            className={`text-[14px] leading-snug truncate ${isPending ? 'font-bold' : 'font-normal'}`}
            style={{ color: isPending ? '#1A0A3B' : '#6B6480' }}
          >
            {item.email_subject || <span style={{ fontStyle: 'italic', color: '#9B8FB5' }}>(sin asunto)</span>}
          </p>

          {/* Fila 3: sender (name + email en 2 líneas de tono) */}
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[12px] font-semibold truncate" style={{ color: '#1A0A3B' }}>
              {senderName}
            </span>
            {senderName !== senderEmail && (
              <span className="text-[11px] truncate flex-shrink" style={{ color: '#9B8FB5' }}>
                {senderEmail}
              </span>
            )}
          </div>

          {/* Fila 4: resumen si existe y no está expandido */}
          {hasSummary && !isExpanded && (
            <p className="text-[12px] line-clamp-1 leading-relaxed mt-0.5" style={{ color: '#9B8FB5' }}>
              {item.ai_summary}
            </p>
          )}
        </div>

        {/* Columna derecha: badges de estado + metadata */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pl-2">
          <div className="flex items-center gap-1.5">
            {showStateBadge && item.status === 'escalated' && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.10)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.30)', letterSpacing: '0.05em' }}
              >
                <AlertTriangle size={9} strokeWidth={2.5} />
                Escalado
              </span>
            )}
            {showStateBadge && item.status === 'info_requested' && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.10)', color: '#B45309', border: '1px solid rgba(245,158,11,0.30)', letterSpacing: '0.05em' }}
              >
                Info solicitada
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {item.attachments?.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: '#9B8FB5' }} title={`${item.attachments.length} adjunto${item.attachments.length !== 1 ? 's' : ''}`}>
                <Paperclip size={11} />
                {item.attachments.length}
              </span>
            )}
            <span className="text-[11px] tabular-nums font-medium" style={{ color: isPending ? '#6B6480' : '#9B8FB5' }}>
              {fmtDate(item.created_at)}
            </span>
            {onReassign && agents.length > 1 && (
              <ReassignMenu
                item={item}
                agents={agents}
                onReassign={onReassign}
              />
            )}
            {isExpanded
              ? <ChevronUp size={14} style={{ color: '#6C3BFF' }} />
              : <ChevronDown size={14} style={{ color: '#9B8FB5' }} className="transition-colors group-hover:text-[#6C3BFF]" />
            }
          </div>
        </div>
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
        className="p-1 rounded-md transition-colors hover:bg-[#F0EDF9]"
        style={{ background: 'none', border: 'none', color: '#9B8FB5', cursor: 'pointer' }}
        title="Reasignar a otro empleado"
      >
        <MoreVertical size={13} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[220px] rounded-xl overflow-hidden"
          style={{
            background: '#ffffff',
            border:     '1px solid #E8E3F5',
            boxShadow:  '0 12px 32px rgba(26,10,59,0.14)',
          }}
        >
          <div className="px-3.5 py-2.5 border-b" style={{ borderColor: '#F0EDF9', background: '#FAFAFB' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6B6480', letterSpacing: '0.08em' }}>
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
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-[#FAFAFB] disabled:opacity-60 disabled:cursor-default"
                    style={{
                      background: isCurrent ? '#F5F2FB' : 'none',
                      border:     'none',
                      cursor:     isCurrent ? 'default' : 'pointer',
                      color:      '#1A0A3B',
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    <span className="truncate">{label}</span>
                    {saving === a.id && <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: '#6C3BFF' }} />}
                    {isCurrent && !saving && <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C3BFF' }}>Actual</span>}
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
