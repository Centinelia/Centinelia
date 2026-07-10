'use client';

import { useState, useEffect, useCallback } from 'react';
import { Inbox, ChevronDown, ChevronUp, Check, X, FileText, Paperclip, RefreshCw, Search } from 'lucide-react';

interface InboxItem {
  id:                 string;
  agent_id:           string;
  email_from:         string;
  email_subject:      string;
  category:           string | null;
  ai_summary:         string | null;
  ai_draft:           string | null;
  item_type:          'email' | 'invoice';
  invoice_data:       Record<string, string | number | null> | null;
  invoice_valid:      boolean | null;
  invoice_discrepancy: string | null;
  status:             string;
  attachments:        Array<{ name: string; url: string; type: string }>;
  sent_at:            string | null;
  created_at:         string;
}

const CATEGORY_LABELS: Record<string, string> = {
  proveedor: 'Proveedor',
  cliente:   'Cliente',
  urgente:   'Urgente',
  factura:   'Factura',
  spam:      'Spam',
  otro:      'Otro',
};

const CATEGORY_COLORS: Record<string, string> = {
  proveedor: '#6C3BFF',
  cliente:   '#22c55e',
  urgente:   '#ef4444',
  factura:   '#f59e0b',
  spam:      '#94a3b8',
  otro:      '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  sent:     'Enviado',
  skipped:  'Ignorado',
};

export default function OpsInboxSection({ token }: { token: string }) {
  const [items, setItems]         = useState<InboxItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expandedId, setExpanded] = useState<string | null>(null);
  const [acting, setActing]       = useState<string | null>(null);
  const [filter, setFilter]       = useState<'all' | 'pending' | 'done'>('pending');
  const [search, setSearch]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/portal/${token}/ops-inbox`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [token]);

  const markRead = useCallback((id: string) => {
    fetch(`/api/portal/${token}/read-receipt`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ item_type: 'inbox', item_id: id }),
    }).catch(() => {});
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: 'approved' | 'rejected') => {
    setActing(id);
    const res = await fetch(`/api/portal/${token}/ops-inbox`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      setExpanded(null);
    }
    setActing(null);
  };

  const filtered = items.filter(i => {
    const statusOk = filter === 'pending' ? i.status === 'pending' : filter === 'done' ? i.status !== 'pending' : true;
    if (!statusOk) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (i.email_subject ?? '').toLowerCase().includes(q) ||
      (i.email_from    ?? '').toLowerCase().includes(q) ||
      (i.ai_summary    ?? '').toLowerCase().includes(q) ||
      (i.category      ?? '').toLowerCase().includes(q)
    );
  });

  const pendingCount = items.filter(i => i.status === 'pending').length;

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--c-text-4)' }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox size={16} style={{ color: '#6C3BFF' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Bandeja de entrada</span>
          {pendingCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(['pending', 'all', 'done'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background: filter === f ? '#6C3BFF' : 'transparent', color: filter === f ? '#fff' : 'var(--c-text-3)' }}>
              {f === 'pending' ? 'Pendientes' : f === 'done' ? 'Procesados' : 'Todos'}
            </button>
          ))}
          <button onClick={load} className="ml-1 p-1.5 rounded-lg transition-colors" style={{ color: 'var(--c-text-4)' }}>
            <RefreshCw size={12} />
          </button>
        </div>
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

      {filtered.length === 0 && (
        <div className="text-center py-12" style={{ color: 'var(--c-text-4)' }}>
          <Inbox size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{filter === 'pending' ? 'Sin emails pendientes de revisión.' : 'Sin elementos.'}</p>
        </div>
      )}

      {filtered.map(item => {
        const isExpanded = expandedId === item.id;
        const catColor   = CATEGORY_COLORS[item.category ?? 'otro'] ?? '#6b7280';
        const catLabel   = CATEGORY_LABELS[item.category ?? 'otro'] ?? 'Otro';
        const isPending  = item.status === 'pending';

        return (
          <div key={item.id} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${isExpanded ? catColor + '44' : 'var(--c-border)'}`, background: isExpanded ? `${catColor}08` : 'var(--c-surface-2)' }}>

            {/* Collapsed row */}
            <button className="w-full flex items-start gap-3 px-4 py-3 text-left"
              onClick={() => {
                const opening = expandedId !== item.id;
                setExpanded(opening ? item.id : null);
                if (opening) markRead(item.id);
              }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                <div className="w-2 h-2 rounded-full" style={{ background: isPending ? catColor : 'var(--c-border-2)' }} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}30` }}>
                    {catLabel}
                  </span>
                  {item.item_type === 'invoice' && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                      Factura
                    </span>
                  )}
                  {!isPending && (
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{STATUS_LABELS[item.status]}</span>
                  )}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
                  {item.email_subject || '(sin asunto)'}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                  {item.email_from}
                </p>
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

            {/* Expanded body */}
            {isExpanded && (
              <div className="px-4 pb-4" style={{ borderTop: `1px solid ${catColor}20` }}>

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

                {/* Draft */}
                {item.ai_draft && (
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
                {isPending && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => act(item.id, 'approved')} disabled={!!acting}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                      style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                      {acting === item.id ? 'Procesando…' : <><Check size={12} />{item.item_type === 'invoice' ? 'Aprobar factura' : 'Aprobar y enviar'}</>}
                    </button>
                    <button onClick={() => act(item.id, 'rejected')} disabled={!!acting}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                      <X size={12} />Rechazar
                    </button>
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
