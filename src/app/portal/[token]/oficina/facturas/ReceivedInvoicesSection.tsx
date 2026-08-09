'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, MessageCircleQuestion, Archive, Loader2, AlertTriangle, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState as PortalEmptyState } from '@/components/portal-ui';

interface InvoiceItem {
  id:                  string;
  agent_id:            string;
  email_from:          string;
  email_subject:       string;
  ai_summary:          string | null;
  item_type:           'email' | 'invoice';
  invoice_data:        Record<string, string | number | null> | null;
  invoice_valid:       boolean | null;
  invoice_discrepancy: string | null;
  status:              string;
  attachments:         Array<{ name: string; url: string; type: string }>;
  created_at:          string;
}

type Action = 'paid' | 'clarify' | 'archive';

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (d < 60)      return `Hace ${d} min`;
  if (d < 24*60)   return `Hace ${Math.floor(d/60)}h`;
  if (d < 7*24*60) return `Hace ${Math.floor(d/(24*60))}d`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function money(n: unknown): string | null {
  if (n == null) return null;
  const num = typeof n === 'number' ? n : Number(n);
  if (!isFinite(num)) return null;
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function ReceivedInvoicesSection({ token }: { token: string }) {
  const [items,   setItems]   = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);
  const [clarify, setClarify] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-inbox`);
      const data = await res.json();
      const invoices: InvoiceItem[] = (data.items ?? [])
        .filter((i: InvoiceItem) => i.item_type === 'invoice' && i.status === 'pending');
      setItems(invoices);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (id: string, action: Action, clarification?: string) => {
    setActing(id);
    try {
      const body: Record<string, unknown> = { id };
      if (action === 'paid')    body.status = 'approved';
      if (action === 'clarify') { body.status = 'info_requested'; body.clarification_message = clarification; }
      if (action === 'archive') body.status = 'skipped';

      const res = await fetch(`/api/portal/${token}/ops-inbox`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Error');

      toast.success(
        action === 'paid'    ? 'Marcada como pagada'
        : action === 'clarify' ? 'Aclaración enviada al proveedor'
        : 'Factura archivada',
      );
      setItems(prev => prev.filter(i => i.id !== id));
      setClarify(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar');
    } finally { setActing(null); }
  };

  const stats = useMemo(() => {
    const withDiscrepancy = items.filter(i => !!i.invoice_discrepancy).length;
    const total = items.reduce((sum, i) => {
      const t = i.invoice_data?.total;
      const n = typeof t === 'number' ? t : Number(t);
      return isFinite(n) ? sum + n : sum;
    }, 0);
    return { count: items.length, withDiscrepancy, total };
  }, [items]);

  return (
    <div
      id="facturas-recibidas"
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Facturas recibidas
            </h2>
            {stats.count > 0 && (
              <span className="text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                {stats.count}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Facturas de proveedores detectadas por tu equipo en el correo.
            {stats.total > 0 && <> Total pendiente: <strong style={{ color: '#1A0A3B' }}>{money(stats.total)}</strong>.</>}
          </p>
        </div>
        {stats.withDiscrepancy > 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertTriangle size={12} />
            {stats.withDiscrepancy} con discrepancia
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }} className="py-8 text-center">
          <Loader2 size={16} className="inline-block animate-spin" style={{ color: '#9B8FB5' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <PortalEmptyState
            icon={Inbox}
            title="Sin facturas recibidas"
            description="Cuando tu equipo detecte una factura en el correo, aparecerá aquí para que la marques como pagada, pidas aclaración o la archives."
          />
        </div>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {items.map((item, idx) => {
            const proveedor = String(item.invoice_data?.proveedor ?? item.email_from ?? 'Proveedor sin nombre');
            const total     = money(item.invoice_data?.total);
            const folio     = item.invoice_data?.folio ? String(item.invoice_data.folio) : null;
            const uuid      = item.invoice_data?.uuid  ? String(item.invoice_data.uuid)  : null;
            const isActing  = acting === item.id;
            const isClarify = clarify?.id === item.id;

            return (
              <div
                key={item.id}
                className="px-5 py-4"
                style={{ borderBottom: idx === items.length - 1 ? 'none' : '1px solid #F0EDF9' }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold truncate" style={{ color: '#1A0A3B' }}>
                        {proveedor}
                      </p>
                      {item.invoice_discrepancy && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.22)' }}
                        >
                          <AlertTriangle size={9} />
                          Discrepancia
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B6480' }}>
                      {item.email_subject || item.ai_summary || 'Sin descripción'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]" style={{ color: '#9B8FB5' }}>
                      {folio && <><span className="font-mono">Folio {folio}</span><span>·</span></>}
                      {uuid && <><span className="font-mono truncate max-w-[180px]" title={uuid}>{uuid.slice(0, 18)}…</span><span>·</span></>}
                      <span>{timeAgo(item.created_at)}</span>
                    </div>
                    {item.invoice_discrepancy && (
                      <p className="text-[11px] mt-2 leading-relaxed" style={{ color: '#B91C1C' }}>
                        {item.invoice_discrepancy}
                      </p>
                    )}
                    {item.attachments?.length > 0 && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {item.attachments.map((att, i) => (
                          <a
                            key={i}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] px-2 py-0.5 rounded-lg hover:opacity-80"
                            style={{ background: '#F5F2FB', color: '#6C3BFF', border: '1px solid #E8E3F5' }}
                          >
                            {att.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {total && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-[16px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>{total}</p>
                    </div>
                  )}
                </div>

                {isClarify ? (
                  <div className="flex flex-col gap-2 mt-3">
                    <textarea
                      autoFocus
                      value={clarify.text}
                      onChange={e => setClarify({ id: item.id, text: e.target.value })}
                      placeholder="Ej: El monto no coincide con nuestra orden de compra. ¿Podrían revisar?"
                      className="w-full rounded-lg px-3 py-2 text-[13px] resize-none"
                      rows={3}
                      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                    />
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => runAction(item.id, 'clarify', clarify.text)}
                        disabled={!clarify.text.trim() || isActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ background: '#6C3BFF', color: '#fff' }}
                      >
                        {isActing ? <Loader2 size={12} className="animate-spin" /> : <MessageCircleQuestion size={12} />}
                        Enviar al proveedor
                      </button>
                      <button
                        onClick={() => setClarify(null)}
                        disabled={isActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
                        style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => runAction(item.id, 'paid')}
                      disabled={isActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ background: '#22c55e', color: '#fff' }}
                    >
                      {isActing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      Marcar como pagada
                    </button>
                    <button
                      onClick={() => setClarify({ id: item.id, text: '' })}
                      disabled={isActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.22)' }}
                    >
                      <MessageCircleQuestion size={12} />
                      Pedir aclaración
                    </button>
                    <button
                      onClick={() => runAction(item.id, 'archive')}
                      disabled={isActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40 ml-auto"
                      style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}
                    >
                      <Archive size={12} />
                      Archivar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
