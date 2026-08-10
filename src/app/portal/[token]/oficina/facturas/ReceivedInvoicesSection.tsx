'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CheckCircle, AlertTriangle, MessageCircleQuestion, Archive, Loader2, Inbox, MoreHorizontal, FileText } from 'lucide-react';
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

type Determination = 'verified' | 'discrepancy' | 'needs_review';

// El empleado determinó qué tipo de factura es. Este es el "trabajo hecho"
// que reportamos al usuario, no una acción pendiente que le pedimos.
//   discrepancy   → hay problema Y el empleado ya escribió al proveedor
//                   (status='info_requested' se setea cuando needs_info+request_to_sender)
//   needs_review  → datos no validables por el empleado, requiere ojos humanos
//   verified      → todo OK, lista para que el humano la pague
function determine(item: InvoiceItem): Determination {
  if (item.status === 'info_requested' || item.invoice_discrepancy) return 'discrepancy';
  if (item.invoice_valid === false) return 'needs_review';
  return 'verified';
}

const DETERMINATION_META: Record<Determination, {
  label:    string;
  fg:       string;
  bg:       string;
  border:   string;
  icon:     typeof CheckCircle;
  summary:  string;
}> = {
  verified: {
    label:   'Verificada',
    fg:      '#047857',
    bg:      'rgba(16,185,129,0.10)',
    border:  'rgba(16,185,129,0.30)',
    icon:    CheckCircle,
    summary: 'lista para pagar',
  },
  discrepancy: {
    label:   'Diferencia con el proveedor',
    fg:      '#B45309',
    bg:      'rgba(245,158,11,0.10)',
    border:  'rgba(245,158,11,0.30)',
    icon:    AlertTriangle,
    summary: 'contactando al proveedor',
  },
  needs_review: {
    label:   'Necesita revisión',
    fg:      '#B91C1C',
    bg:      'rgba(239,68,68,0.10)',
    border:  'rgba(239,68,68,0.30)',
    icon:    AlertTriangle,
    summary: 'datos incompletos',
  },
};

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (d < 60)      return `hace ${d} min`;
  if (d < 24*60)   return `hace ${Math.floor(d/60)}h`;
  if (d < 7*24*60) return `hace ${Math.floor(d/(24*60))}d`;
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
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [clarify, setClarify] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-inbox`);
      const data = await res.json();
      // Mostramos las que aún están "en curso":
      //   pending          → verified (esperando pago del usuario) o needs_review
      //   info_requested   → discrepancia, empleado ya contactó al proveedor
      const invoices: InvoiceItem[] = (data.items ?? [])
        .filter((i: InvoiceItem) => i.item_type === 'invoice' && ['pending', 'info_requested'].includes(i.status));
      setItems(invoices);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Cerrar menú al click fuera
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuFor]);

  const runAction = async (id: string, action: 'paid' | 'clarify' | 'archive', clarification?: string) => {
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
      setMenuFor(null);
      setClarify(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar');
    } finally { setActing(null); }
  };

  // Orden: needs_review primero (lo único que realmente requiere ojos), luego
  // discrepancy (informa lo que el empleado hizo), luego verified.
  const sorted = useMemo(() => {
    const rank: Record<Determination, number> = { needs_review: 0, discrepancy: 1, verified: 2 };
    return [...items].sort((a, b) => rank[determine(a)] - rank[determine(b)]);
  }, [items]);

  const counts = useMemo(() => {
    const c = { verified: 0, discrepancy: 0, needs_review: 0, total: items.length, pendingAmount: 0 };
    for (const i of items) {
      c[determine(i)]++;
      const t = i.invoice_data?.total;
      const n = typeof t === 'number' ? t : Number(t);
      if (isFinite(n) && determine(i) === 'verified') c.pendingAmount += n;
    }
    return c;
  }, [items]);

  return (
    <div
      id="facturas-recibidas"
      className="flex flex-col rounded-2xl"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header — reporta lo que el equipo hizo, no lo que el usuario debe hacer */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Facturas recibidas
            </h2>
            {counts.total > 0 && (
              <span className="text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                {counts.total}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            {counts.total === 0
              ? <>Tu equipo revisa cada factura que llega, valida los datos y contacta al proveedor si hay discrepancias.</>
              : (
                <>
                  Tu equipo procesó {counts.total} {counts.total === 1 ? 'factura' : 'facturas'}.
                  {counts.verified    > 0 && <> <strong style={{ color: '#047857' }}>{counts.verified} verificadas</strong>{counts.pendingAmount > 0 && <> ({money(counts.pendingAmount)} listo por pagar)</>}.</>}
                  {counts.discrepancy > 0 && <> <strong style={{ color: '#B45309' }}>{counts.discrepancy} en aclaración con proveedor</strong>.</>}
                  {counts.needs_review > 0 && <> <strong style={{ color: '#B91C1C' }}>{counts.needs_review} necesitan tu revisión</strong>.</>}
                </>
              )
            }
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }} className="py-8 text-center">
          <Loader2 size={16} className="inline-block animate-spin" style={{ color: '#9B8FB5' }} />
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <PortalEmptyState
            icon={Inbox}
            title="Sin facturas por procesar"
            description="Cuando llegue una factura al correo, tu equipo la revisará automáticamente y te reportará el resultado aquí."
          />
        </div>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {sorted.map((item, idx) => {
            const det       = determine(item);
            const meta      = DETERMINATION_META[det];
            const DetIcon   = meta.icon;
            const supplier  = String(item.invoice_data?.proveedor ?? item.invoice_data?.vendor ?? item.email_from ?? 'Proveedor sin nombre');
            const total     = money(item.invoice_data?.total ?? item.invoice_data?.amount);
            const folio     = item.invoice_data?.folio ?? item.invoice_data?.invoice_no;
            const isActing  = acting === item.id;
            const isClarify = clarify?.id === item.id;
            const isMenu    = menuFor === item.id;

            const narrative = det === 'verified'
              ? 'Verificamos los datos y la factura está lista para que la pagues cuando quieras.'
              : det === 'discrepancy'
                ? `Detectamos ${item.invoice_discrepancy?.toLowerCase() ?? 'una diferencia con lo que esperábamos'} y ya escribimos al proveedor pidiendo aclaración.`
                : `No pudimos validar todos los datos — ${item.invoice_discrepancy ?? 'falta información clave'}.`;

            return (
              <div
                key={item.id}
                className="px-5 py-4"
                style={{ borderBottom: idx === sorted.length - 1 ? 'none' : '1px solid #F0EDF9' }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                    >
                      <DetIcon size={16} style={{ color: meta.fg }} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-semibold truncate" style={{ color: '#1A0A3B' }}>
                          {supplier}
                        </p>
                        <span
                          className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: meta.bg, color: meta.fg, border: `1px solid ${meta.border}` }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>
                        {narrative}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]" style={{ color: '#9B8FB5' }}>
                        {folio && <><span className="font-mono">Folio {folio}</span><span>·</span></>}
                        <span>{timeAgo(item.created_at)}</span>
                        {item.attachments?.length > 0 && (
                          <>
                            <span>·</span>
                            {item.attachments.slice(0, 2).map((att, i) => (
                              <a
                                key={i}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:opacity-70"
                                style={{ color: '#6C3BFF' }}
                              >
                                <FileText size={10} />
                                {att.name.length > 24 ? att.name.slice(0, 22) + '…' : att.name}
                              </a>
                            ))}
                            {item.attachments.length > 2 && <span>+{item.attachments.length - 2}</span>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {total && (
                      <p className="text-[15px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>{total}</p>
                    )}
                    <div className="relative">
                      <button
                        onClick={() => setMenuFor(isMenu ? null : item.id)}
                        disabled={isActing}
                        title="Más acciones"
                        className="p-1.5 rounded-lg transition-colors hover:bg-[#F5F2FB] disabled:opacity-40"
                        style={{ color: '#9B8FB5' }}
                      >
                        {isActing ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
                      </button>
                      {isMenu && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 mt-1 z-10 min-w-[220px] rounded-xl overflow-hidden py-1"
                          style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 8px 24px rgba(26,10,59,0.12)' }}
                        >
                          <MenuButton
                            icon={CheckCircle}
                            label="Ya la pagué"
                            hint="Marcar como procesada y sacar de la lista"
                            onClick={() => runAction(item.id, 'paid')}
                          />
                          <MenuButton
                            icon={MessageCircleQuestion}
                            label="Escribir al proveedor"
                            hint="Enviar un mensaje adicional yo mismo"
                            onClick={() => { setClarify({ id: item.id, text: '' }); setMenuFor(null); }}
                          />
                          <MenuButton
                            icon={Archive}
                            label="Archivar"
                            hint="No aplica o duplicada"
                            onClick={() => runAction(item.id, 'archive')}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isClarify && (
                  <div className="flex flex-col gap-2 mt-3">
                    <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                      Escribe tu mensaje al proveedor. Se enviará por correo desde tu buzón.
                    </p>
                    <textarea
                      autoFocus
                      value={clarify.text}
                      onChange={e => setClarify({ id: item.id, text: e.target.value })}
                      placeholder="Ej: El monto no coincide con nuestra orden de compra OC-123. ¿Podrían revisar?"
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
                        Enviar
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon: Icon, label, hint, onClick }: {
  icon:    typeof CheckCircle;
  label:   string;
  hint:    string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#FAFAFB]"
    >
      <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#6B6480' }} />
      <div className="min-w-0">
        <p className="text-[12px] font-medium leading-tight" style={{ color: '#1A0A3B' }}>{label}</p>
        <p className="text-[10px] mt-0.5 leading-tight" style={{ color: '#9B8FB5' }}>{hint}</p>
      </div>
    </button>
  );
}
