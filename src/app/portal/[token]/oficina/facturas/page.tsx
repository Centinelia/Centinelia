'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle, Copy, Check, ExternalLink } from 'lucide-react';

interface Item {
  descripcion:     string;
  cantidad:        number;
  precio_unitario: number;
  unidad?:         string;
}

interface FacturaRequest {
  id:             string;
  agent_id:       string;
  cliente_nombre: string;
  cliente_rfc:    string;
  cliente_email:  string;
  uso_cfdi:       string;
  forma_pago:     string;
  metodo_pago:    string;
  subtotal:       number;
  iva:            number;
  total:          number;
  currency:       string;
  status:         'pending' | 'in_progress' | 'issued' | 'cancelled';
  requested_at:   string;
  resolved_at:    string | null;
  resolved_by:    string | null;
  issued_uuid:    string | null;
  issued_folio:   string | null;
  notes:          string | null;
}

interface Detail extends FacturaRequest {
  cliente_telefono:  string | null;
  cliente_direccion: string | null;
  condiciones_pago:  string | null;
  items:             Item[];
  source_channel:    string;
  source_call_id:    string | null;
  source_context:    string | null;
  cancel_reason:     string | null;
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: 'Pendiente',   color: '#f59e0b', icon: Clock },
  in_progress: { label: 'En proceso',  color: '#3b82f6', icon: Clock },
  issued:      { label: 'Emitida',     color: '#22c55e', icon: CheckCircle },
  cancelled:   { label: 'Cancelada',   color: '#ef4444', icon: XCircle },
};

function mxn(n: number, currency = 'MXN'): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency });
}
function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (d < 60)      return `Hace ${d} min`;
  if (d < 24*60)   return `Hace ${Math.floor(d/60)}h`;
  if (d < 7*24*60) return `Hace ${Math.floor(d/(24*60))}d`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function FacturasPage() {
  const { token }    = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [rows,       setRows]       = useState<FacturaRequest[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string | null>>({});
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<'all' | FacturaRequest['status']>('all');
  const [selected,   setSelected]   = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/factura-requests`);
      const data = await res.json();
      setRows(data.requests ?? []);
      setAgentNames(data.agentNames ?? {});
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Deep link: ?open=<request_id> abre el modal automáticamente al cargar
  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId || loading) return;
    openDetail(openId);
    // Limpiar el query param para que refrescar no re-abra el modal
    router.replace(`/portal/${token}/oficina/facturas`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading]);

  async function openDetail(id: string) {
    const res = await fetch(`/api/portal/${token}/factura-requests/${id}`);
    const data = await res.json();
    if (data.request) setSelected(data.request as Detail);
  }

  async function markIssued(uuid: string, folio: string) {
    if (!selected) return;
    const res = await fetch(`/api/portal/${token}/factura-requests/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_issued', issued_uuid: uuid || undefined, issued_folio: folio || undefined }),
    });
    if ((await res.json()).ok) { setSelected(null); load(); }
  }

  async function markInProgress() {
    if (!selected) return;
    await fetch(`/api/portal/${token}/factura-requests/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_in_progress' }),
    });
    setSelected(null); load();
  }

  async function cancelRequest(reason: string) {
    if (!selected) return;
    if (!confirm(`Cancelar esta solicitud de factura?\n\nRazón: ${reason}`)) return;
    await fetch(`/api/portal/${token}/factura-requests/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', cancel_reason: reason }),
    });
    setSelected(null); load();
  }

  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter);
  const counts   = {
    all:         rows.length,
    pending:     rows.filter(r => r.status === 'pending').length,
    in_progress: rows.filter(r => r.status === 'in_progress').length,
    issued:      rows.filter(r => r.status === 'issued').length,
    cancelled:   rows.filter(r => r.status === 'cancelled').length,
  };

  return (
    <div id="of-facturas" className="flex flex-col gap-5 p-5 sm:p-7 w-full">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>Facturación</p>
        <h1 className="text-xl font-bold mt-1.5 leading-snug" style={{ color: 'var(--c-text)' }}>Facturas por emitir</h1>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Solicitudes que tus empleados recolectaron. Cuando timbres cada una en tu sistema fiscal (Solución Factible u otro PAC), márcala como emitida aquí.
        </p>
      </div>

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric value={counts.pending}     label="Pendientes"  color="#f59e0b" />
          <Metric value={counts.in_progress} label="En proceso"  color="#3b82f6" />
          <Metric value={counts.issued}      label="Emitidas"    color="#22c55e" />
          <Metric value={counts.cancelled}   label="Canceladas"  color="#ef4444" />
        </div>
      )}

      {!loading && (
        <div className="flex gap-1 flex-wrap">
          {([
            { id: 'all' as const,         label: 'Todas',       count: counts.all },
            { id: 'pending' as const,     label: 'Pendientes',  count: counts.pending },
            { id: 'in_progress' as const, label: 'En proceso',  count: counts.in_progress },
            { id: 'issued' as const,      label: 'Emitidas',    count: counts.issued },
            { id: 'cancelled' as const,   label: 'Canceladas',  count: counts.cancelled },
          ]).map(p => (
            <button key={p.id} onClick={() => setFilter(p.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: filter === p.id ? '#6C3BFF' : 'var(--c-surface)',
                color:      filter === p.id ? '#fff'    : 'var(--c-text-3)',
                border:     filter === p.id ? 'none'    : '1px solid var(--c-border)',
              }}>
              {p.label}
              {p.count > 0 && (
                <span className="text-[10px] font-bold tabular-nums rounded-full px-1.5"
                  style={{ background: filter === p.id ? 'rgba(255,255,255,0.2)' : 'var(--c-surface-2)', color: filter === p.id ? '#fff' : 'var(--c-text-4)' }}>{p.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-xs py-10 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando solicitudes...</p>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(r => {
            const cfg = STATUS_LABEL[r.status];
            const Icon = cfg.icon;
            return (
              <button key={r.id} onClick={() => openDetail(r.id)}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-colors hover:opacity-90"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}15` }}>
                  <Icon size={16} style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{r.cliente_nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs" style={{ color: 'var(--c-text-4)' }}>
                    <span className="font-mono">{r.cliente_rfc}</span>
                    <span>·</span>
                    <span>{r.uso_cfdi}</span>
                    <span>·</span>
                    <span>{r.metodo_pago}</span>
                    {agentNames[r.agent_id] && (<><span>·</span><span>por {agentNames[r.agent_id]}</span></>)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>{mxn(r.total, r.currency)}</span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: cfg.color }}>
                    <span className="font-medium">{cfg.label}</span>
                    <span style={{ color: 'var(--c-text-4)' }}>· {timeAgo(r.requested_at)}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <DetailModal
          request={selected}
          onClose={() => setSelected(null)}
          onMarkInProgress={markInProgress}
          onMarkIssued={markIssued}
          onCancel={cancelRequest}
        />
      )}
    </div>
  );
}

function Metric({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-3 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <span className="text-xl font-bold tabular-nums" style={{ color: color ?? 'var(--c-text)' }}>{value}</span>
      <span className="text-[10px] uppercase tracking-widest font-semibold text-center" style={{ color: 'var(--c-text-4)' }}>{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center rounded-2xl" style={{ background: 'var(--c-surface)', border: '1px dashed var(--c-border)' }}>
      <FileText size={28} style={{ color: 'var(--c-text-4)', opacity: 0.5 }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--c-text-2)' }}>Sin solicitudes de factura</p>
        <p className="text-xs mt-1 leading-relaxed max-w-sm" style={{ color: 'var(--c-text-3)' }}>
          Cuando tu empleado registre una solicitud de un cliente (por teléfono, chat o correo), aparecerá aquí lista para que la emitas en tu sistema fiscal.
        </p>
      </div>
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ request, onClose, onMarkInProgress, onMarkIssued, onCancel }: {
  request: Detail;
  onClose: () => void;
  onMarkInProgress: () => void;
  onMarkIssued: (uuid: string, folio: string) => void;
  onCancel: (reason: string) => void;
}) {
  const [uuid, setUuid] = useState('');
  const [folio, setFolio] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const isTerminal = request.status === 'issued' || request.status === 'cancelled';
  const cfg = STATUS_LABEL[request.status];

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-2xl m-4 rounded-2xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>Solicitud de factura</p>
            <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--c-text)' }}>{request.cliente_nombre}</h2>
            <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: cfg.color }}>
              <span className="font-medium">{cfg.label}</span>
              <span style={{ color: 'var(--c-text-4)' }}>· solicitada {timeAgo(request.requested_at)}</span>
              {request.resolved_at && <span style={{ color: 'var(--c-text-4)' }}>· resuelta {timeAgo(request.resolved_at)}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-lg hover:opacity-80" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}>Cerrar</button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          <Section title="Datos del receptor">
            <Row k="Razón social"  v={request.cliente_nombre} />
            <Row k="RFC"           v={request.cliente_rfc} mono copyable />
            <Row k="Correo fiscal" v={request.cliente_email} copyable />
            {request.cliente_telefono  && <Row k="Teléfono"  v={request.cliente_telefono} />}
            {request.cliente_direccion && <Row k="Dirección" v={request.cliente_direccion} />}
          </Section>

          <Section title="Datos fiscales">
            <Row k="Uso CFDI"      v={request.uso_cfdi} copyable />
            <Row k="Forma de pago" v={request.forma_pago} copyable />
            <Row k="Método de pago" v={request.metodo_pago} copyable />
            {request.condiciones_pago && <Row k="Condiciones" v={request.condiciones_pago} />}
          </Section>

          <Section title="Conceptos">
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
              <table className="w-full text-xs">
                <thead style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-4)' }}>
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold uppercase tracking-wide text-[10px]">Descripción</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px] w-16">Cant.</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px] w-24">P. Unit.</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px] w-28">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {request.items.map((it, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--c-border)' }}>
                      <td className="py-2 px-3" style={{ color: 'var(--c-text)' }}>{it.descripcion}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--c-text-2)' }}>{it.cantidad}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--c-text-2)' }}>{mxn(it.precio_unitario)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: 'var(--c-text)' }}>{mxn(it.cantidad * it.precio_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-0.5 mt-3 text-xs" style={{ color: 'var(--c-text-3)' }}>
              <div className="flex gap-6"><span>Subtotal</span><span className="tabular-nums w-24 text-right" style={{ color: 'var(--c-text)' }}>{mxn(request.subtotal, request.currency)}</span></div>
              {request.iva > 0 && (<div className="flex gap-6"><span>IVA</span><span className="tabular-nums w-24 text-right" style={{ color: 'var(--c-text)' }}>{mxn(request.iva, request.currency)}</span></div>)}
              <div className="flex gap-6 mt-1 pt-1 text-sm font-bold" style={{ borderTop: '1.5px solid var(--c-text)', color: 'var(--c-text)' }}>
                <span>Total</span>
                <span className="tabular-nums w-24 text-right">{mxn(request.total, request.currency)}</span>
              </div>
            </div>
          </Section>

          {request.notes && (
            <Section title="Notas del empleado">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{request.notes}</p>
            </Section>
          )}

          {request.status === 'issued' && (request.issued_uuid || request.issued_folio) && (
            <Section title="Datos de emisión">
              {request.issued_folio && <Row k="Folio" v={request.issued_folio} mono />}
              {request.issued_uuid  && <Row k="UUID"  v={request.issued_uuid} mono />}
              {request.resolved_by  && <Row k="Marcada por" v={request.resolved_by} />}
            </Section>
          )}
        </div>

        {!isTerminal && (
          <div className="px-6 py-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
            {!showCancel ? (
              <>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-4)' }}>UUID (opcional)</label>
                    <input value={uuid} onChange={e => setUuid(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX"
                      className="w-full rounded-lg px-3 py-2 text-xs font-mono"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-4)' }}>Folio (opcional)</label>
                    <input value={folio} onChange={e => setFolio(e.target.value)} placeholder="FAC-1234"
                      className="w-full rounded-lg px-3 py-2 text-xs font-mono"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => onMarkIssued(uuid, folio)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{ background: '#22c55e', color: '#fff' }}>
                    <CheckCircle size={12} /> Marcar como emitida
                  </button>
                  {request.status === 'pending' && (
                    <button onClick={onMarkInProgress}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                      <Clock size={12} /> Marcar en proceso
                    </button>
                  )}
                  <button onClick={() => setShowCancel(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 ml-auto"
                    style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <XCircle size={12} /> Cancelar solicitud
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="block text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>Razón de la cancelación</label>
                <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} autoFocus
                  placeholder="Ej: RFC no válido, cliente ya no lo necesita, factura duplicada"
                  className="w-full rounded-lg px-3 py-2 text-xs"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                <div className="flex gap-2">
                  <button onClick={() => onCancel(cancelReason)} disabled={!cancelReason.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: '#ef4444', color: '#fff' }}>
                    <XCircle size={12} /> Confirmar cancelación
                  </button>
                  <button onClick={() => setShowCancel(false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                    Volver
                  </button>
                </div>
              </div>
            )}
            {request.status === 'pending' && (
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text-4)' }}>
                Cuando timbres esta factura en tu sistema fiscal (Solución Factible, CONTPAQ, Aspel, etc.), marca aquí como emitida.
                Los datos de UUID y folio son opcionales pero útiles para tu récord interno.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ k, v, mono, copyable }: { k: string; v: string; mono?: boolean; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ }
  }
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className="w-32 shrink-0" style={{ color: 'var(--c-text-4)' }}>{k}</div>
      <div className={`flex-1 ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--c-text)' }}>{v}</div>
      {copyable && (
        <button onClick={copy} title="Copiar" className="p-1 rounded hover:opacity-80" style={{ color: copied ? '#22c55e' : 'var(--c-text-4)' }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
    </div>
  );
}
