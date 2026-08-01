'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Inbox, Check, X, FileText, RefreshCw, Search, AlertTriangle, MessageSquare, RotateCcw, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import InfoTooltip from '@/components/InfoTooltip';
import type { InboxAgent } from './inbox/categories';
import { normalizeCategory, CATEGORY_COLORS, CATEGORY_ORDER } from './inbox/categories';
import type { CategorySlug } from './inbox/categories';
import InboxRow from './inbox/InboxRow';
import CategoryChips from './inbox/CategoryChips';

interface InboxItem {
  id:                  string;
  agent_id:            string;
  email_from:          string;
  email_subject:       string;
  category:            string | null;
  ai_summary:          string | null;
  ai_draft:            string | null;
  item_type:           'email' | 'invoice';
  invoice_data:        Record<string, string | number | null> | null;
  invoice_valid:       boolean | null;
  invoice_discrepancy: string | null;
  status:              string;
  attachments:         Array<{ name: string; url: string; type: string }>;
  sent_at:             string | null;
  created_at:          string;
  auto_mode_decision:      string | null;
  auto_mode_reason:        string | null;
  auto_mode_flagged_at:    string | null;
  auto_mode_flag_reason:   string | null;
  auto_mode_flag_category: string | null;
  client_replied_at:       string | null;
}

interface HumanRequest {
  id:                string;
  agent_id:          string;
  request_type:      string;
  title:             string;
  description:       string | null;
  urgency:           string;
  target_email:      string | null;
  status:            string;
  created_at:        string;
  client_replied_at: string | null;
}

interface ReauthNeeded {
  provider:   string;
  email:      string;
  capability: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  gmail:       'Gmail',
  outlook:     'Outlook',
  microsoft:   'Outlook',
  quickbooks:  'QuickBooks',
  notion:      'Notion',
  drive:       'Google Drive',
  google:      'Google',
  onedrive:    'OneDrive',
  mercadolibre:'MercadoLibre',
};


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

const URGENCY_LABELS: Record<string, string> = {
  baja:  'Baja',
  media: 'Media',
  alta:  'Alta',
};

const URGENCY_COLORS: Record<string, string> = {
  baja:  '#6b7280',
  media: '#f59e0b',
  alta:  '#ef4444',
};

type Tab = 'pendientes' | 'auto' | 'spam' | 'rechazados' | 'reportados' | 'todo';

const FLAG_CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: 'alucinacion',        label: 'Alucinación',                     hint: 'Datos inventados (horarios, precios, políticas)' },
  { key: 'tono',               label: 'Tono inapropiado',                hint: 'Demasiado formal/informal, o no acorde a marca' },
  { key: 'info_incorrecta',    label: 'Info incorrecta',                 hint: 'Datos reales pero mal presentados o desactualizados' },
  { key: 'no_debia_responder', label: 'No debía responder solo',         hint: 'Requería aprobación humana previa' },
  { key: 'otro',               label: 'Otro',                            hint: 'Describe en el texto abajo' },
];

interface OpsInboxSectionProps {
  token:  string;
  agents: InboxAgent[];
}

export default function OpsInboxSection({ token, agents }: OpsInboxSectionProps) {
  const [items, setItems]                                 = useState<InboxItem[]>([]);
  const [humanRequests, setHumanReqs]                     = useState<HumanRequest[]>([]);
  const [reauthNeeded, setReauthNeeded]                   = useState<ReauthNeeded[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expandedId, setExpanded]       = useState<string | null>(null);
  const [acting, setActing]             = useState<string | null>(null);
  const searchParams = useSearchParams();
  const initialTab: Tab = (() => {
    const t = searchParams.get('tab');
    if (t === 'auto' || t === 'spam' || t === 'reportados' || t === 'todo' || t === 'pendientes') return t;
    return 'pendientes';
  })();
  const [activeTab, setActiveTab]       = useState<Tab>(initialTab);
  const [search, setSearch]             = useState('');

  const router = useRouter();

  const initialCategory: CategorySlug | null = (() => {
    const c = searchParams.get('cat');
    if (c && (CATEGORY_ORDER as string[]).includes(c)) return c as CategorySlug;
    return null;
  })();
  const [activeCategory, setActiveCategory] = useState<CategorySlug | null>(initialCategory);

  const changeCategory = useCallback((next: CategorySlug | null) => {
    setActiveCategory(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('cat', next); else params.delete('cat');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/ops-inbox`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setHumanReqs(data.humanRequests ?? []);
        setReauthNeeded(data.integrationsNeedingReauth ?? []);
      }
    } finally { setLoading(false); }
  }, [token]);

  const markRead = useCallback((id: string) => {
    fetch(`/api/portal/${token}/read-receipt`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ item_type: 'inbox', item_id: id }),
    }).catch(() => {});
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [flaggingId, setFlaggingId]   = useState<string | null>(null);
  const [flagCategory, setFlagCategory] = useState<string>('alucinacion');
  const [flagReason, setFlagReason]     = useState<string>('');
  const [submittingFlag, setSubmittingFlag] = useState<boolean>(false);

  const openFlagForm = (id: string) => {
    setFlaggingId(id);
    setFlagCategory('alucinacion');
    setFlagReason('');
  };
  const closeFlagForm = () => {
    setFlaggingId(null);
    setFlagReason('');
  };
  const [correctionOpenId, setCorrectionOpenId] = useState<string | null>(null);
  const [correctionText, setCorrectionText]     = useState<string>('');
  const [sendingCorrection, setSendingCorrection] = useState<boolean>(false);

  const openCorrection = (id: string, senderName: string) => {
    setCorrectionOpenId(id);
    setCorrectionText(`Hola${senderName ? ' ' + senderName : ''},\n\nDisculpa, la respuesta que te enviamos anteriormente contenía información imprecisa. Aquí va la respuesta correcta:\n\n[Escribe aquí la respuesta correcta]\n\nDisculpa nuevamente el inconveniente.\n\nSaludos`);
  };
  const closeCorrection = () => {
    setCorrectionOpenId(null);
    setCorrectionText('');
  };
  const sendCorrection = async (id: string) => {
    if (!correctionText.trim()) {
      toast.error('El correo no puede estar vacío.');
      return;
    }
    setSendingCorrection(true);
    try {
      const res = await fetch(`/api/portal/${token}/ops-inbox/${id}/send-correction`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ body: correctionText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? 'No se pudo enviar la corrección.');
        return;
      }
      toast.success('Corrección enviada al cliente.');
      closeCorrection();
    } finally {
      setSendingCorrection(false);
    }
  };

  const submitFlag = async (id: string) => {
    setSubmittingFlag(true);
    try {
      const res = await fetch(`/api/portal/${token}/ops-inbox/${id}/flag-auto-mode`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ flagged: true, category: flagCategory, reason: flagReason.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success('Reporte enviado. El empleado ya aprendió: la regla nueva aplica desde el próximo correo.');
      closeFlagForm();
      load();
    } catch {
      toast.error('No se pudo enviar el reporte.');
    } finally {
      setSubmittingFlag(false);
    }
  };

  const act = async (id: string, status: 'approved' | 'rejected') => {
    // Confirm si el cliente ya respondió mientras el draft esperaba aprobación
    if (status === 'approved') {
      const item = items.find(i => i.id === id);
      if (item?.client_replied_at) {
        const fecha = new Date(item.client_replied_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const ok = window.confirm(`El cliente ya respondió a este hilo el ${fecha}. Este borrador puede estar desactualizado. ¿Enviar de todos modos?`);
        if (!ok) return;
      }
    }
    setActing(id);
    try {
      const editedDraft = draftEdits[id];
      const payload: Record<string, unknown> = { id, status };
      if (status === 'approved' && editedDraft?.trim()) {
        payload.ai_draft = editedDraft.trim();
      }
      const res = await fetch(`/api/portal/${token}/ops-inbox`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === id
          ? { ...i, status, ai_draft: editedDraft?.trim() ? editedDraft.trim() : i.ai_draft }
          : i
        ));
        setExpanded(null);
        setDraftEdits(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } finally { setActing(null); }
  };

  const unspam = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/portal/${token}/ops-inbox`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, status: 'unspam' }),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'pending', category: 'otro' } : i));
        setExpanded(null);
        toast.success('Rescatado. Ahora aparece en Pendientes.');
      } else {
        toast.error('No se pudo rescatar el correo.');
      }
    } finally { setActing(null); }
  };

  // Tab-filtered ops_inbox items
  const tabItems = useMemo<InboxItem[]>(() => {
    if (activeTab === 'pendientes')  return items.filter(i => ['pending', 'escalated', 'info_requested'].includes(i.status));
    if (activeTab === 'auto')        return items.filter(i => i.status === 'auto_replied' && i.auto_mode_decision === 'send');
    if (activeTab === 'spam')        return items.filter(i => i.status === 'skipped' && i.category === 'spam');
    // Audit trail: decisiones de rechazo pasadas eran invisibles antes (audit sesión 53).
    if (activeTab === 'rechazados')  return items.filter(i => i.status === 'rejected');
    if (activeTab === 'reportados')  return items.filter(i => !!i.auto_mode_flagged_at);
    return items;
  }, [items, activeTab]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bySearch = !q ? tabItems : tabItems.filter(i =>
      (i.email_subject ?? '').toLowerCase().includes(q) ||
      (i.email_from    ?? '').toLowerCase().includes(q) ||
      (i.ai_summary    ?? '').toLowerCase().includes(q) ||
      (i.category      ?? '').toLowerCase().includes(q)
    );
    if (!activeCategory) return bySearch;
    return bySearch.filter(i => normalizeCategory(i.category) === activeCategory);
  }, [tabItems, search, activeCategory]);

  // Badge counts
  const pendingOpsCount    = items.filter(i => ['pending', 'escalated', 'info_requested'].includes(i.status)).length;
  const pendingBadgeCount  = pendingOpsCount + humanRequests.length;
  const autoCount          = items.filter(i => i.status === 'auto_replied' && i.auto_mode_decision === 'send').length;
  const spamCount          = items.filter(i => i.status === 'skipped' && i.category === 'spam').length;
  const rejectedCount      = items.filter(i => i.status === 'rejected').length;
  const reportedCount      = items.filter(i => !!i.auto_mode_flagged_at).length;

  const TAB_CONFIG: { key: Tab; label: string; count?: number }[] = [
    { key: 'pendientes', label: 'Pendientes',    count: pendingBadgeCount > 0 ? pendingBadgeCount : undefined },
    { key: 'auto',       label: 'Auto-enviados', count: autoCount > 0 ? autoCount : undefined },
    { key: 'spam',       label: 'Spam',          count: spamCount > 0 ? spamCount : undefined },
    { key: 'rechazados', label: 'Rechazados',    count: rejectedCount > 0 ? rejectedCount : undefined },
    { key: 'reportados', label: 'Reportados',    count: reportedCount > 0 ? reportedCount : undefined },
    { key: 'todo',       label: 'Todo' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--c-text-4)' }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox size={16} style={{ color: '#6C3BFF' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Bandeja de entrada</span>
          <InfoTooltip text={`¿Cuántas tareas consume?
1 tarea por cada correo entrante que el empleado analiza y clasifica.

No consumen tareas: aprobar, editar antes de enviar, rechazar, rescatar spam, reportar mal envío, enviar corrección al cliente.`} />
        </div>
        <button onClick={load} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--c-text-4)' }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Banner: integraciones OAuth expiradas.
          Solo afecta la ingesta entrante — el envío de aprobados sigue OK
          (va por Resend con FROM fijo, no por el OAuth del cliente). */}
      {reauthNeeded.length > 0 && (
        <div className="rounded-xl px-3 py-2.5 flex items-start gap-2.5" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
          <PlugZap size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
              {reauthNeeded.length === 1 ? 'Una integración necesita reconexión' : `${reauthNeeded.length} integraciones necesitan reconexión`}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              {reauthNeeded.map((r, i) => (
                <span key={`${r.provider}-${r.email}-${i}`}>
                  {i > 0 && <span style={{ color: 'var(--c-border-2)' }}> · </span>}
                  {PROVIDER_LABELS[r.provider] ?? r.provider}
                  {r.email && <span style={{ color: 'var(--c-text-4)' }}> ({r.email})</span>}
                </span>
              ))}
              . Los correos entrantes de estas cuentas no se están sincronizando hasta que reconectes.
            </p>
          </div>
          <a
            href={`/portal/${token}/oficina/integraciones`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: '#f59e0b', color: '#fff', textDecoration: 'none' }}
          >
            Reconectar
          </a>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b" style={{ borderColor: 'var(--c-border)' }}>
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              changeCategory(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors"
            style={{
              borderColor:  activeTab === tab.key ? '#6C3BFF' : 'transparent',
              color:        activeTab === tab.key ? 'var(--c-text)' : 'var(--c-text-3)',
              fontWeight:   activeTab === tab.key ? 600 : 400,
              background:   'transparent',
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: activeTab === tab.key ? 'rgba(108,59,255,0.12)' : 'rgba(239,68,68,0.12)',
                  color:      activeTab === tab.key ? '#6C3BFF' : '#ef4444',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-4)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por asunto, remitente o resumen..."
          className="w-full text-xs rounded-xl"
          style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
        />
      </div>

      {/* Category filter chips */}
      <CategoryChips
        items={tabItems}
        activeCategory={activeCategory}
        onSelect={changeCategory}
      />

      {/* Human Requests section — only shown in Pendientes tab */}
      {activeTab === 'pendientes' && humanRequests.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
            Pendientes tuyos
          </p>
          {humanRequests.map(hr => {
            const urgColor = URGENCY_COLORS[hr.urgency] ?? '#6b7280';
            const urgLabel = URGENCY_LABELS[hr.urgency] ?? hr.urgency;
            return (
              <a
                key={hr.id}
                href={`/portal/${token}/requests/${hr.id}`}
                className="block rounded-xl transition-opacity hover:opacity-80"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', textDecoration: 'none' }}
              >
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <MessageSquare size={14} style={{ color: '#6C3BFF', flexShrink: 0, marginTop: 1 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>{hr.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                        {hr.request_type}
                        <span className="mx-1.5" style={{ color: 'var(--c-border-2)' }}>·</span>
                        <span style={{ color: urgColor }}>Urgencia {urgLabel}</span>
                        <span className="mx-1.5" style={{ color: 'var(--c-border-2)' }}>·</span>
                        {new Date(hr.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                      </p>
                      {hr.client_replied_at && (
                        <p className="text-xs mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}>
                          <AlertTriangle size={10} />
                          Cliente ya respondió el {new Date(hr.client_replied_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#6C3BFF' }}>Responder</span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Ops inbox items */}
      {filteredItems.length === 0 && humanRequests.length === 0 && activeTab === 'pendientes' && (
        <div className="text-center py-12" style={{ color: 'var(--c-text-4)' }}>
          <Inbox size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin elementos pendientes de revisión.</p>
        </div>
      )}

      {filteredItems.length === 0 && activeTab !== 'pendientes' && (
        <div className="text-center py-12" style={{ color: 'var(--c-text-4)' }}>
          <Inbox size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin elementos.</p>
        </div>
      )}

      {activeTab === 'pendientes' && filteredItems.length > 0 && (
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
          Correos pendientes
        </p>
      )}

      {filteredItems.map(item => {
        const isExpanded  = expandedId === item.id;
        const catColorObj = CATEGORY_COLORS[normalizeCategory(item.category)];
        const catColorHex = catColorObj.fg;
        const isPending   = item.status === 'pending';

        return (
          <div key={item.id} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${isExpanded ? catColorHex + '44' : 'var(--c-border)'}`, background: isExpanded ? `${catColorHex}08` : 'var(--c-surface-2)' }}>

            <InboxRow
              item={item}
              agents={agents}
              isExpanded={isExpanded}
              onToggle={() => {
                const opening = expandedId !== item.id;
                setExpanded(opening ? item.id : null);
                if (opening) markRead(item.id);
              }}
            />

            {/* Expanded body */}
            {isExpanded && (
              <div className="px-4 pb-4" style={{ borderTop: `1px solid ${catColorHex}20` }}>

                {/* Advertencia: el cliente respondió mientras el draft esperaba aprobación */}
                {item.client_replied_at && isPending && (
                  <div className="mt-3 mb-3 px-3 py-2.5 rounded-lg flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>El cliente respondió a este hilo</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                        Nuevo mensaje recibido el {new Date(item.client_replied_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Este borrador puede estar desactualizado; revisa la bandeja por un correo más reciente antes de aprobar.
                      </p>
                    </div>
                  </div>
                )}

                {/* Summary */}
                {item.ai_summary && (
                  <div className="mt-3 mb-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{item.ai_summary}</p>
                  </div>
                )}

                {/* Invoice data */}
                {item.item_type === 'invoice' && item.invoice_data && (
                  <div className="mb-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#f59e0b' }}>Datos de la factura</p>
                    {item.invoice_data.vendor     && <p className="text-xs mb-1" style={{ color: 'var(--c-text-2)' }}><span style={{ color: 'var(--c-text-4)' }}>Proveedor:</span> {String(item.invoice_data.vendor)}</p>}
                    {item.invoice_data.amount     && <p className="text-xs mb-1" style={{ color: 'var(--c-text-2)' }}><span style={{ color: 'var(--c-text-4)' }}>Monto:</span> ${Number(item.invoice_data.amount).toLocaleString('es-MX')} {String(item.invoice_data.currency ?? 'MXN')}</p>}
                    {item.invoice_data.invoice_no && <p className="text-xs mb-1" style={{ color: 'var(--c-text-2)' }}><span style={{ color: 'var(--c-text-4)' }}>No. Factura:</span> {String(item.invoice_data.invoice_no)}</p>}
                    {item.invoice_data.po_ref     && <p className="text-xs" style={{ color: 'var(--c-text-2)' }}><span style={{ color: 'var(--c-text-4)' }}>Ref OC:</span> {String(item.invoice_data.po_ref)}</p>}
                  </div>
                )}

                {/* Discrepancy */}
                {item.invoice_discrepancy && (
                  <div className="mb-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#ef4444' }}>Discrepancia</p>
                    <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>{item.invoice_discrepancy}</p>
                  </div>
                )}

                {/* Draft: editable si pendiente, solo lectura después */}
                {item.ai_draft && isPending && (
                  <div className="mb-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>Borrador de respuesta</p>
                      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Puedes editar antes de aprobar</p>
                    </div>
                    <textarea
                      value={draftEdits[item.id] ?? item.ai_draft}
                      onChange={e => setDraftEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                      rows={Math.min(20, Math.max(6, (draftEdits[item.id] ?? item.ai_draft).split('\n').length + 1))}
                      className="w-full text-xs leading-relaxed resize-y rounded-md px-2 py-1.5 focus:outline-none focus:ring-1"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
                    />
                  </div>
                )}
                {item.ai_draft && !isPending && (
                  <div className="mb-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>Borrador de respuesta</p>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{item.ai_draft}</p>
                  </div>
                )}

                {/* Attachments */}
                {item.attachments?.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {item.attachments.map((att, i) => (
                      <a key={i} href={att.url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                        <FileText size={10} />{att.name}
                      </a>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {isPending && (() => {
                  const wasEdited = !!draftEdits[item.id] && draftEdits[item.id].trim() !== (item.ai_draft ?? '').trim();
                  return (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => act(item.id, 'approved')} disabled={!!acting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                        style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                        {acting === item.id ? 'Procesando…' : <><Check size={12} />{item.item_type === 'invoice' ? 'Aprobar factura' : wasEdited ? 'Enviar con tus cambios' : 'Aprobar y enviar'}</>}
                      </button>
                      <button onClick={() => act(item.id, 'rejected')} disabled={!!acting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                        <X size={12} />Rechazar
                      </button>
                    </div>
                  );
                })()}

                {/* Rescatar: solo cuando el correo está marcado spam (false positive del clasificador) */}
                {item.status === 'skipped' && item.category === 'spam' && (
                  <div className="mt-2">
                    <button onClick={() => unspam(item.id)} disabled={!!acting}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                      style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.25)', color: '#6C3BFF' }}>
                      {acting === item.id ? 'Rescatando…' : <><RotateCcw size={12} />Rescatar (no era spam)</>}
                    </button>
                  </div>
                )}

                {/* Reportar mal envío: botón / form inline / detalle si ya reportado */}
                {item.auto_mode_decision === 'send' && !item.auto_mode_flagged_at && flaggingId !== item.id && (
                  <div className="mt-3 pt-3 border-t border-dashed border-[#664D03]/30">
                    <button
                      type="button"
                      onClick={() => openFlagForm(item.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                      style={{ color: '#842029', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <AlertTriangle size={12} />
                      Reportar mal envío
                    </button>
                  </div>
                )}

                {/* Form inline para reportar */}
                {flaggingId === item.id && (
                  <div className="mt-3 pt-3 border-t border-dashed border-[#664D03]/30 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#842029' }}>Reportar mal envío</p>

                    <div className="space-y-1.5">
                      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>¿Qué salió mal?</p>
                      {FLAG_CATEGORIES.map(cat => (
                        <label key={cat.key} className="flex items-start gap-2 cursor-pointer px-2 py-1.5 rounded-md hover:bg-[rgba(239,68,68,0.04)]">
                          <input
                            type="radio"
                            name={`flag-cat-${item.id}`}
                            value={cat.key}
                            checked={flagCategory === cat.key}
                            onChange={() => setFlagCategory(cat.key)}
                            className="mt-0.5 accent-[#ef4444]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>{cat.label}</div>
                            <div className="text-[11px] leading-snug" style={{ color: 'var(--c-text-4)' }}>{cat.hint}</div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--c-text-4)' }}>Detalle (opcional)</label>
                      <textarea
                        value={flagReason}
                        onChange={e => setFlagReason(e.target.value)}
                        rows={3}
                        placeholder="Contexto adicional que ayude al empleado a evitar este error en el futuro."
                        className="w-full text-xs leading-relaxed resize-y rounded-md px-2 py-1.5 focus:outline-none focus:ring-1"
                        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => submitFlag(item.id)}
                        disabled={submittingFlag}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}>
                        <AlertTriangle size={12} />
                        {submittingFlag ? 'Enviando…' : 'Enviar reporte'}
                      </button>
                      <button
                        onClick={closeFlagForm}
                        disabled={submittingFlag}
                        className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors hover:opacity-80"
                        style={{ color: 'var(--c-text-4)', border: '1px solid var(--c-border)' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Detalle del reporte si ya está flagged */}
                {item.auto_mode_flagged_at && (
                  <div className="mt-3 pt-3 border-t border-dashed border-[#664D03]/30">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#842029' }}>Reportado como mal envío</p>
                    {item.auto_mode_flag_category && (
                      <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>
                        <span style={{ color: 'var(--c-text-4)' }}>Categoría:</span>{' '}
                        <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>
                          {FLAG_CATEGORIES.find(c => c.key === item.auto_mode_flag_category)?.label ?? item.auto_mode_flag_category}
                        </span>
                      </p>
                    )}
                    {item.auto_mode_flag_reason && (
                      <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                        <span style={{ color: 'var(--c-text-4)' }}>Detalle:</span> {item.auto_mode_flag_reason}
                      </p>
                    )}
                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--c-text-4)' }}>
                      {new Date(item.auto_mode_flagged_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>

                    {/* Correo de corrección */}
                    {correctionOpenId !== item.id && (
                      <div className="mt-3">
                        <button
                          onClick={() => openCorrection(item.id, (item.email_from ?? '').split('<')[0].trim().split('@')[0])}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                          style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.25)' }}>
                          <MessageSquare size={12} />
                          Enviar corrección al cliente
                        </button>
                      </div>
                    )}
                    {correctionOpenId === item.id && (
                      <div className="mt-3 space-y-2">
                        <label className="text-xs block" style={{ color: 'var(--c-text-4)' }}>
                          Correo de corrección a {item.email_from}
                        </label>
                        <textarea
                          value={correctionText}
                          onChange={e => setCorrectionText(e.target.value)}
                          rows={Math.min(20, Math.max(8, correctionText.split('\n').length + 1))}
                          className="w-full text-xs leading-relaxed resize-y rounded-md px-2 py-1.5 focus:outline-none focus:ring-1"
                          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => sendCorrection(item.id)}
                            disabled={sendingCorrection}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                            style={{ background: 'rgba(108,59,255,0.15)', border: '1px solid rgba(108,59,255,0.35)', color: '#6C3BFF' }}>
                            <Check size={12} />
                            {sendingCorrection ? 'Enviando…' : 'Enviar corrección'}
                          </button>
                          <button
                            onClick={closeCorrection}
                            disabled={sendingCorrection}
                            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors hover:opacity-80"
                            style={{ color: 'var(--c-text-4)', border: '1px solid var(--c-border)' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
