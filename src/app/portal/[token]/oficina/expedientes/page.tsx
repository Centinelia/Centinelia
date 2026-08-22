'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText, ChevronRight, ChevronDown, CheckCircle, AlertTriangle,
  Loader2, Upload, Settings, Search, RefreshCw, Trash2, PenLine, FileSignature,
} from 'lucide-react';
import { EmptyState } from '@/components/portal-ui';
import OficinaPageHero from '../OficinaPageHero';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface ExpedienteRow {
  id:                        string;
  folio_interno:             string | null;
  descripcion:               string | null;
  qb_po_folio:               string | null;
  proveedor_nombre:          string | null;
  proveedor_rfc:             string | null;
  oc_monto_mxn:              number | null;
  status:                    string;
  oc_firmada_at:             string | null;
  oc_pagada_at:              string | null;
  mercancia_recibida_at:     string | null;
  cfdi_timbrada_at:          string | null;
  sf_uuid:                   string | null;
  requiere_atencion_razon:   string | null;
  created_at:                string;
}

interface CicloOcConfig {
  monto_max_autofirma_mxn?:     number;
  sanidad_no_duplicados_horas?: number;
  archivado_nomenclatura?:      string;
  archivado_destino?:           string;
  archivado_root?:              string;
}

interface Evento {
  id:           string;
  tipo:         string;
  from_status:  string | null;
  to_status:    string | null;
  actor:        string | null;
  detalle:      Record<string, unknown>;
  created_at:   string;
}

// ── Etiquetas ────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  oc_creada:           'OC creada',
  oc_firmada:          'OC firmada',
  oc_pagada:           'OC pagada',
  oc_enviada_proveedor:'Enviada a proveedor',
  mercancia_recibida:  'Mercancía recibida',
  factura_timbrada:    'CFDI timbrado',
  docs_archivados:     'Docs archivados',
  cancelado:           'Cancelado',
  requiere_atencion:   'Requiere atención',
};

// Paleta canónica del design system: info (#0EA5E9), success (#22c55e),
// warning (#f59e0b), danger (#ef4444), neutral purple (#6C3BFF / sub #9B8FB5).
const STATUS_COLORS: Record<string, string> = {
  oc_creada:           '#9B8FB5', // neutral (sub text)
  oc_firmada:          '#6C3BFF', // primary purple (en proceso)
  oc_pagada:           '#0EA5E9', // info
  oc_enviada_proveedor:'#0EA5E9', // info
  mercancia_recibida:  '#22c55e', // success (paso positivo)
  factura_timbrada:    '#22c55e', // success
  docs_archivados:     '#22c55e', // success (final)
  cancelado:           '#9B8FB5', // neutral apagado
  requiere_atencion:   '#f59e0b', // warning
};

const DESTINOS = [
  { id: 'dropbox',        label: 'Dropbox'                         },
  { id: 'smb_local',      label: 'Servidor local (SMB)'            },
  { id: 'windows_agent',  label: 'Agente Windows (filesystem)'     },
];

// Estructuras de organización predefinidas para el archivado — evita exponer
// placeholders {año}/{mes} al usuario final (que no son intuitivos). Cada opción
// mapea a un template interno que el adapter procesa.
const ESTRUCTURAS_ARCHIVADO: { id: string; label: string; ejemplo: string; template: string }[] = [
  {
    id:      'año_mes_proveedor',
    label:   'Año → Mes → Proveedor',
    ejemplo: '2026 / 08 / Proveedor Prueba / cfdi_pdf_2026-08-19_PO-1234.pdf',
    template:'{año}/{mes}/{proveedor}/{tipo}_{fecha}_{folio}.{ext}',
  },
  {
    id:      'año_mes',
    label:   'Año → Mes (sin agrupar proveedor)',
    ejemplo: '2026 / 08 / cfdi_pdf_2026-08-19_Proveedor Prueba_PO-1234.pdf',
    template:'{año}/{mes}/{tipo}_{fecha}_{proveedor}_{folio}.{ext}',
  },
  {
    id:      'proveedor_año',
    label:   'Proveedor → Año',
    ejemplo: 'Proveedor Prueba / 2026 / cfdi_pdf_2026-08-19_PO-1234.pdf',
    template:'{proveedor}/{año}/{tipo}_{fecha}_{folio}.{ext}',
  },
  {
    id:      'solo_año',
    label:   'Solo por año',
    ejemplo: '2026 / cfdi_pdf_2026-08-19_Proveedor Prueba_PO-1234.pdf',
    template:'{año}/{tipo}_{fecha}_{proveedor}_{folio}.{ext}',
  },
  {
    id:      'plano',
    label:   'Todo en la misma carpeta',
    ejemplo: 'cfdi_pdf_2026-08-19_Proveedor Prueba_PO-1234.pdf',
    template:'{tipo}_{fecha}_{proveedor}_{folio}.{ext}',
  },
];

const ESTRUCTURA_POR_DEFAULT = ESTRUCTURAS_ARCHIVADO[0];

function estructuraFromTemplate(tpl: string | undefined): string {
  if (!tpl) return ESTRUCTURA_POR_DEFAULT.id;
  const match = ESTRUCTURAS_ARCHIVADO.find(e => e.template === tpl);
  return match?.id ?? 'custom';
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtMxn = (n: number | null) => n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const fmtDate = (s: string | null) => s == null ? '—' : new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (s: string) => new Date(s).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ── Página ───────────────────────────────────────────────────────────────────
export default function ExpedientesPage() {
  const params    = useParams<{ token: string }>();
  const token     = params.token;

  const [expedientes,       setExpedientes]       = useState<ExpedienteRow[]>([]);
  const [counts,            setCounts]            = useState<Record<string, number>>({});
  const [filterStatus,      setFilterStatus]      = useState<string | null>(null);
  const [searchText,        setSearchText]        = useState('');
  const [loading,           setLoading]           = useState(true);
  const [expandedId,        setExpandedId]        = useState<string | null>(null);
  const [detailData,        setDetailData]        = useState<{ expediente: Record<string, unknown>; eventos: Evento[] } | null>(null);
  const [detailLoading,     setDetailLoading]     = useState(false);
  const [configPanelOpen,   setConfigPanelOpen]   = useState(false);
  const [config,            setConfig]            = useState<CicloOcConfig>({});
  const [firmaCargada,      setFirmaCargada]      = useState(false);
  const [msg,               setMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [busy,              setBusy]              = useState(false);

  // ── Load list + counters ────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filterStatus) qs.set('status', filterStatus);
    if (searchText.trim()) qs.set('q', searchText.trim());
    const res = await fetch(`/api/portal/${token}/expedientes?${qs}`);
    if (res.ok) {
      const d = await res.json();
      setExpedientes(d.expedientes ?? []);
      setCounts(d.counts ?? {});
    }
    setLoading(false);
  }, [token, filterStatus, searchText]);

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/portal/${token}/ciclo-oc/config`);
    if (res.ok) {
      const d = await res.json();
      setConfig(d.config ?? {});
      setFirmaCargada(!!d.firma_cargada);
    }
  }, [token]);

  useEffect(() => { void loadList();   }, [loadList]);
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  // ── Load detail ─────────────────────────────────────────────────────────
  async function loadDetail(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setDetailData(null);
    setDetailLoading(true);
    const res = await fetch(`/api/portal/${token}/expedientes/${id}`);
    if (res.ok) setDetailData(await res.json());
    setDetailLoading(false);
  }

  // ── Config actions ──────────────────────────────────────────────────────
  async function saveConfig(patch: CicloOcConfig) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/portal/${token}/ciclo-oc/config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setConfig(d.config);
      setMsg({ ok: true, text: 'Configuración guardada.' });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ ok: false, text: j.error ?? 'Error al guardar.' });
    }
  }

  async function uploadFirma(file: File) {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append('firma', file);
    const res = await fetch(`/api/portal/${token}/ciclo-oc/firma`, { method: 'POST', body: fd });
    setBusy(false);
    if (res.ok) {
      setFirmaCargada(true);
      setMsg({ ok: true, text: 'Firma digitalizada cargada.' });
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg({ ok: false, text: j.error ?? 'Error al subir la firma.' });
    }
  }

  async function deleteFirma() {
    if (!confirm('Eliminar la imagen de firma digitalizada? Las autofirmas quedarán deshabilitadas hasta que subas una nueva.')) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/portal/${token}/ciclo-oc/firma`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setFirmaCargada(false);
      setMsg({ ok: true, text: 'Firma eliminada.' });
    }
  }

  const totalExpedientes = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div id="of-expedientes" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      <OficinaPageHero
        icon={FileSignature}
        eyebrow="Expedientes OC"
        title="Expedientes de compra"
        description={totalExpedientes > 0
          ? <><strong style={{ color: '#1A0A3B' }}>{totalExpedientes}</strong> {totalExpedientes === 1 ? 'expediente' : 'expedientes'} en el ciclo OC → firma → pago → CFDI → archivado. Gestionados por Nox y Nala.</>
          : 'Ciclo completo de compras y facturación. Nala crea la OC en QuickBooks, la firma con tus reglas, coordina con pagos y proveedores, timbra el CFDI al cliente y archiva todo. Nox coordina las excepciones.'}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadList()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors"
              style={{ background: '#F5F2FB', color: '#6C3BFF', border: '1px solid #E8E3F5' }}
            >
              <RefreshCw size={13} /> Refrescar
            </button>
            <button
              onClick={() => setConfigPanelOpen(v => !v)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors"
              style={{
                background: configPanelOpen ? '#6C3BFF' : '#fff',
                color:      configPanelOpen ? '#fff' : '#6C3BFF',
                border:     '1px solid #6C3BFF',
              }}
            >
              <Settings size={13} /> Configuración
            </button>
          </div>
        }
      />

      {/* Feedback */}
      {msg && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
          style={{
            background: msg.ok ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.08)',
            border:     msg.ok ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.25)',
            color:      msg.ok ? '#22c55e' : '#ef4444',
          }}>
          {msg.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Config panel (colapsable) */}
      {configPanelOpen && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #F0EDF9' }}>
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Configuración del ciclo</h2>
            <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
              Reglas de autofirma, nomenclatura de archivado, imagen de firma digitalizada.
            </p>
          </div>
          <div className="p-5 flex flex-col gap-5">
            {/* Firma digitalizada */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>Firma digitalizada</p>
              <div className="flex items-center gap-2 flex-wrap">
                {firmaCargada ? (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: 'rgba(34,197,94,0.10)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                      <PenLine size={10} /> Cargada
                    </span>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{ background: 'rgba(108,59,255,0.10)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.30)' }}>
                      <Upload size={12} /> Reemplazar
                      <input type="file" accept="image/png,image/jpeg" hidden
                        onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFirma(f); }} />
                    </label>
                    <button onClick={deleteFirma} disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </>
                ) : (
                  <label className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                    <Upload size={13} /> Subir imagen firma (PNG o JPG, max 2 MB)
                    <input type="file" accept="image/png,image/jpeg" hidden
                      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFirma(f); }} />
                  </label>
                )}
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: '#9B8FB5' }}>
                Nala aplica esta imagen automáticamente sobre las OC que cumplan las reglas de autofirma.
              </p>
            </div>

            {/* Monto máximo autofirma — formato de moneda MXN */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
                Monto máximo para autofirma
              </label>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={(config.monto_max_autofirma_mxn ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })}
                onFocus={e => {
                  const raw = e.currentTarget.value.replace(/[^0-9.]/g, '');
                  e.currentTarget.value = raw;
                  e.currentTarget.select();
                }}
                onBlur={e => {
                  const parsed = Number(e.currentTarget.value.replace(/[^0-9.]/g, '')) || 0;
                  e.currentTarget.value = parsed.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
                  if (parsed !== (config.monto_max_autofirma_mxn ?? 0)) void saveConfig({ monto_max_autofirma_mxn: parsed });
                }}
                className="w-full sm:w-64 rounded-lg px-3 py-2 text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              />
              <p className="text-[11px] mt-1.5" style={{ color: '#9B8FB5' }}>
                Órdenes por debajo o iguales a este monto se firman automáticamente si pasan las reglas de sanidad. $0.00 = autofirma deshabilitada.
              </p>
            </div>

            {/* Ventana anti-duplicados */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
                Ventana de detección de OC duplicadas (horas)
              </label>
              <input
                type="number"
                min={0}
                defaultValue={config.sanidad_no_duplicados_horas ?? 48}
                onBlur={e => { const n = Number(e.currentTarget.value); if (n >= 0 && n !== (config.sanidad_no_duplicados_horas ?? 48)) void saveConfig({ sanidad_no_duplicados_horas: n }); }}
                className="w-full sm:w-64 rounded-lg px-3 py-2 text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              />
              <p className="text-[11px] mt-1.5" style={{ color: '#9B8FB5' }}>
                Si aparece otra OC al mismo proveedor por el mismo monto dentro de esta ventana, Nala escala en lugar de firmar.
              </p>
            </div>

            {/* Estructura de archivado — selector visual con ejemplo real */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
                Cómo organizar los archivos
              </label>
              <div className="flex flex-col gap-2">
                {ESTRUCTURAS_ARCHIVADO.map(e => {
                  const currentId = estructuraFromTemplate(config.archivado_nomenclatura);
                  const selected = currentId === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => void saveConfig({ archivado_nomenclatura: e.template })}
                      className="w-full text-left rounded-lg px-4 py-3 transition-all"
                      style={{
                        background: selected ? 'rgba(108,59,255,0.06)' : '#FAFAFB',
                        border:     selected ? '1.5px solid #6C3BFF' : '1px solid #E8E3F5',
                        cursor:     'pointer',
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex-shrink-0" style={{
                          width: 14, height: 14, borderRadius: '50%',
                          background: selected ? '#6C3BFF' : '#fff',
                          border:     selected ? '2px solid #6C3BFF' : '1.5px solid #C7BFE0',
                          boxShadow:  selected ? 'inset 0 0 0 2px #fff' : 'none',
                        }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold" style={{ color: selected ? '#6C3BFF' : '#1A0A3B' }}>
                            {e.label}
                          </div>
                          <div className="text-[11px] font-mono mt-1 truncate" style={{ color: '#6B6480' }}>
                            {e.ejemplo}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] mt-2" style={{ color: '#9B8FB5' }}>
                Nala usa esta estructura al archivar el XML, PDF y acuse de cada CFDI en el destino que elijas abajo.
              </p>
            </div>

            {/* Destino archivado */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
                Destino de archivado
              </label>
              <select
                value={config.archivado_destino ?? ''}
                onChange={e => void saveConfig({ archivado_destino: e.target.value })}
                className="w-full sm:w-72 rounded-lg px-3 py-2 text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              >
                <option value="">Selecciona un destino</option>
                {DESTINOS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>

            {/* Root path */}
            {config.archivado_destino && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
                  Ruta raíz {config.archivado_destino === 'smb_local' ? '(SMB)' : ''}
                </label>
                <input
                  type="text"
                  defaultValue={config.archivado_root ?? ''}
                  placeholder={
                    config.archivado_destino === 'smb_local'   ? '\\\\SERVIDOR\\facturas' :
                    config.archivado_destino === 'windows_agent' ? 'C:\\Facturación' :
                    '/Centinelia/Facturación'
                  }
                  onBlur={e => { const v = e.currentTarget.value.trim(); if (v !== (config.archivado_root ?? '')) void saveConfig({ archivado_root: v }); }}
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pills filters — patrón consistente con documentos/facturas */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus(null)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
          style={{
            background: filterStatus === null ? '#1A0A3B' : '#fff',
            color:      filterStatus === null ? '#fff' : '#6B6480',
            border:     '1px solid #E8E3F5',
          }}
        >
          Todos {totalExpedientes > 0 && <span className="opacity-60 ml-1">· {totalExpedientes}</span>}
        </button>
        {Object.entries(STATUS_LABELS).map(([sid, label]) => {
          const n = counts[sid] ?? 0;
          if (n === 0 && filterStatus !== sid) return null;
          const selected = filterStatus === sid;
          const color = STATUS_COLORS[sid];
          return (
            <button
              key={sid}
              onClick={() => setFilterStatus(sid)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: selected ? color : '#fff',
                color:      selected ? '#fff' : color,
                border:     `1px solid ${selected ? color : '#E8E3F5'}`,
              }}
            >
              {label} {n > 0 && <span className="opacity-70 ml-1">· {n}</span>}
            </button>
          );
        })}
      </div>

      {/* Contenedor principal — card blanco con lista + búsqueda */}
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
      >
        {/* Header interno del card */}
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                {filterStatus ? STATUS_LABELS[filterStatus] : 'Todos los expedientes'}
              </h2>
              {expedientes.length > 0 && (
                <span className="text-[12px] tabular-nums" style={{ color: '#9B8FB5' }}>
                  {expedientes.length}
                </span>
              )}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
              Click en un expediente para ver el detalle completo del ciclo.
            </p>
          </div>
          <div className="relative flex-1 sm:flex-none sm:min-w-[300px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9B8FB5' }} />
            <input
              type="text"
              placeholder="Folio, proveedor, o número de OC…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-[12px]"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            />
          </div>
        </div>

        {/* Divider antes de la lista */}
        <div style={{ height: 1, background: '#F0EDF9' }} />

        {/* Lista o empty state */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: '#6B6480' }}>
            <Loader2 size={14} className="animate-spin mr-2" /> Cargando expedientes…
          </div>
        ) : expedientes.length === 0 ? (
          <div className="py-14">
            <EmptyState
              icon={FileSignature}
              title={filterStatus || searchText ? 'Sin resultados' : 'Sin expedientes todavía'}
              description={
                filterStatus || searchText
                  ? 'Ajusta los filtros o la búsqueda para ver más expedientes.'
                  : 'Cuando Nala o Nox creen una Orden de Compra en QuickBooks, aparecerá aquí con todo su ciclo.'
              }
            />
          </div>
        ) : (
          <div className="flex flex-col p-3 gap-2">
            {expedientes.map(exp => (
              <ExpedienteCard
                key={exp.id}
                row={exp}
                expanded={expandedId === exp.id}
                detail={expandedId === exp.id ? detailData : null}
                detailLoading={expandedId === exp.id && detailLoading}
                onToggle={() => void loadDetail(exp.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
function ExpedienteCard({
  row, expanded, detail, detailLoading, onToggle,
}: {
  row: ExpedienteRow;
  expanded: boolean;
  detail: { expediente: Record<string, unknown>; eventos: Evento[] } | null;
  detailLoading: boolean;
  onToggle: () => void;
}) {
  const color = STATUS_COLORS[row.status] ?? '#9B8FB5';
  return (
    <div className="rounded-xl overflow-hidden transition-shadow"
      style={{ background: '#fff', border: `1px solid ${expanded ? color + '55' : '#E8E3F5'}`, boxShadow: expanded ? `0 4px 20px ${color}18` : undefined }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: 'transparent' }}
      >
        {expanded ? <ChevronDown size={16} style={{ color: '#9B8FB5' }} /> : <ChevronRight size={16} style={{ color: '#9B8FB5' }} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
              {row.proveedor_nombre ?? 'Proveedor sin nombre'}
            </span>
            {row.qb_po_folio && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: '#F5F2FB', color: '#6C3BFF' }}>
                OC #{row.qb_po_folio}
              </span>
            )}
            {row.folio_interno && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#F5F2FB', color: '#6B6480' }}>
                {row.folio_interno}
              </span>
            )}
          </div>
          {row.descripcion && (
            <p className="text-xs mt-0.5 truncate" style={{ color: '#6B6480' }}>{row.descripcion}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>{fmtMxn(row.oc_monto_mxn)}</div>
          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}>
            {STATUS_LABELS[row.status] ?? row.status}
          </span>
        </div>
      </button>

      {row.requiere_atencion_razon && !expanded && (
        <div className="px-4 py-2 flex items-start gap-2 text-[11px]"
          style={{ background: 'rgba(245,158,11,0.08)', borderTop: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
          <AlertTriangle size={11} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{row.requiere_atencion_razon}</span>
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          {detailLoading || !detail ? (
            <div className="py-8 flex items-center justify-center text-xs" style={{ color: '#6B6480' }}>
              <Loader2 size={12} className="animate-spin mr-2" /> Cargando detalle…
            </div>
          ) : (
            <ExpedienteDetail row={row} detail={detail} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────
function ExpedienteDetail({ row, detail }: {
  row: ExpedienteRow;
  detail: { expediente: Record<string, unknown>; eventos: Evento[] };
}) {
  const e = detail.expediente as Record<string, any>;
  return (
    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* OC info */}
      <Section title="Orden de compra">
        <Field label="Proveedor" value={e.proveedor_nombre} />
        <Field label="RFC" value={e.proveedor_rfc} mono />
        <Field label="Correo" value={e.proveedor_email} />
        <Field label="Monto" value={fmtMxn(e.oc_monto_mxn)} />
        <Field label="OC QB" value={e.qb_po_folio ? `#${e.qb_po_folio}` : e.qb_po_id} />
        <Field label="Creada" value={fmtDateTime(e.created_at)} />
      </Section>

      {/* Firma + pago */}
      <Section title="Firma y pago">
        <Field label="Firmada" value={row.oc_firmada_at ? fmtDateTime(row.oc_firmada_at) : '—'} />
        <Field label="Por" value={e.oc_firmada_por} />
        <Field label="Auto" value={e.oc_firma_es_auto ? 'Sí' : 'No'} />
        <Field label="Pagada" value={row.oc_pagada_at ? fmtDateTime(row.oc_pagada_at) : '—'} />
        <Field label="Enviada al proveedor" value={e.oc_enviada_proveedor_at ? fmtDateTime(e.oc_enviada_proveedor_at) : '—'} />
        <Field label="Mercancía recibida" value={row.mercancia_recibida_at ? fmtDateTime(row.mercancia_recibida_at) : '—'} />
      </Section>

      {/* CFDI */}
      <Section title="CFDI">
        <Field label="Cliente" value={e.cliente_nombre} />
        <Field label="RFC cliente" value={e.cliente_rfc} mono />
        <Field label="UUID" value={e.sf_uuid} mono small />
        <Field label="Uso" value={e.cfdi_uso} />
        <Field label="Timbrado" value={row.cfdi_timbrada_at ? fmtDateTime(row.cfdi_timbrada_at) : '—'} />
        <Field label="Archivado" value={e.docs_archivados_at ? fmtDateTime(e.docs_archivados_at) : '—'} />
      </Section>

      {/* Eventos timeline */}
      <div className="md:col-span-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#9B8FB5' }}>
          Historial ({detail.eventos.length})
        </h3>
        {detail.eventos.length === 0 ? (
          <p className="text-xs" style={{ color: '#9B8FB5' }}>Sin eventos registrados.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {detail.eventos.map(ev => (
              <li key={ev.id} className="flex items-start gap-2 text-xs">
                <div className="mt-1 flex-shrink-0" style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[ev.to_status ?? ''] ?? '#9B8FB5' }} />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold" style={{ color: '#1A0A3B' }}>{ev.tipo.replace(/_/g, ' ')}</span>
                  {ev.from_status && ev.to_status && (
                    <span className="mx-1.5" style={{ color: '#9B8FB5' }}>
                      {ev.from_status} → {ev.to_status}
                    </span>
                  )}
                  {ev.actor && <span className="ml-1.5" style={{ color: '#6B6480' }}>· {ev.actor}</span>}
                </div>
                <span className="flex-shrink-0" style={{ color: '#9B8FB5' }}>{fmtDateTime(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>{title}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value, mono, small }: { label: string; value: React.ReactNode; mono?: boolean; small?: boolean }) {
  const display = value == null || value === '' ? '—' : value;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] flex-shrink-0" style={{ color: '#9B8FB5' }}>{label}</span>
      <span className={`text-right ${mono ? 'font-mono' : ''} ${small ? 'text-[11px]' : 'text-xs'}`}
        style={{ color: '#1A0A3B', fontWeight: 500, wordBreak: 'break-all' }}>
        {display}
      </span>
    </div>
  );
}
