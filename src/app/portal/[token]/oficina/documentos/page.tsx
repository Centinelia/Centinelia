'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Download, Trash2, Clock, FileCheck,
  BookmarkPlus, AlertTriangle, MessageSquare,
} from 'lucide-react';
import OpsContractsSection from '../../OpsContractsSection';

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
  return 'var(--c-text-4)';
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

function Metric({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-3 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <span className="text-xl font-bold tabular-nums" style={{ color: color ?? 'var(--c-text)' }}>{value}</span>
      <span className="text-[10px] uppercase tracking-widest font-semibold text-center" style={{ color: 'var(--c-text-4)' }}>{label}</span>
    </div>
  );
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
  const startMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const porVencer   = docs.filter(d => daysLeft(d.expires_at) <= 7);
  const esteMe      = docs.filter(d => new Date(d.created_at).getTime() >= startMonth).length;
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

  return (
    <div id="of-documentos" className="flex flex-col gap-5 p-5 sm:p-7 w-full">

      {/* Header */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
          Documentos
        </p>
        <h1 className="text-xl font-bold mt-1.5 leading-snug" style={{ color: 'var(--c-text)' }}>
          Centro de documentos
        </h1>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Archivos generados por tus empleados. Disponibles 30 días para descargar, conservar o reenviar.
        </p>
      </div>

      {/* Metrics */}
      {!loading && (docs.length > 0 || drafts.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric value={docs.length}         label="Activos" />
          <Metric value={esteMe}              label="Este mes" />
          <Metric value={porVencer.length}    label="Por vencer" color={porVencer.length > 0 ? '#f59e0b' : undefined} />
          <Metric value={drafts.length}       label="Contratos" />
        </div>
      )}

      {/* Expiry warning */}
      {porVencer.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
          <p className="text-xs" style={{ color: '#92400e' }}>
            <strong>{porVencer.length} documento{porVencer.length !== 1 ? 's' : ''}</strong>{' '}
            {porVencer.length !== 1 ? 'se eliminan' : 'se elimina'} esta semana.
            {' '}Descargalos o conservalos para no perderlos.
          </p>
        </div>
      )}

      {/* Pills */}
      {!loading && (
        <div className="flex gap-1 flex-wrap">
          {PILLS.map(p => (
            <button
              key={p.id}
              onClick={() => setPill(p.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: pill === p.id ? '#6C3BFF' : 'var(--c-surface)',
                color:      pill === p.id ? '#fff'    : 'var(--c-text-3)',
                border:     pill === p.id ? 'none'    : '1px solid var(--c-border)',
              }}
            >
              {p.label}
              {p.count > 0 && (
                <span
                  className="text-[10px] font-bold tabular-nums rounded-full px-1.5"
                  style={{
                    background: pill === p.id ? 'rgba(255,255,255,0.2)' : 'var(--c-surface-2)',
                    color:      pill === p.id ? '#fff' : 'var(--c-text-4)',
                  }}
                >
                  {p.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Download error */}
      {downloadError && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          <p className="text-xs" style={{ color: '#fca5a5' }}>{downloadError}</p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-xs py-10 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando documentos...</p>
      ) : pill === 'contratos' ? (
        <OpsContractsSection token={token} />
      ) : docsForPill.length === 0 && docs.length === 0 && drafts.length === 0 ? (
        <EmptyState token={token} employeeName={employeeName} />
      ) : docsForPill.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <FileText size={28} style={{ color: 'var(--c-text-3)', opacity: 0.35 }} />
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin documentos en esta categoria</p>
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Pidele a {employeeName} que genere uno desde el chat.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {docsForPill.map(doc => {
            const typeCfg = TYPE_CFG[doc.template_type] ?? TYPE_CFG.general;
            const days    = daysLeft(doc.expires_at);
            const isDown  = downloading === doc.id;
            const isCons  = conserving  === doc.id;
            const isDel   = deleting    === doc.id;

            return (
              <div key={doc.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: typeCfg.bg }}>
                    <FileCheck size={16} style={{ color: typeCfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{doc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>{typeCfg.label}</span>
                      {agentNames[doc.agent_id] && <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Creado por {agentNames[doc.agent_id]}</span>}
                      <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{timeAgo(doc.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: expiryColor(days) }}>
                      <Clock size={9} />
                      {expiryLabel(days)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleConservar(doc)} disabled={isCons} title="Conservar 30 días más"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.15)' }}>
                        <BookmarkPlus size={11} />
                        {isCons ? 'Conservando...' : 'Conservar'}
                      </button>
                      <button onClick={() => handleDownload(doc)} disabled={isDown}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ background: '#6C3BFF', color: '#fff' }}>
                        <Download size={11} />
                        {isDown ? 'Descargando...' : 'Descargar'}
                      </button>
                      <button onClick={() => handleDelete(doc.id)} disabled={isDel}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)', color: '#f87171' }}
                        title="Eliminar documento">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
                {days <= 7 && (
                  <div style={{ height: 2, background: 'var(--c-border)' }}>
                    <div style={{ width: `${Math.round((days / 30) * 100)}%`, height: '100%', background: expiryColor(days) }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom tip */}
      {(docsForPill.length > 0 || (pill === 'contratos' && drafts.length > 0)) && (
        <p className="text-xs text-center" style={{ color: 'var(--c-text-4)' }}>
          Para enviar un documento a un cliente, pidele a {employeeName} en{' '}
          <strong style={{ color: 'var(--c-text-3)' }}>Consultar agente</strong> que lo envie por correo.
        </p>
      )}
    </div>
  );
}

function EmptyState({ token, employeeName }: { token: string; employeeName: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
      <div className="flex flex-col items-start gap-4 rounded-2xl p-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.08)' }}>
          <MessageSquare size={18} style={{ color: '#9B6DFF' }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Pedirle a {employeeName.replace(/,\s*$/, '')}</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
            Escribe en Consultar agente: "genera una factura para..." y el documento aparecera aqui en segundos.
          </p>
        </div>
        <Link
          href={`/portal/${token}?tab=chat`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: '#6C3BFF', color: '#fff', textDecoration: 'none' }}
        >
          <MessageSquare size={13} />
          Consultar agente
        </Link>
      </div>
      <div className="flex flex-col items-start gap-4 rounded-2xl p-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.08)' }}>
          <FileText size={18} style={{ color: '#9B6DFF' }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Configurar plantillas</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
            Sube tu formato de factura u orden de compra para que {employeeName} siempre use el mismo diseno.
          </p>
        </div>
        <Link
          href={`/portal/${token}/oficina/plantillas`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)', textDecoration: 'none' }}
        >
          <FileText size={13} />
          Agregar plantilla
        </Link>
      </div>
    </div>
  );
}
