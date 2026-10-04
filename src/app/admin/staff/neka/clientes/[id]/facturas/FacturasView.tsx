'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, FileText, Upload, Download, Loader2, CheckCircle2, Clock, Receipt,
  Search, X, Filter, AlertTriangle, TrendingUp,
} from 'lucide-react';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';
import { useApi } from '@/lib/hooks/useApi';
import { formatMoney } from '@/lib/format/money';

interface Factura {
  id:                    string;
  tipo:                  'cfdi_emitido' | 'rep_emitido' | string;
  cfdi_uuid:             string | null;
  related_uuid:          string | null;
  ciclo_key:             string | null;
  monto:                 number | null;
  subtotal:              number | null;
  iva:                   number | null;
  moneda:                string | null;
  metodo_pago_cfdi:      'PUE' | 'PPD' | null;
  forma_pago_cfdi:       string | null;
  uso_cfdi:              string | null;
  xml_path:              string | null;
  pdf_path:              string | null;
  paid_at:               string | null;
  rep_reminder_at:       string | null;
  rep_reminder_sent_at:  string | null;
  created_at:            string;
}

type EstadoFilter  = 'todas' | 'pagadas' | 'sin_pago' | 'sin_rep' | 'con_rep';
type TipoFilter    = 'todas' | 'PUE' | 'PPD';
type Tab           = 'facturas' | 'reps';

const PAGE_SIZE = 20;

function shortUuid(u: string | null): string {
  if (!u) return '—';
  return u.slice(0, 8).toUpperCase() + '…';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props {
  clienteId:         string;
  razonSocial:       string;
  rfc:               string;
  correoFacturacion: string;
}

export function FacturasView({ clienteId, razonSocial, rfc, correoFacturacion }: Props) {
  const {
    data:      facturas = [],
    error:     fetchError,
    isLoading: loading,
    mutate,
  } = useApi<Factura[]>(`/api/admin/staff/neka/clientes/${clienteId}/facturas`, { key: 'facturas' });

  const [uiError, setUiError] = useState<string | null>(null);
  const displayError = uiError ?? fetchError?.message ?? null;

  // Active tab
  const [tab, setTab] = useState<Tab>('facturas');

  // Filters (compartidos entre tabs; el filtro de estado y método solo aplica a facturas)
  const [search, setSearch]     = useState('');
  const [yearFilter, setYear]   = useState<'todos' | number>('todos');
  const [tipoFilter, setTipo]   = useState<TipoFilter>('todas');
  const [estadoFilter, setEst]  = useState<EstadoFilter>('todas');
  const [page, setPage]         = useState(0);

  // Reset página cuando cambia tab
  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(0);
    setSearch('');
  };

  // Upload state
  const [xmlFile, setXmlFile]   = useState<File | null>(null);
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [cicloKey, setCicloKey] = useState('');
  const [uploading, setUp]      = useState(false);

  // Sub-modal REP
  const [repFor, setRepFor] = useState<Factura | null>(null);

  // ─── Data derivations ────────────────────────────────────────────────────
  const ingresos = useMemo(() => facturas.filter(f => f.tipo === 'cfdi_emitido'), [facturas]);
  const reps     = useMemo(() => facturas.filter(f => f.tipo === 'rep_emitido'), [facturas]);
  const repsByRelated = useMemo(() => {
    const m = new Map<string, Factura>();
    for (const r of reps) if (r.related_uuid) m.set(r.related_uuid, r);
    return m;
  }, [reps]);
  const cfdisByUuid = useMemo(() => {
    const m = new Map<string, Factura>();
    for (const c of ingresos) if (c.cfdi_uuid) m.set(c.cfdi_uuid, c);
    return m;
  }, [ingresos]);

  // Stats — Facturas
  const currentYear = new Date().getFullYear();
  const thisYearIngresos = ingresos.filter(f => new Date(f.created_at).getFullYear() === currentYear);
  const totalYear      = thisYearIngresos.reduce((sum, f) => sum + (f.monto ?? 0), 0);
  const totalHistorico = ingresos.reduce((sum, f) => sum + (f.monto ?? 0), 0);
  const pendientesRep  = ingresos.filter(f =>
    f.metodo_pago_cfdi === 'PPD' && f.paid_at && !repsByRelated.get(f.cfdi_uuid ?? ''),
  ).length;
  const sinPagoPPD     = ingresos.filter(f => f.metodo_pago_cfdi === 'PPD' && !f.paid_at).length;

  // Stats — REPs
  const thisYearReps = reps.filter(r => new Date(r.created_at).getFullYear() === currentYear);
  const totalRepsYear = thisYearReps.reduce((sum, r) => sum + (r.monto ?? 0), 0);
  const repsHuerfanos = reps.filter(r => !r.related_uuid || !cfdisByUuid.get(r.related_uuid)).length;

  // Available years — separado por tab para no mostrar años vacíos
  const yearsFacturas = useMemo(() => {
    const set = new Set<number>();
    for (const f of ingresos) set.add(new Date(f.created_at).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [ingresos]);
  const yearsReps = useMemo(() => {
    const set = new Set<number>();
    for (const r of reps) set.add(new Date(r.created_at).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [reps]);
  const years = tab === 'facturas' ? yearsFacturas : yearsReps;

  // Filtered list — depende del tab activo
  const filtered = useMemo(() => {
    if (tab === 'facturas') {
      let list = [...ingresos];
      if (yearFilter !== 'todos') list = list.filter(f => new Date(f.created_at).getFullYear() === yearFilter);
      if (tipoFilter !== 'todas') list = list.filter(f => f.metodo_pago_cfdi === tipoFilter);
      if (estadoFilter === 'pagadas')  list = list.filter(f => !!f.paid_at);
      if (estadoFilter === 'sin_pago') list = list.filter(f => f.metodo_pago_cfdi === 'PPD' && !f.paid_at);
      if (estadoFilter === 'sin_rep')  list = list.filter(f => f.metodo_pago_cfdi === 'PPD' && f.paid_at && !repsByRelated.get(f.cfdi_uuid ?? ''));
      if (estadoFilter === 'con_rep')  list = list.filter(f => f.cfdi_uuid && repsByRelated.get(f.cfdi_uuid));
      const q = search.trim().toLowerCase();
      if (q) {
        list = list.filter(f =>
          (f.cfdi_uuid ?? '').toLowerCase().includes(q) ||
          (f.ciclo_key ?? '').toLowerCase().includes(q) ||
          String(f.monto ?? '').includes(q),
        );
      }
      return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    // tab === 'reps'
    let list = [...reps];
    if (yearFilter !== 'todos') list = list.filter(r => new Date(r.created_at).getFullYear() === yearFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        (r.cfdi_uuid ?? '').toLowerCase().includes(q) ||
        (r.related_uuid ?? '').toLowerCase().includes(q) ||
        String(r.monto ?? '').includes(q),
      );
    }
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [tab, ingresos, reps, yearFilter, tipoFilter, estadoFilter, search, repsByRelated]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const visible    = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const filteredTotal = filtered.reduce((sum, f) => sum + (f.monto ?? 0), 0);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const upload = async () => {
    if (!xmlFile) { setUiError('Selecciona el XML de la factura'); return; }
    if (!pdfFile) { setUiError('Selecciona el PDF de la factura'); return; }

    setUiError(null); setUp(true);
    try {
      const form = new FormData();
      form.append('xml', xmlFile);
      form.append('pdf', pdfFile);
      if (cicloKey.trim()) form.append('cicloKey', cicloKey.trim());

      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setUiError(data.error ?? 'Error al subir'); return; }

      setXmlFile(null);
      setPdfFile(null);
      setCicloKey('');
      await mutate();
    } catch (e) {
      setUiError((e as Error).message);
    } finally {
      setUp(false);
    }
  };

  const marcarPagada = async (f: Factura) => {
    const input = prompt('Fecha de pago (YYYY-MM-DD). Deja vacío para hoy.');
    if (input === null) return;
    const paidAt = input.trim() ? new Date(input.trim() + 'T12:00:00Z').toISOString() : undefined;
    try {
      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas/${f.id}/marcar-pagada`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAt }),
      });
      const data = await res.json();
      if (!res.ok) { setUiError(data.error ?? 'Error'); return; }
      await mutate();
      if (data.repReminderAt) {
        alert(`Marcada como pagada. Neka te recuerda del REP el ${fmtDate(data.repReminderAt)}.`);
      }
    } catch (e) {
      setUiError((e as Error).message);
    }
  };

  const uploadRepFiles = async (f: Factura, xml: File, pdf: File) => {
    setUiError(null);
    try {
      const form = new FormData();
      form.append('xml', xml);
      form.append('pdf', pdf);
      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas/${f.id}/rep`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error ?? 'Error al subir REP' };
      await mutate();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };

  const download = async (f: Factura, kind: 'xml' | 'pdf') => {
    try {
      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas/${f.id}/url?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) { setUiError(data.error ?? 'No se pudo generar enlace'); return; }
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      setUiError((e as Error).message);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        href="/admin/staff/neka/clientes"
        className="inline-flex items-center gap-1.5 text-[12px] mb-4 transition-colors"
        style={{ color: '#6B6480' }}
      >
        <ArrowLeft size={12} />
        Volver a Clientes
      </Link>

      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Facturas emitidas</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          {razonSocial}
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B6480' }}>
          <code className="font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(108,59,255,0.10)', color: '#6C3BFF' }}>{rfc}</code>
          {' · '}{correoFacturacion}
        </p>
      </header>

      {/* Tab strip */}
      <nav className="flex items-center gap-1 mb-5" style={{ borderBottom: '1px solid #E8E3F5' }}>
        <button
          onClick={() => changeTab('facturas')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors"
          style={{
            color:        tab === 'facturas' ? '#6C3BFF' : '#6B6480',
            borderBottom: tab === 'facturas' ? '2px solid #6C3BFF' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          <FileText size={13} />
          Facturas
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: tab === 'facturas' ? 'rgba(108,59,255,0.12)' : '#F5F0FF', color: '#6C3BFF' }}>
            {ingresos.length}
          </span>
        </button>
        <button
          onClick={() => changeTab('reps')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors"
          style={{
            color:        tab === 'reps' ? '#6C3BFF' : '#6B6480',
            borderBottom: tab === 'reps' ? '2px solid #6C3BFF' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          <Receipt size={13} />
          REPs
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: tab === 'reps' ? 'rgba(108,59,255,0.12)' : '#F5F0FF', color: '#6C3BFF' }}>
            {reps.length}
          </span>
        </button>
      </nav>

      {/* Stats — Facturas */}
      {!loading && tab === 'facturas' && ingresos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total emitidas" value={String(ingresos.length)} accent="#6C3BFF" icon={<FileText size={16} />} hint={`${thisYearIngresos.length} en ${currentYear}`} />
          <StatCard label={`Ingresado ${currentYear}`} value={formatMoney(totalYear, { minDecimals: 0, maxDecimals: 0 })} accent="#22C55E" icon={<TrendingUp size={16} />} hint={`histórico ${formatMoney(totalHistorico, { minDecimals: 0, maxDecimals: 0 })}`} />
          <StatCard label="Sin pago (PPD)" value={String(sinPagoPPD)} accent="#B45309" icon={<Clock size={16} />} hint="esperando abono" />
          <StatCard label="REPs pendientes" value={String(pendientesRep)} accent={pendientesRep > 0 ? '#EF4444' : '#22C55E'} icon={pendientesRep > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} hint={pendientesRep > 0 ? 'por timbrar' : 'todo al día'} />
        </div>
      )}

      {/* Stats — REPs */}
      {!loading && tab === 'reps' && reps.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total REPs" value={String(reps.length)} accent="#15803D" icon={<Receipt size={16} />} hint={`${thisYearReps.length} en ${currentYear}`} />
          <StatCard label={`Timbrado ${currentYear}`} value={formatMoney(totalRepsYear, { minDecimals: 0, maxDecimals: 0 })} accent="#22C55E" icon={<TrendingUp size={16} />} hint="monto de los pagos" />
          <StatCard label="REPs pendientes" value={String(pendientesRep)} accent={pendientesRep > 0 ? '#EF4444' : '#22C55E'} icon={pendientesRep > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} hint={pendientesRep > 0 ? 'PPD sin REP' : 'todo al día'} />
          <StatCard label="Sin factura padre" value={String(repsHuerfanos)} accent={repsHuerfanos > 0 ? '#B45309' : '#22C55E'} icon={<FileText size={16} />} hint={repsHuerfanos > 0 ? 'huérfanos, revisar' : 'todos ligados'} />
        </div>
      )}

      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9B8FB5' }} />
          <input
            type="text"
            placeholder={tab === 'facturas' ? 'Buscar por UUID, ciclo o monto…' : 'Buscar por UUID del REP, factura padre o monto…'}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-9 rounded-xl text-[13px] outline-none transition-shadow"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B', height: 38 }}
            onFocus={e => { e.currentTarget.style.borderColor = '#6C3BFF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,59,255,0.08)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E8E3F5'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0); }} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#9B8FB5' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <FilterSelect value={yearFilter === 'todos' ? 'todos' : String(yearFilter)} onChange={v => { setYear(v === 'todos' ? 'todos' : Number(v)); setPage(0); }}>
          <option value="todos">Todos los años</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </FilterSelect>

        {tab === 'facturas' && (
          <>
            <FilterSelect value={tipoFilter} onChange={v => { setTipo(v as TipoFilter); setPage(0); }}>
              <option value="todas">Todos los métodos</option>
              <option value="PUE">PUE</option>
              <option value="PPD">PPD</option>
            </FilterSelect>

            <FilterSelect value={estadoFilter} onChange={v => { setEst(v as EstadoFilter); setPage(0); }}>
              <option value="todas">Todos los estados</option>
              <option value="pagadas">Pagadas</option>
              <option value="sin_pago">Sin pago (PPD)</option>
              <option value="sin_rep">REP pendiente</option>
              <option value="con_rep">Con REP timbrado</option>
            </FilterSelect>
          </>
        )}

        {filtered.length > 0 && (
          <div className="ml-auto rounded-xl px-4 py-2" style={{ background: '#F5F0FF', border: '1px solid #E8E3F5' }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#9B6DFF' }}>Suma filtrada</span>{' '}
            <span className="text-[14px] font-bold tabular-nums ml-1" style={{ color: '#1A0A3B' }}>
              {formatMoney(filteredTotal, { minDecimals: 0, maxDecimals: 0 })}
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {displayError && (
        <div className="mb-4">
          <OficinaModal.Alert tone="danger">{displayError}</OficinaModal.Alert>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-[13px] mb-4" style={{ color: '#6B6480' }}>
          <Loader2 size={14} className="animate-spin" style={{ color: '#6C3BFF' }} /> Cargando facturas…
        </div>
      )}

      {/* Empty state — Facturas */}
      {!loading && tab === 'facturas' && ingresos.length === 0 && (
        <div className="rounded-2xl text-center flex flex-col items-center gap-3 mb-4" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '48px 24px' }}>
          <div className="flex items-center justify-center rounded-2xl" style={{ background: 'rgba(108,59,255,0.08)', width: 56, height: 56 }}>
            <FileText size={24} style={{ color: '#6C3BFF' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>Sin facturas registradas</p>
            <p className="text-[13px] mt-1 max-w-md" style={{ color: '#6B6480' }}>
              Sube el primer XML+PDF cuando timbres una factura en el portal del PAC.
            </p>
          </div>
        </div>
      )}

      {/* Empty state — REPs */}
      {!loading && tab === 'reps' && reps.length === 0 && (
        <div className="rounded-2xl text-center flex flex-col items-center gap-3 mb-4" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '48px 24px' }}>
          <div className="flex items-center justify-center rounded-2xl" style={{ background: 'rgba(21,128,61,0.10)', width: 56, height: 56 }}>
            <Receipt size={24} style={{ color: '#15803D' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>Sin REPs registrados</p>
            <p className="text-[13px] mt-1 max-w-md" style={{ color: '#6B6480' }}>
              Los complementos de pago aparecen aquí cuando timbres uno para una factura PPD. Usa el botón &ldquo;Subir REP&rdquo; en la tabla de Facturas para registrarlos.
            </p>
          </div>
        </div>
      )}

      {/* Filtered empty */}
      {!loading && filtered.length === 0 && ((tab === 'facturas' && ingresos.length > 0) || (tab === 'reps' && reps.length > 0)) && (
        <div className="rounded-2xl text-center py-10 mb-4" style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5' }}>
          <p className="text-[13px]" style={{ color: '#6B6480' }}>
            {tab === 'facturas' ? 'Ninguna factura' : 'Ningún REP'} coincide con los filtros aplicados.
          </p>
        </div>
      )}

      {/* Table — Facturas */}
      {tab === 'facturas' && visible.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ background: '#FAFAFB' }}>
                <tr>
                  <Th>UUID</Th>
                  <Th>Método</Th>
                  <Th>Ciclo</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Emitida</Th>
                  <Th>REP</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(f => {
                  const rep   = f.cfdi_uuid ? repsByRelated.get(f.cfdi_uuid) : undefined;
                  const isPPD = f.metodo_pago_cfdi === 'PPD';
                  const paid  = !!f.paid_at;
                  return (
                    <tr key={f.id} style={{ borderTop: '1px solid #F0EBFA' }} className="transition-colors hover:bg-[#FAFAFB]">
                      <Td>
                        <code className="text-[12px] font-mono font-semibold" style={{ color: '#6C3BFF' }}>{shortUuid(f.cfdi_uuid)}</code>
                      </Td>
                      <Td>
                        {f.metodo_pago_cfdi && (
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(108,59,255,0.10)', color: '#6C3BFF' }}>
                            {f.metodo_pago_cfdi}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {f.ciclo_key && (
                          <span className="text-[12px]" style={{ color: '#6B6480' }}>{f.ciclo_key}</span>
                        )}
                      </Td>
                      <Td>
                        {paid ? (
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.10)', color: '#15803D' }}>
                            <CheckCircle2 size={10} /> Pagada
                          </span>
                        ) : isPPD ? (
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1" style={{ background: 'rgba(180,83,9,0.10)', color: '#B45309' }}>
                            <Clock size={10} /> Sin pago
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1" style={{ background: 'rgba(108,59,255,0.10)', color: '#6C3BFF' }}>
                            Contado
                          </span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <span className="text-[14px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>{formatMoney(f.monto)}</span>
                      </Td>
                      <Td>
                        <span className="text-[12px]" style={{ color: '#6B6480' }}>{fmtDate(f.created_at)}</span>
                        {paid && (
                          <p className="text-[11px] mt-0.5" style={{ color: '#15803D' }}>Pago: {fmtDate(f.paid_at)}</p>
                        )}
                      </Td>
                      <Td>
                        {rep ? (
                          <span className="text-[11px] font-mono inline-flex items-center gap-1" style={{ color: '#15803D' }}>
                            <Receipt size={11} /> {shortUuid(rep.cfdi_uuid)}
                          </span>
                        ) : isPPD && paid ? (
                          <span className="text-[11px] font-semibold" style={{ color: '#B45309' }}>Pendiente</span>
                        ) : (
                          <span className="text-[11px]" style={{ color: '#9B8FB5' }}>—</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5 justify-end">
                          <ActionButton onClick={() => download(f, 'xml')} title="Descargar XML">
                            <Download size={12} />
                          </ActionButton>
                          <ActionButton onClick={() => download(f, 'pdf')} title="Descargar PDF">
                            <FileText size={12} />
                          </ActionButton>
                          {isPPD && !paid && (
                            <ActionButton onClick={() => marcarPagada(f)} title="Marcar pagada" tone="success">
                              <CheckCircle2 size={12} />
                            </ActionButton>
                          )}
                          {isPPD && paid && !rep && (
                            <ActionButton onClick={() => setRepFor(f)} title="Subir REP" tone="warning">
                              <Receipt size={12} />
                            </ActionButton>
                          )}
                          {rep && (
                            <>
                              <ActionButton onClick={() => download(rep, 'xml')} title="XML del REP" tone="rep">
                                <Download size={12} />
                              </ActionButton>
                              <ActionButton onClick={() => download(rep, 'pdf')} title="PDF del REP" tone="rep">
                                <FileText size={12} />
                              </ActionButton>
                            </>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table — REPs */}
      {tab === 'reps' && visible.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ background: '#FAFAFB' }}>
                <tr>
                  <Th>UUID del REP</Th>
                  <Th>Factura padre</Th>
                  <Th>Ciclo padre</Th>
                  <Th className="text-right">Monto pago</Th>
                  <Th>Timbrado</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const padre = r.related_uuid ? cfdisByUuid.get(r.related_uuid) : undefined;
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid #F0EBFA' }} className="transition-colors hover:bg-[#FAFAFB]">
                      <Td>
                        <code className="text-[12px] font-mono font-semibold inline-flex items-center gap-1.5" style={{ color: '#15803D' }}>
                          <Receipt size={11} />
                          {shortUuid(r.cfdi_uuid)}
                        </code>
                      </Td>
                      <Td>
                        {padre ? (
                          <button
                            onClick={() => { changeTab('facturas'); setSearch(r.related_uuid ?? ''); }}
                            className="text-[12px] font-mono font-semibold hover:underline"
                            style={{ color: '#6C3BFF' }}
                            title="Ver factura padre"
                          >
                            {shortUuid(r.related_uuid)}
                          </button>
                        ) : r.related_uuid ? (
                          <span className="text-[12px] font-mono" style={{ color: '#B45309' }} title="Factura padre no encontrada">
                            {shortUuid(r.related_uuid)} <span className="ml-1">⚠</span>
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: '#9B8FB5' }}>Huérfano</span>
                        )}
                      </Td>
                      <Td>
                        {padre?.ciclo_key ? (
                          <span className="text-[12px]" style={{ color: '#6B6480' }}>{padre.ciclo_key}</span>
                        ) : (
                          <span className="text-[11px]" style={{ color: '#9B8FB5' }}>—</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <span className="text-[14px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>{formatMoney(r.monto)}</span>
                      </Td>
                      <Td>
                        <span className="text-[12px]" style={{ color: '#6B6480' }}>{fmtDate(r.created_at)}</span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5 justify-end">
                          <ActionButton onClick={() => download(r, 'xml')} title="Descargar XML del REP" tone="rep">
                            <Download size={12} />
                          </ActionButton>
                          <ActionButton onClick={() => download(r, 'pdf')} title="Descargar PDF del REP" tone="rep">
                            <FileText size={12} />
                          </ActionButton>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-[12px]" style={{ color: '#6B6480' }}>
            Mostrando {visible.length} de {filtered.length} · Página {safePage + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#6B6480', opacity: safePage === 0 ? 0.4 : 1, cursor: safePage === 0 ? 'not-allowed' : 'pointer' }}
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#6B6480', opacity: safePage >= totalPages - 1 ? 0.4 : 1, cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Upload area — solo tab Facturas */}
      {tab === 'facturas' && (
        <div className="rounded-2xl flex flex-col gap-3" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '18px 20px' }}>
          <div>
            <p className="text-[13px] font-bold" style={{ color: '#1A0A3B' }}>Registrar factura ya timbrada</p>
            <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
              Neka parsea el XML para extraer UUID, montos, método de pago y uso CFDI.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <OficinaModal.Field label="XML del CFDI">
              <OficinaModal.FileInput accept="application/xml,text/xml,.xml" placeholder="Selecciona XML…" onChange={setXmlFile} />
            </OficinaModal.Field>
            <OficinaModal.Field label="PDF del CFDI">
              <OficinaModal.FileInput accept="application/pdf,.pdf" placeholder="Selecciona PDF…" onChange={setPdfFile} />
            </OficinaModal.Field>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 max-w-xs">
              <OficinaModal.Field label="Ciclo" hint="opcional">
                <OficinaModal.Input
                  value={cicloKey}
                  onChange={e => setCicloKey(e.target.value)}
                  placeholder="2026-09"
                  maxLength={20}
                />
              </OficinaModal.Field>
            </div>
            <button
              onClick={upload}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all shrink-0"
              style={{
                padding:    '9px 18px',
                height:     40,
                background: uploading ? '#B9A8E8' : '#6C3BFF',
                color:      '#ffffff',
                boxShadow:  uploading ? 'none' : '0 2px 8px rgba(108,59,255,0.32)',
                cursor:     uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              Registrar factura
            </button>
          </div>
        </div>
      )}

      {/* Info banner — tab REPs */}
      {tab === 'reps' && reps.length > 0 && (
        <div className="rounded-xl flex items-start gap-3" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.20)', padding: '12px 14px' }}>
          <Receipt size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#6C3BFF' }} />
          <p className="text-[12px] leading-relaxed" style={{ color: '#4A3B6B' }}>
            Los REPs se registran desde el tab <button onClick={() => changeTab('facturas')} className="font-semibold underline" style={{ color: '#6C3BFF' }}>Facturas</button> — busca la factura PPD ya pagada y usa el botón &ldquo;Subir REP&rdquo; en sus acciones.
          </p>
        </div>
      )}

      {/* REP upload modal */}
      {repFor && (
        <RepUploadModal
          factura={repFor}
          onClose={() => setRepFor(null)}
          onSubmit={async (xml, pdf) => {
            const result = await uploadRepFiles(repFor, xml, pdf);
            if (result.ok) setRepFor(null);
            return result;
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value, accent, icon, hint }: { label: string; value: string; accent: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl transition-all" style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-lg" style={{ background: `${accent}1A`, color: accent, width: 28, height: 28 }}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>{label}</p>
      </div>
      <p className="text-[22px] font-bold tracking-tight leading-none tabular-nums" style={{ color: '#1A0A3B' }}>{value}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>{hint}</p>}
    </div>
  );
}

function FilterSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', height: 38 }}>
      <Filter size={12} style={{ color: '#9B8FB5' }} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-[13px] bg-transparent outline-none cursor-pointer pr-2"
        style={{ color: '#1A0A3B' }}
      >
        {children}
      </select>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] whitespace-nowrap ${className}`} style={{ color: '#6B6480' }}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 whitespace-nowrap ${className}`}>{children}</td>;
}

function ActionButton({ children, onClick, title, tone = 'default' }: {
  children:  React.ReactNode;
  onClick:   () => void;
  title:     string;
  tone?:     'default' | 'success' | 'warning' | 'rep';
}) {
  const palette = {
    default: { bg: 'rgba(108,59,255,0.08)', color: '#6C3BFF' },
    success: { bg: 'rgba(34,197,94,0.10)',  color: '#15803D' },
    warning: { bg: 'rgba(180,83,9,0.10)',   color: '#B45309' },
    rep:     { bg: 'rgba(15,128,61,0.08)',  color: '#15803D' },
  }[tone];
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
      style={{ width: 30, height: 30, background: palette.bg, color: palette.color }}
    >
      {children}
    </button>
  );
}

// ─── REP Upload Modal ──────────────────────────────────────────────────────

interface RepUploadModalProps {
  factura:  Factura;
  onClose:  () => void;
  onSubmit: (xml: File, pdf: File) => Promise<{ ok: boolean; error?: string }>;
}

function RepUploadModal({ factura, onClose, onSubmit }: RepUploadModalProps) {
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!xmlFile) { setErr('Selecciona el XML del REP'); return; }
    if (!pdfFile) { setErr('Selecciona el PDF del REP'); return; }
    setErr(null); setSubmitting(true);
    const result = await onSubmit(xmlFile, pdfFile);
    setSubmitting(false);
    if (!result.ok) setErr(result.error ?? 'Error al subir REP');
  };

  return (
    <OficinaModal
      open
      onClose={onClose}
      size="md"
      eyebrow="Complemento de pago"
      title="Subir REP timbrado"
      description={`REP para la factura ${shortUuid(factura.cfdi_uuid)}. Sube el XML y el PDF ya timbrados en el portal del PAC.`}
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose} disabled={submitting}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={submit} loading={submitting}>Subir REP</OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #F0EBFA', padding: '12px 14px' }}>
          <div className="flex items-center justify-center rounded-lg" style={{ background: 'rgba(108,59,255,0.10)', width: 36, height: 36 }}>
            <Receipt size={16} style={{ color: '#6C3BFF' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: '#9B6DFF' }}>Factura de origen</p>
            <p className="text-[14px] font-mono truncate" style={{ color: '#1A0A3B' }}>{shortUuid(factura.cfdi_uuid)}</p>
          </div>
        </div>

        <OficinaModal.Field label="XML del REP">
          <OficinaModal.FileInput accept="application/xml,text/xml,.xml" placeholder="Selecciona el XML del complemento…" onChange={setXmlFile} />
        </OficinaModal.Field>

        <OficinaModal.Field label="PDF del REP">
          <OficinaModal.FileInput accept="application/pdf,.pdf" placeholder="Selecciona el PDF del complemento…" onChange={setPdfFile} />
        </OficinaModal.Field>

        {err && <OficinaModal.Alert tone="danger">{err}</OficinaModal.Alert>}
      </div>
    </OficinaModal>
  );
}

