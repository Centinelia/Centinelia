'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  FileText, Clock, CheckCircle, XCircle, Copy, Check, Receipt,
  Download, RefreshCw, AlertTriangle, Stamp, Ban, Loader2, Archive, Search, X,
} from 'lucide-react';
import { EmptyState as PortalEmptyState } from '@/components/portal-ui';
import ReceivedInvoicesSection from './ReceivedInvoicesSection';

/* ─── Backup year button ─────────────────────────────────────────────────── */
function BackupYearButton({ token }: { token: string }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg]   = useState<string | null>(null);

  async function download(year: number) {
    setBusy(year); setMsg(null);
    try {
      const res = await fetch(`/api/portal/${token}/factura-requests/download-year?year=${year}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error ?? `Error ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cfdi-${year}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors"
        style={{ background: '#F5F2FB', color: '#6C3BFF', border: '1px solid #E8E3F5' }}
      >
        <Archive size={14} />
        Descargar backup
      </button>
      {open && (
        <div className="absolute right-0 mt-2 z-20 rounded-xl overflow-hidden min-w-[240px]"
          style={{ background: '#fff', border: '1px solid #E8E3F5', boxShadow: '0 8px 24px rgba(26,10,59,0.12)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #F0EDF9' }}>
            <p className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>Respaldo anual CFDI (ZIP)</p>
            <p className="text-[11px] mt-0.5" style={{ color: '#6B6480' }}>
              XML + PDF de todas las facturas timbradas ese año. SAT exige 5 años.
            </p>
          </div>
          {years.map(y => (
            <button
              key={y}
              onClick={() => void download(y)}
              disabled={busy !== null}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-[#FAFAFB] disabled:opacity-50"
              style={{ borderBottom: y === years[years.length - 1] ? 'none' : '1px solid #F0EDF9', color: '#1A0A3B' }}
            >
              <span>Año {y}</span>
              {busy === y ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} style={{ color: '#9B8FB5' }} />}
            </button>
          ))}
          {msg && (
            <div className="px-4 py-2.5 text-[11px]" style={{ color: '#b91c1c', background: 'rgba(239,68,68,0.05)', borderTop: '1px solid #F0EDF9' }}>
              {msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Item {
  descripcion:     string;
  cantidad:        number;
  precio_unitario: number;
  unidad?:         string;
}

type FacturaStatus =
  | 'pending'
  | 'in_progress'
  | 'stamping'
  | 'stamped'
  | 'stamp_failed'
  | 'marked_manual'
  | 'cancellation_requested'
  | 'issued'
  | 'cancelled';

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
  status:         FacturaStatus;
  requested_at:   string;
  resolved_at:    string | null;
  resolved_by:    string | null;
  issued_uuid:    string | null;
  issued_folio:   string | null;
  notes:          string | null;
  guardrail_reason?: string | null;
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
  xml_storage_path?: string | null;
  pdf_storage_path?: string | null;
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ s }: { s: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pending:                { label: 'Pendiente',         cls: 'bg-amber-100 text-amber-700' },
    in_progress:            { label: 'En proceso',        cls: 'bg-blue-100 text-blue-700' },
    stamping:               { label: 'Timbrando...',      cls: 'bg-blue-100 text-blue-700 animate-pulse' },
    stamped:                { label: 'Emitida',           cls: 'bg-green-100 text-green-700' },
    stamp_failed:           { label: 'Fallo timbrado',   cls: 'bg-red-100 text-red-700' },
    marked_manual:          { label: 'Manual',            cls: 'bg-gray-100 text-gray-500' },
    cancellation_requested: { label: 'Cancelacion pedida', cls: 'bg-amber-100 text-amber-700' },
    issued:                 { label: 'Emitida',           cls: 'bg-green-100 text-green-700' },
    cancelled:              { label: 'Cancelada',         cls: 'bg-gray-100 text-gray-400 line-through' },
  };
  const c = cfg[s] ?? cfg.pending;
  return <span className={`text-xs px-2 py-1 rounded font-medium ${c.cls}`}>{c.label}</span>;
}

// ─── Legacy STATUS_LABEL kept for row icon colors ──────────────────────────

const STATUS_ICON: Record<string, { color: string; icon: React.ElementType }> = {
  pending:                { color: '#f59e0b', icon: Clock },
  in_progress:            { color: '#3b82f6', icon: Clock },
  stamping:               { color: '#3b82f6', icon: Clock },
  stamped:                { color: '#22c55e', icon: CheckCircle },
  stamp_failed:           { color: '#ef4444', icon: AlertTriangle },
  marked_manual:          { color: '#6b7280', icon: Check },
  cancellation_requested: { color: '#f59e0b', icon: Clock },
  issued:                 { color: '#22c55e', icon: CheckCircle },
  cancelled:              { color: '#ef4444', icon: XCircle },
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

// ─── Filter pills config ───────────────────────────────────────────────────

type FilterId = 'all' | FacturaStatus;

const PILL_DEFS: { id: FilterId; label: string }[] = [
  { id: 'all',                    label: 'Todas'             },
  { id: 'pending',                label: 'Pendientes'        },
  { id: 'stamping',               label: 'Timbrando'         },
  { id: 'stamp_failed',           label: 'Con falla'         },
  { id: 'stamped',                label: 'Emitidas'          },
  { id: 'marked_manual',          label: 'Manual'            },
  { id: 'cancellation_requested', label: 'Cancelacion ped.'  },
  { id: 'cancelled',              label: 'Canceladas'        },
];

export default function FacturasPage() {
  const { token }    = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [rows,       setRows]       = useState<FacturaRequest[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string | null>>({});
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<FilterId>('all');
  const [selected,   setSelected]   = useState<Detail | null>(null);
  // Whether org has PAC connected (affects action buttons)
  const [pacConnected, setPacConnected] = useState(false);
  // Cancellation modal (for stamped/issued invoices)
  const [cancelTarget, setCancelTarget] = useState<Detail | null>(null);
  // Search + date range
  const [search,   setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');   // YYYY-MM-DD
  const [dateTo,   setDateTo]   = useState('');
  // View toggle: emitidas (por emitir + emitidas a clientes) vs recibidas (de proveedores)
  const initialView = searchParams.get('view') === 'recibidas' ? 'recibidas' : 'emitidas';
  const [viewType, setViewType] = useState<'emitidas' | 'recibidas'>(initialView);
  const changeView = (v: 'emitidas' | 'recibidas') => {
    setViewType(v);
    const sp = new URLSearchParams(searchParams.toString());
    if (v === 'emitidas') sp.delete('view'); else sp.set('view', v);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, cfgRes] = await Promise.all([
        fetch(`/api/portal/${token}/factura-requests`),
        fetch(`/api/portal/${token}/invoicing/config`),
      ]);
      const reqData = await reqRes.json();
      const cfgData = await cfgRes.json().catch(() => ({ connected: false }));
      setRows(reqData.requests ?? []);
      setAgentNames(reqData.agentNames ?? {});
      setPacConnected(cfgData.connected === true);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Deep link: ?open=<request_id> abre el modal automaticamente al cargar
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
    if (!confirm(`Cancelar esta solicitud de factura?\n\nRazon: ${reason}`)) return;
    await fetch(`/api/portal/${token}/factura-requests/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', cancel_reason: reason }),
    });
    setSelected(null); load();
  }

  async function stampRequest(id: string) {
    const res = await fetch(`/api/portal/${token}/factura-requests/${id}/stamp`, { method: 'POST' });
    const data = await res.json();
    if (data.ok || data.outcome) { setSelected(null); load(); }
    else alert(data.error ?? 'Error al timbrar');
  }

  async function markManual(id: string) {
    const res = await fetch(`/api/portal/${token}/factura-requests/${id}/mark-manual`, { method: 'POST' });
    if ((await res.json()).ok) { setSelected(null); load(); }
  }

  async function requestCfdiCancellation(
    row: Detail,
    motivo: '01' | '02' | '03' | '04',
    uuidSustituto: string,
    razonCliente: string,
  ) {
    const res = await fetch(`/api/portal/${token}/cancellations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid_o_folio_corto: row.issued_uuid ?? '',
        motivo,
        uuid_sustituto: uuidSustituto || undefined,
        razon_cliente: razonCliente || undefined,
      }),
    });
    const data = await res.json();
    if (data.ok) { setCancelTarget(null); setSelected(null); load(); }
    else alert(data.message ?? 'Error al solicitar cancelacion');
  }

  async function confirmCancellation(cancellationId: string) {
    const res = await fetch(`/api/portal/${token}/cancellations/${cancellationId}/confirm`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) { setSelected(null); load(); }
    else alert(data.error ?? 'Error al confirmar la cancelacion');
  }

  async function rejectCancellation(cancellationId: string, notes: string) {
    const res = await fetch(`/api/portal/${token}/cancellations/${cancellationId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes || 'Rechazado por humano' }),
    });
    if ((await res.json()).ok) { setSelected(null); load(); }
    else alert('Error al rechazar la cancelacion');
  }

  // Aplicar filtros: status pill + search text + date range
  const searchLower = search.trim().toLowerCase();
  const fromMs = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : null;
  const toMs   = dateTo   ? Date.parse(`${dateTo}T23:59:59`)   : null;

  const filtered = rows.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (fromMs !== null || toMs !== null) {
      const ts = Date.parse(r.requested_at);
      if (fromMs !== null && ts < fromMs) return false;
      if (toMs   !== null && ts > toMs)   return false;
    }
    if (searchLower) {
      const haystack = [
        r.cliente_nombre, r.cliente_rfc, r.cliente_email,
        r.issued_uuid, r.issued_folio, r.notes,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });

  // Count per status for pill badges (respetan search + date range para que
  // el pill "Pendientes: 3" cambie cuando el owner filtra, no confuso)
  const rowsScopedForCount = rows.filter(r => {
    if (fromMs !== null || toMs !== null) {
      const ts = Date.parse(r.requested_at);
      if (fromMs !== null && ts < fromMs) return false;
      if (toMs   !== null && ts > toMs)   return false;
    }
    if (searchLower) {
      const haystack = [
        r.cliente_nombre, r.cliente_rfc, r.cliente_email,
        r.issued_uuid, r.issued_folio, r.notes,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });
  const countOf = (id: FilterId) =>
    id === 'all' ? rowsScopedForCount.length : rowsScopedForCount.filter(r => r.status === id).length;

  // Alert count: pending + stamp_failed that need attention (sobre TODO, no filtrado)
  const alertCount = rows.filter(r => r.status === 'pending' || r.status === 'stamp_failed').length;

  const hasActiveFilters = !!search || !!dateFrom || !!dateTo || filter !== 'all';
  const clearFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); setFilter('all'); };

  return (
    <div id="of-facturas" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      {/* Hero */}
      <header className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <Receipt size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            Facturacion
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Facturas
          </h1>
          <p className="text-[14px]" style={{ color: '#6B6480' }}>
            Facturas <strong style={{ color: '#1A0A3B' }}>recibidas</strong> de proveedores y solicitudes <strong style={{ color: '#1A0A3B' }}>por emitir</strong> a tus clientes.
            {alertCount > 0 && <> Hoy: <strong style={{ color: '#1A0A3B' }}>{alertCount}</strong> por atender.</>}
          </p>
        </div>
        <BackupYearButton token={token} />
      </header>

      {/* View toggle: Emitidas / Recibidas */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: '#F5F2FB', border: '1px solid #E8E3F5' }}>
        {([
          { id: 'emitidas',  label: 'Facturas emitidas',   hint: 'a clientes' },
          { id: 'recibidas', label: 'Facturas recibidas',  hint: 'de proveedores' },
        ] as const).map(t => {
          const active = viewType === t.id;
          return (
            <button
              key={t.id}
              onClick={() => changeView(t.id)}
              className="px-3.5 py-1.5 rounded-lg text-[13px] transition-all"
              style={{
                background: active ? '#fff' : 'transparent',
                color:      active ? '#1A0A3B' : '#6B6480',
                fontWeight: active ? 600 : 500,
                boxShadow:  active ? '0 1px 3px rgba(26,10,59,0.08)' : 'none',
                border:     'none',
                cursor:     'pointer',
              }}
            >
              {t.label}
              <span className="ml-1.5 text-[11px] font-normal" style={{ color: active ? '#9B6DFF' : '#9B8FB5' }}>
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Vista recibidas */}
      {viewType === 'recibidas' && <ReceivedInvoicesSection token={token} />}

      {/* Vista emitidas: search + date range */}
      {viewType === 'emitidas' && !loading && rows.length > 0 && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#9B8FB5' }} />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cliente, RFC, correo, UUID, folio, notas..."
              className="w-full rounded-lg pl-9 pr-3 py-2 text-[13px]"
              style={{ background: '#fff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px]" style={{ color: '#6B6480' }}>
              Desde
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                max={dateTo || undefined}
                className="rounded-lg px-2 py-1.5 text-[12px]"
                style={{ background: '#fff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[12px]" style={{ color: '#6B6480' }}>
              Hasta
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                className="rounded-lg px-2 py-1.5 text-[12px]"
                style={{ background: '#fff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              />
            </label>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-[12px] font-medium px-2 py-1.5 rounded-lg transition-colors hover:opacity-70"
                style={{ color: '#6B6480' }}
                title="Limpiar filtros"
              >
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter pills */}
      {viewType === 'emitidas' && !loading && (
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl overflow-x-auto whitespace-nowrap"
          style={{ background: '#F5F2FB', border: '1px solid #E8E3F5' }}
        >
          {PILL_DEFS.map(p => {
            const count    = countOf(p.id);
            const isActive = filter === p.id;
            const isAlert  = (p.id === 'pending' || p.id === 'stamp_failed') && count > 0;
            return (
              <button
                key={p.id}
                onClick={() => setFilter(p.id)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-all"
                style={{
                  background: isActive ? '#ffffff' : 'transparent',
                  color:      isActive ? '#1A0A3B' : '#6B6480',
                  fontWeight: isActive ? 600 : 500,
                  boxShadow:  isActive ? '0 1px 3px rgba(26,10,59,0.08)' : 'none',
                  border:     'none',
                  cursor:     'pointer',
                }}
              >
                {p.label}
                {count > 0 && (
                  <span
                    className="inline-flex items-center justify-center text-[10px] font-bold tabular-nums min-w-[18px] h-[18px] px-1 rounded-full"
                    style={{
                      background: isAlert ? '#ef4444' : (isActive ? '#6C3BFF' : '#E8E3F5'),
                      color:      isAlert || isActive ? '#ffffff' : '#6B6480',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewType === 'emitidas' && loading ? (
        <p className="text-[12px] py-10 text-center" style={{ color: '#6B6480' }}>Cargando solicitudes...</p>
      ) : viewType === 'emitidas' ? (
        <div
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
                  Solicitudes
                </h2>
                {filtered.length > 0 && (
                  <span className="text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                    style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                    {filtered.length}
                  </span>
                )}
              </div>
              <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                {pacConnected
                  ? 'Tu PAC esta conectado. Puedes timbrar solicitudes directamente desde aqui.'
                  : 'Conecta tu PAC desde Configurar para timbrar automaticamente.'}
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ borderTop: '1px solid #F0EDF9' }}>
              <PortalEmptyState
                icon={FileText}
                title="Sin solicitudes de factura"
                description="Cuando tu empleado registre una solicitud (por telefono, chat o correo), aparecera aqui lista para emitir."
              />
            </div>
          ) : (
            <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
              {filtered.map((r, idx) => {
                const cfg  = STATUS_ICON[r.status] ?? STATUS_ICON.pending;
                const Icon = cfg.icon;
                return (
                  <button key={r.id} onClick={() => openDetail(r.id)}
                    className="flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFB]"
                    style={{ borderBottom: idx === filtered.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${cfg.color}15` }}>
                      <Icon size={16} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: '#1A0A3B' }}>{r.cliente_nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px]" style={{ color: '#9B8FB5' }}>
                        <span className="font-mono">{r.cliente_rfc}</span>
                        <span>·</span>
                        <span>{r.uso_cfdi}</span>
                        <span>·</span>
                        <span>{r.metodo_pago}</span>
                        {agentNames[r.agent_id] && (<><span>·</span><span>por {agentNames[r.agent_id]}</span></>)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#1A0A3B' }}>{mxn(r.total, r.currency)}</span>
                      <div className="flex items-center gap-2">
                        <StatusChip s={r.status} />
                        <span className="text-[11px]" style={{ color: '#9B8FB5' }}>{timeAgo(r.requested_at)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {selected && (
        <DetailModal
          request={selected}
          token={token}
          pacConnected={pacConnected}
          onClose={() => setSelected(null)}
          onMarkInProgress={markInProgress}
          onMarkIssued={markIssued}
          onCancel={cancelRequest}
          onStamp={() => stampRequest(selected.id)}
          onMarkManual={() => markManual(selected.id)}
          onRequestCfdiCancel={() => setCancelTarget(selected)}
          onConfirmCancellation={confirmCancellation}
          onRejectCancellation={rejectCancellation}
        />
      )}

      {cancelTarget && (
        <CancelCfdiModal
          request={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSubmit={(motivo, uuidSustituto, razonCliente) =>
            requestCfdiCancellation(cancelTarget, motivo, uuidSustituto, razonCliente)
          }
        />
      )}
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({
  request,
  token,
  pacConnected,
  onClose,
  onMarkInProgress,
  onMarkIssued,
  onCancel,
  onStamp,
  onMarkManual,
  onRequestCfdiCancel,
  onConfirmCancellation,
  onRejectCancellation,
}: {
  request:                Detail;
  token:                  string;
  pacConnected:           boolean;
  onClose:                () => void;
  onMarkInProgress:       () => void;
  onMarkIssued:           (uuid: string, folio: string) => void;
  onCancel:               (reason: string) => void;
  onStamp:                () => void;
  onMarkManual:           () => void;
  onRequestCfdiCancel:    () => void;
  onConfirmCancellation:  (cancellationId: string) => void;
  onRejectCancellation:   (cancellationId: string, notes: string) => void;
}) {
  const [uuid,              setUuid]              = useState('');
  const [folio,             setFolio]             = useState('');
  const [cancelReason,      setCancelReason]      = useState('');
  const [showCancel,        setShowCancel]        = useState(false);
  const [stamping,          setStamping]          = useState(false);
  const [marking,           setMarking]           = useState(false);
  // Cancellation_requested state: fetch the pending cfdi_cancellation id
  const [cancellationId,    setCancellationId]    = useState<string | null>(null);
  const [rejectNotes,       setRejectNotes]       = useState('');
  const [showRejectInput,   setShowRejectInput]   = useState(false);
  const [loadingCancel,     setLoadingCancel]     = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  // Fetch pending cancellation id when status is cancellation_requested
  useEffect(() => {
    if (request.status !== 'cancellation_requested') return;
    setLoadingCancel(true);
    fetch(`/api/portal/${token}/cancellations?factura_request_id=${request.id}`)
      .then(r => r.json())
      .then(d => { if (d.cancellation?.id) setCancellationId(d.cancellation.id); })
      .catch(() => {/* best-effort */})
      .finally(() => setLoadingCancel(false));
  }, [request.id, request.status, token]);

  const s           = request.status;
  const isStamped   = s === 'stamped' || s === 'issued';
  const isTerminal  = isStamped || s === 'cancelled' || s === 'marked_manual';
  const isFailed    = s === 'stamp_failed';
  const isPending   = s === 'pending' || s === 'in_progress';

  async function handleStamp() {
    setStamping(true);
    try { await onStamp(); } finally { setStamping(false); }
  }

  async function handleMarkManual() {
    setMarking(true);
    try { await onMarkManual(); } finally { setMarking(false); }
  }

  const xmlUrl = `/api/portal/${token}/factura-requests/${request.id}/xml`;
  const pdfUrl = `/api/portal/${token}/factura-requests/${request.id}/pdf`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl m-4 rounded-2xl overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: '1px solid #E8E3F5' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Solicitud de factura</p>
            <h2 className="text-lg font-bold mt-1" style={{ color: '#1A0A3B' }}>{request.cliente_nombre}</h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusChip s={request.status} />
              <span className="text-xs" style={{ color: '#9B8FB5' }}>solicitada {timeAgo(request.requested_at)}</span>
              {request.resolved_at && <span className="text-xs" style={{ color: '#9B8FB5' }}>· resuelta {timeAgo(request.resolved_at)}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-lg hover:opacity-80" style={{ background: '#FAFAFB', color: '#6B6480' }}>Cerrar</button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
          <Section title="Datos del receptor">
            <Row k="Razon social"  v={request.cliente_nombre} />
            <Row k="RFC"           v={request.cliente_rfc} mono copyable />
            <Row k="Correo fiscal" v={request.cliente_email} copyable />
            {request.cliente_telefono  && <Row k="Telefono"  v={request.cliente_telefono} />}
            {request.cliente_direccion && <Row k="Direccion" v={request.cliente_direccion} />}
          </Section>

          <Section title="Datos fiscales">
            <Row k="Uso CFDI"       v={request.uso_cfdi} copyable />
            <Row k="Forma de pago"  v={request.forma_pago} copyable />
            <Row k="Metodo de pago" v={request.metodo_pago} copyable />
            {request.condiciones_pago && <Row k="Condiciones" v={request.condiciones_pago} />}
          </Section>

          <Section title="Conceptos">
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E8E3F5' }}>
              <table className="w-full text-xs">
                <thead style={{ background: '#FAFAFB', color: '#9B8FB5' }}>
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold uppercase tracking-wide text-[10px]">Descripcion</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px] w-16">Cant.</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px] w-24">P. Unit.</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px] w-28">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {request.items.map((it, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #E8E3F5' }}>
                      <td className="py-2 px-3" style={{ color: '#1A0A3B' }}>{it.descripcion}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: '#1A0A3B' }}>{it.cantidad}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: '#1A0A3B' }}>{mxn(it.precio_unitario)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: '#1A0A3B' }}>{mxn(it.cantidad * it.precio_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-0.5 mt-3 text-xs" style={{ color: '#6B6480' }}>
              <div className="flex gap-6"><span>Subtotal</span><span className="tabular-nums w-24 text-right" style={{ color: '#1A0A3B' }}>{mxn(request.subtotal, request.currency)}</span></div>
              {request.iva > 0 && (<div className="flex gap-6"><span>IVA</span><span className="tabular-nums w-24 text-right" style={{ color: '#1A0A3B' }}>{mxn(request.iva, request.currency)}</span></div>)}
              <div className="flex gap-6 mt-1 pt-1 text-sm font-bold" style={{ borderTop: '1.5px solid #1A0A3B', color: '#1A0A3B' }}>
                <span>Total</span>
                <span className="tabular-nums w-24 text-right">{mxn(request.total, request.currency)}</span>
              </div>
            </div>
          </Section>

          {request.notes && (
            <Section title="Notas del empleado">
              <p className="text-xs leading-relaxed" style={{ color: '#1A0A3B' }}>{request.notes}</p>
            </Section>
          )}

          {request.guardrail_reason && (
            <Section title="Razon del guardrail">
              <p className="text-xs leading-relaxed" style={{ color: '#ef4444' }}>{request.guardrail_reason}</p>
            </Section>
          )}

          {(s === 'stamped' || s === 'issued') && (request.issued_uuid || request.issued_folio) && (
            <Section title="Datos de emision">
              {request.issued_folio && <Row k="Folio" v={request.issued_folio} mono />}
              {request.issued_uuid  && <Row k="UUID"  v={request.issued_uuid} mono copyable />}
              {request.resolved_by  && <Row k="Marcada por" v={request.resolved_by} />}
            </Section>
          )}
        </div>

        {/* Actions footer */}
        <div className="px-6 py-4 flex flex-col gap-3" style={{ borderTop: '1px solid #E8E3F5', background: '#FAFAFB' }}>

          {/* Stamped / issued: downloads + solicitar cancelacion */}
          {isStamped && (
            <div className="flex flex-wrap gap-2">
              <a
                href={xmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                <Download size={12} /> Descargar XML
              </a>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                <Download size={12} /> Descargar PDF
              </a>
              <button
                onClick={onRequestCfdiCancel}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 ml-auto"
                style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <Ban size={12} /> Solicitar cancelacion
              </button>
            </div>
          )}

          {/* Stamping in progress: indicator */}
          {s === 'stamping' && (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#6B6480' }}>
              <Loader2 size={13} className="animate-spin" style={{ color: '#6C3BFF' }} />
              <span>Timbrado en progreso...</span>
            </div>
          )}

          {/* Cancellation requested: confirm or reject */}
          {s === 'cancellation_requested' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#92400e' }}>
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>Hay una solicitud de cancelacion pendiente. Confirma para enviarla al SAT via PAC, o rechazala para revertir la factura a estado <em>Emitida</em>.</span>
              </div>
              {loadingCancel ? (
                <div className="flex items-center gap-2 text-xs" style={{ color: '#9B8FB5' }}>
                  <Loader2 size={12} className="animate-spin" /> Cargando solicitud...
                </div>
              ) : !cancellationId ? (
                <p className="text-xs" style={{ color: '#9B8FB5' }}>No se encontro la solicitud de cancelacion asociada.</p>
              ) : showRejectInput ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
                    Motivo del rechazo (opcional)
                  </label>
                  <input
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    autoFocus
                    placeholder="Ej: El cliente cambio de opinion"
                    className="w-full rounded-lg px-3 py-2 text-xs"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => onRejectCancellation(cancellationId, rejectNotes)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{ background: '#ef4444', color: '#fff' }}
                    >
                      <XCircle size={12} /> Confirmar rechazo
                    </button>
                    <button
                      onClick={() => setShowRejectInput(false)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}
                    >
                      Volver
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onConfirmCancellation(cancellationId)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{ background: '#6C3BFF', color: '#fff' }}
                  >
                    <CheckCircle size={12} /> Confirmar y enviar al SAT
                  </button>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 ml-auto"
                    style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}
                  >
                    <XCircle size={12} /> Rechazar solicitud
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pending + PAC connected: stamp now */}
          {isPending && pacConnected && !showCancel && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleStamp}
                disabled={stamping}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#6C3BFF', color: '#fff' }}
              >
                <Stamp size={12} /> {stamping ? 'Timbrando...' : 'Emitir con SF ahora'}
              </button>
              <button
                onClick={handleMarkManual}
                disabled={marking}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'rgba(107,114,128,0.1)', color: '#374151', border: '1px solid rgba(107,114,128,0.2)' }}
              >
                <Check size={12} /> {marking ? 'Guardando...' : 'Marcar como manual'}
              </button>
              {s === 'pending' && (
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
          )}

          {/* Pending, no PAC: manual mark only */}
          {isPending && !pacConnected && !showCancel && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleMarkManual}
                  disabled={marking}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#22c55e', color: '#fff' }}
                >
                  <CheckCircle size={12} /> {marking ? 'Guardando...' : 'Marcar como emitida manual'}
                </button>
                {s === 'pending' && (
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
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#9B8FB5' }}>UUID (opcional)</label>
                  <input value={uuid} onChange={e => setUuid(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="w-full rounded-lg px-3 py-2 text-xs font-mono"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }} />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#9B8FB5' }}>Folio (opcional)</label>
                  <input value={folio} onChange={e => setFolio(e.target.value)} placeholder="FAC-1234"
                    className="w-full rounded-lg px-3 py-2 text-xs font-mono"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }} />
                </div>
                <button onClick={() => onMarkIssued(uuid, folio)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#22c55e', color: '#fff' }}>
                  <CheckCircle size={12} /> Marcar como emitida
                </button>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: '#9B8FB5' }}>
                Conecta tu PAC desde Configurar para timbrar automaticamente. Por ahora puedes marcar manualmente con UUID y folio opcionales.
              </p>
            </>
          )}

          {/* stamp_failed: retry + mark manual */}
          {isFailed && !showCancel && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleStamp}
                disabled={stamping}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#6C3BFF', color: '#fff' }}
              >
                <RefreshCw size={12} /> {stamping ? 'Reintentando...' : 'Reintentar timbrado'}
              </button>
              <button
                onClick={handleMarkManual}
                disabled={marking}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'rgba(107,114,128,0.1)', color: '#374151', border: '1px solid rgba(107,114,128,0.2)' }}
              >
                <Check size={12} /> {marking ? 'Guardando...' : 'Marcar manual'}
              </button>
              <button onClick={() => setShowCancel(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 ml-auto"
                style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                <XCircle size={12} /> Cancelar solicitud
              </button>
            </div>
          )}

          {/* Cancel confirmation panel */}
          {showCancel && (
            <div className="flex flex-col gap-2">
              <label className="block text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Razon de la cancelacion</label>
              <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} autoFocus
                placeholder="Ej: RFC no valido, cliente ya no lo necesita, factura duplicada"
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }} />
              <div className="flex gap-2">
                <button onClick={() => onCancel(cancelReason)} disabled={!cancelReason.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#ef4444', color: '#fff' }}>
                  <XCircle size={12} /> Confirmar cancelacion
                </button>
                <button onClick={() => setShowCancel(false)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>{title}</p>
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
      <div className="w-32 shrink-0" style={{ color: '#9B8FB5' }}>{k}</div>
      <div className={`flex-1 ${mono ? 'font-mono' : ''}`} style={{ color: '#1A0A3B' }}>{v}</div>
      {copyable && (
        <button onClick={copy} title="Copiar" className="p-1 rounded hover:opacity-80" style={{ color: copied ? '#22c55e' : '#9B8FB5' }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
    </div>
  );
}

// ─── Cancel CFDI modal ────────────────────────────────────────────────────────

const MOTIVO_LABELS: Record<string, string> = {
  '01': '01 — Comprobante emitido con errores con relacion',
  '02': '02 — Comprobante emitido con errores sin relacion',
  '03': '03 — No se llevo a cabo la operacion',
  '04': '04 — Operacion nominativa relacionada en una factura global',
};

function CancelCfdiModal({
  request,
  onClose,
  onSubmit,
}: {
  request:  Detail;
  onClose:  () => void;
  onSubmit: (motivo: '01' | '02' | '03' | '04', uuidSustituto: string, razonCliente: string) => Promise<void>;
}) {
  const [motivo,         setMotivo]         = useState<'01' | '02' | '03' | '04'>('02');
  const [uuidSustituto,  setUuidSustituto]  = useState('');
  const [razonCliente,   setRazonCliente]   = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (motivo === '01' && !uuidSustituto.trim()) {
      alert('El motivo 01 requiere el UUID del comprobante sustituto.');
      return;
    }
    setSubmitting(true);
    try { await onSubmit(motivo, uuidSustituto.trim(), razonCliente.trim()); }
    finally { setSubmitting(false); }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md m-4 rounded-2xl overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: '1px solid #E8E3F5' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Cancelacion CFDI</p>
            <h2 className="text-base font-bold mt-1" style={{ color: '#1A0A3B' }}>{request.cliente_nombre}</h2>
            {request.issued_uuid && (
              <p className="text-[11px] font-mono mt-0.5" style={{ color: '#9B8FB5' }}>
                {request.issued_uuid.slice(0, 8).toUpperCase()}...{request.issued_uuid.slice(-8).toUpperCase()}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-lg hover:opacity-80" style={{ background: '#FAFAFB', color: '#6B6480' }}>
            Cerrar
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 flex flex-col gap-4">
          {/* Warning */}
          <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#7f1d1d' }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>Esta accion registra una solicitud de cancelacion ante el SAT. El receptor recibira una notificacion y debera aceptarla. Es irreversible una vez enviada.</span>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#9B8FB5' }}>
              Motivo SAT
            </label>
            <select
              value={motivo}
              onChange={e => setMotivo(e.target.value as '01' | '02' | '03' | '04')}
              className="w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            >
              {(['01', '02', '03', '04'] as const).map(m => (
                <option key={m} value={m}>{MOTIVO_LABELS[m]}</option>
              ))}
            </select>
          </div>

          {/* UUID sustituto (solo motivo 01) */}
          {motivo === '01' && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#9B8FB5' }}>
                UUID del CFDI sustituto <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                value={uuidSustituto}
                onChange={e => setUuidSustituto(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-lg px-3 py-2 text-xs font-mono"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              />
            </div>
          )}

          {/* Razon para el cliente (opcional) */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#9B8FB5' }}>
              Razon interna (opcional)
            </label>
            <input
              value={razonCliente}
              onChange={e => setRazonCliente(e.target.value)}
              placeholder="Ej: Error en RFC del receptor"
              className="w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid #E8E3F5', background: '#FAFAFB' }}>
          <button
            onClick={handleSubmit}
            disabled={submitting || (motivo === '01' && !uuidSustituto.trim())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            <Ban size={12} /> {submitting ? 'Enviando...' : 'Solicitar cancelacion'}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}
          >
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}
