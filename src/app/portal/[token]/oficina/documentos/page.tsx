'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Download, Trash2, Clock, FileCheck,
  BookmarkPlus, AlertTriangle, MessageSquare, Eye, X, FolderOpen,
} from 'lucide-react';
import OpsContractsSection from '../../OpsContractsSection';
import { EmptyState } from '@/components/portal-ui';
import OficinaPageHero from '../OficinaPageHero';

interface Doc {
  id:               string;
  title:            string;
  filename:         string;
  template_type:    string;
  agent_id:         string;
  created_at:       string;
  last_accessed_at: string | null;
  expires_at:       string;
}

interface Draft {
  id:           string;
  client_name:  string | null;
  client_email: string | null;
  client_rfc:   string | null;
  status:       string;
  created_at:   string;
  sent_at:      string | null;
}

const TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  proposal:     { label: 'Propuesta',       color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)'  },
  letter:       { label: 'Carta',           color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)'  },
  general:      { label: 'Documento',       color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  factura:      { label: 'Factura',         color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  orden_compra: { label: 'Orden de compra', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  excel:        { label: 'Excel',           color: '#16a34a', bg: 'rgba(22,163,74,0.1)'   },
  word:         { label: 'Word',            color: '#2563eb', bg: 'rgba(37,99,235,0.1)'   },
  powerpoint:   { label: 'PowerPoint',      color: '#dc2626', bg: 'rgba(220,38,38,0.1)'   },
};

type Pill = 'todos' | 'facturas' | 'ocs' | 'contratos' | 'otros';

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

function expiryLabel(days: number): string {
  if (days === 0) return 'Se elimina hoy';
  if (days === 1) return 'Se elimina mañana';
  return `Se elimina en ${days} días`;
}

function expiryColor(days: number): string {
  if (days <= 1)  return '#ef4444';
  if (days <= 7)  return '#f59e0b';
  return '#9B8FB5';
}

function contextualizeEmployeeName(name: string): string {
  if (name === 'Nox')  return 'Nox, tu director,';
  if (name === 'Niva') return 'Niva, tu directora,';
  return name;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return 'Hace un momento';
  if (m < 60) return `Hace ${m} min`;
  if (h < 24) return `Hace ${h}h`;
  if (d < 7)  return `Hace ${d} día${d !== 1 ? 's' : ''}`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/**
 * Devuelve el src correcto para el iframe del preview según el tipo de archivo.
 * PDF: URL directo (browser tiene viewer nativo).
 * Office (.docx/.xlsx/.pptx): wrappear en Microsoft Office Online Viewer.
 * Otros: URL directo (browser decide, típicamente descarga).
 */
function previewSrc(url: string, filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const OFFICE_EXTS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
  if (OFFICE_EXTS.has(ext)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function DocumentosPage() {
  const { token } = useParams<{ token: string }>();
  const [docs,       setDocs]       = useState<Doc[]>([]);
  const [drafts,     setDrafts]     = useState<Draft[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string | null>>({});
  const [loading,   setLoading]   = useState(true);
  const [pill,      setPill]      = useState<Pill>('todos');
  const [downloading,    setDownloading]    = useState<string | null>(null);
  const [conserving,     setConserving]     = useState<string | null>(null);
  const [deleting,       setDeleting]       = useState<string | null>(null);
  const [previewing,     setPreviewing]     = useState<string | null>(null);
  const [preview,        setPreview]        = useState<{ url: string; doc: Doc } | null>(null);
  const [downloadError,  setDownloadError]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, draftsRes] = await Promise.all([
        fetch(`/api/portal/${token}/ops-documents`),
        fetch(`/api/portal/${token}/contract-drafts`),
      ]);
      const docsData   = await docsRes.json();
      const draftsData = await draftsRes.json();
      setDocs(docsData.documents ?? []);
      setAgentNames(docsData.agentNames ?? {});
      setDrafts(draftsData.drafts ?? []);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [preview]);

  async function handlePreview(doc: Doc) {
    setPreviewing(doc.id);
    setDownloadError(null);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-documents/${doc.id}`);
      const data = await res.json();
      if (data.url) {
        setPreview({ url: data.url, doc });
        const newExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, expires_at: newExp, last_accessed_at: new Date().toISOString() } : d));
      } else {
        setDownloadError(data.error ?? 'No se pudo generar la vista previa.');
        setTimeout(() => setDownloadError(null), 4000);
      }
    } catch {
      setDownloadError('Error de conexion. Intenta de nuevo.');
      setTimeout(() => setDownloadError(null), 4000);
    } finally { setPreviewing(null); }
  }

  async function handleDownload(doc: Doc) {
    setDownloading(doc.id);
    setDownloadError(null);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-documents/${doc.id}`);
      const data = await res.json();
      if (data.url) {
        const a = document.createElement('a');
        a.href = data.url; a.download = data.filename ?? doc.filename; a.target = '_blank'; a.click();
        const newExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, expires_at: newExp, last_accessed_at: new Date().toISOString() } : d));
      } else {
        setDownloadError(data.error ?? 'No se pudo generar el enlace de descarga.');
        setTimeout(() => setDownloadError(null), 4000);
      }
    } catch {
      setDownloadError('Error de conexion. Intenta de nuevo.');
      setTimeout(() => setDownloadError(null), 4000);
    } finally { setDownloading(null); }
  }

  async function handleConservar(doc: Doc) {
    setConserving(doc.id);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-documents`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id }),
      });
      const data = await res.json();
      if (data.ok) setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, expires_at: data.expires_at } : d));
    } finally { setConserving(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminar este documento? Esta accion no se puede deshacer.')) return;
    setDeleting(id);
    try {
      await fetch(`/api/portal/${token}/ops-documents`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setDocs(prev => prev.filter(d => d.id !== id));
    } finally { setDeleting(null); }
  }

  // Metrics
  const porVencer      = docs.filter(d => daysLeft(d.expires_at) <= 7);
  const firstAgentName = Object.values(agentNames).find(Boolean) ?? null;
  const employeeName   = firstAgentName ? contextualizeEmployeeName(firstAgentName) : 'tu empleado';

  // Pill filtering
  const docsForPill: Doc[] = pill === 'todos'     ? docs
    : pill === 'facturas' ? docs.filter(d => d.template_type === 'factura')
    : pill === 'ocs'      ? docs.filter(d => d.template_type === 'orden_compra')
    : pill === 'otros'    ? docs.filter(d => !['factura', 'orden_compra'].includes(d.template_type))
    : [];

  const PILLS: { id: Pill; label: string; count: number }[] = [
    { id: 'todos',     label: 'Todos',             count: docs.length },
    { id: 'facturas',  label: 'Facturas',           count: docs.filter(d => d.template_type === 'factura').length },
    { id: 'ocs',       label: 'Ordenes de compra',  count: docs.filter(d => d.template_type === 'orden_compra').length },
    { id: 'contratos', label: 'Contratos',          count: drafts.length },
    { id: 'otros',     label: 'Otros',              count: docs.filter(d => !['factura', 'orden_compra'].includes(d.template_type)).length },
  ];

  const showSurface = pill !== 'contratos';

  const totalDocs = docs.length + drafts.length;

  return (
    <div id="of-documentos" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      <OficinaPageHero
        icon={FolderOpen}
        eyebrow="Documentos"
        title="Documentos y borradores"
        description={totalDocs > 0
          ? <><strong style={{ color: '#1A0A3B' }}>{totalDocs}</strong> {totalDocs === 1 ? 'documento' : 'documentos'} generados por tu equipo.</>
          : 'Facturas, órdenes de compra, contratos y otros documentos creados por tus empleados.'}
      />

      {/* Download error */}
      {downloadError && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          <p className="text-[12px]" style={{ color: '#b91c1c' }}>{downloadError}</p>
        </div>
      )}

      {loading ? (
        <p className="text-[12px] py-10 text-center" style={{ color: '#6B6480' }}>Cargando documentos...</p>
      ) : pill === 'contratos' ? (
        <>
          <PillsBar pills={PILLS} pill={pill} setPill={setPill} />
          <OpsContractsSection token={token} />
        </>
      ) : docs.length === 0 && drafts.length === 0 ? (
        <>
          <PillsBar pills={PILLS} pill={pill} setPill={setPill} />
          <EmptyStart token={token} employeeName={employeeName} />
        </>
      ) : (
        <>
          <PillsBar pills={PILLS} pill={pill} setPill={setPill} />

          <div
            className="flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: '#ffffff',
              border:     '1px solid #E8E3F5',
              boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
            }}
          >
            {/* Header interno */}
            <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                    Documentos
                  </h2>
                  {docsForPill.length > 0 && (
                    <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                      {docsForPill.length}
                    </span>
                  )}
                </div>
                <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                  Archivos generados por tus empleados. Disponibles 30 días.
                </p>
              </div>
              {porVencer.length > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[11px] font-medium"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <AlertTriangle size={11} />
                  {porVencer.length} por vencer
                </div>
              )}
            </div>

            {docsForPill.length === 0 ? (
              <div style={{ borderTop: '1px solid #F0EDF9' }}>
                <EmptyState
                  icon={FileText}
                  title="Sin documentos en esta categoria"
                  description={`Pidele a ${employeeName} que genere uno desde el chat.`}
                />
              </div>
            ) : (
              <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
                {docsForPill.map((doc, idx) => {
                  const typeCfg = TYPE_CFG[doc.template_type] ?? TYPE_CFG.general;
                  const days    = daysLeft(doc.expires_at);
                  const isDown  = downloading === doc.id;
                  const isCons  = conserving  === doc.id;
                  const isDel   = deleting    === doc.id;
                  const isPrev  = previewing  === doc.id;

                  return (
                    <div key={doc.id}
                      className="px-5 py-4 flex items-center gap-4"
                      style={{ borderBottom: idx === docsForPill.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: typeCfg.bg }}>
                        <FileCheck size={16} style={{ color: typeCfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: '#1A0A3B' }}>{doc.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>{typeCfg.label}</span>
                          {agentNames[doc.agent_id] && <span className="text-[11px]" style={{ color: '#9B8FB5' }}>Creado por {agentNames[doc.agent_id]}</span>}
                          <span className="text-[11px]" style={{ color: '#9B8FB5' }}>{timeAgo(doc.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: expiryColor(days) }}>
                          <Clock size={9} />
                          {expiryLabel(days)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handlePreview(doc)} disabled={isPrev} title="Vista previa"
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                            {isPrev
                              ? <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#9B8FB5', borderTopColor: 'transparent' }} />
                              : <Eye size={12} />}
                          </button>
                          <button onClick={() => handleConservar(doc)} disabled={isCons} title="Conservar 30 días más"
                            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ background: '#FAFAFB', color: '#6C3BFF', border: '1px solid #E8E3F5' }}>
                            <BookmarkPlus size={11} />
                            {isCons ? 'Conservando...' : 'Conservar'}
                          </button>
                          <button onClick={() => handleDownload(doc)} disabled={isDown}
                            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                            <Download size={11} />
                            {isDown ? 'Descargando...' : 'Descargar'}
                          </button>
                          <button onClick={() => handleDelete(doc.id)} disabled={isDel}
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)', color: '#ef4444' }}
                            title="Eliminar documento">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {docsForPill.length > 0 && (
            <p className="text-[11px] text-center" style={{ color: '#9B8FB5' }}>
              Para enviar un documento a un cliente, pidele a {employeeName} en{' '}
              <strong style={{ color: '#6B6480' }}>Consultar agente</strong> que lo envie por correo.
            </p>
          )}
        </>
      )}

      {/* Guard: showSurface unused in current render */}
      {false && showSurface}

      {/* Preview modal */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 sm:px-6"
            style={{ background: '#ffffff', borderBottom: '1px solid #E8E3F5' }}>
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-[13px] font-semibold truncate" style={{ color: '#1A0A3B' }}>{preview.doc.title}</p>
              <p className="text-[11px] truncate" style={{ color: '#9B8FB5' }}>{preview.doc.filename}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleDownload(preview.doc); }}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
              >
                <Download size={11} />
                Descargar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setPreview(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}
                title="Cerrar (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={previewSrc(preview.url, preview.doc.filename)}
              title={preview.doc.title}
              className="w-full h-full"
              style={{ border: 'none', background: '#525659' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PillsBar({ pills, pill, setPill }: { pills: { id: Pill; label: string; count: number }[]; pill: Pill; setPill: (p: Pill) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {pills.map(p => (
        <button
          key={p.id}
          onClick={() => setPill(p.id)}
          className="flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-medium transition-all"
          style={{
            background: pill === p.id ? '#6C3BFF' : '#FAFAFB',
            color:      pill === p.id ? '#fff'    : '#6B6480',
            border:     pill === p.id ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
            boxShadow:  pill === p.id ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
          }}
        >
          {p.label}
          {p.count > 0 && (
            <span
              className="text-[10px] font-bold tabular-nums rounded-full px-1.5"
              style={{
                background: pill === p.id ? 'rgba(255,255,255,0.2)' : '#F0EDF9',
                color:      pill === p.id ? '#fff' : '#9B8FB5',
              }}
            >
              {p.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function EmptyStart({ token, employeeName }: { token: string; employeeName: string }) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <div className="px-5 pt-5 pb-4">
        <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
          Empieza a generar documentos
        </h2>
        <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
          Tu equipo puede crear facturas, ordenes, cotizaciones y contratos.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ borderTop: '1px solid #F0EDF9' }}>
        <div className="px-5 py-5 flex flex-col items-start gap-3"
          style={{ borderRight: '1px solid #F0EDF9' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.08)' }}>
            <MessageSquare size={18} style={{ color: '#6C3BFF' }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>Pedirle a {employeeName.replace(/,\s*$/, '')}</p>
            <p className="text-[12px] mt-1 leading-relaxed" style={{ color: '#6B6480' }}>
              Escribe en Consultar agente: "genera una factura para..." y el documento aparecera aqui en segundos.
            </p>
          </div>
          <Link
            href={`/portal/${token}?tab=chat`}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
            style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)', textDecoration: 'none' }}
          >
            <MessageSquare size={12} />
            Consultar agente
          </Link>
        </div>
        <div className="px-5 py-5 flex flex-col items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.08)' }}>
            <FileText size={18} style={{ color: '#6C3BFF' }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>Configurar plantillas</p>
            <p className="text-[12px] mt-1 leading-relaxed" style={{ color: '#6B6480' }}>
              Sube tu formato de factura u orden de compra para que {employeeName} siempre use el mismo diseno.
            </p>
          </div>
          <Link
            href={`/portal/${token}/oficina/plantillas`}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70"
            style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5', textDecoration: 'none' }}
          >
            <FileText size={12} />
            Agregar plantilla
          </Link>
        </div>
      </div>
    </div>
  );
}
