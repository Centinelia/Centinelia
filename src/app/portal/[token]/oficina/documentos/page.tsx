'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FileText, Download, Trash2, Clock, FileCheck, FilePlus, Mail } from 'lucide-react';

interface Doc {
  id:               string;
  title:            string;
  filename:         string;
  template_type:    string;
  created_at:       string;
  last_accessed_at: string | null;
  expires_at:       string;
}

const TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  proposal: { label: 'Propuesta',  color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)' },
  letter:   { label: 'Carta',      color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
  general:  { label: 'Documento',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)'  },
};

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

function expiryColor(days: number): string {
  if (days <= 3)  return '#ef4444';
  if (days <= 7)  return '#f59e0b';
  return 'var(--c-text-4)';
}

export default function DocumentosPage() {
  const { token } = useParams<{ token: string }>();
  const [docs, setDocs]         = useState<Doc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-documents`);
      const data = await res.json();
      setDocs(data.documents ?? []);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleDownload(doc: Doc) {
    setDownloading(doc.id);
    try {
      const res  = await fetch(`/api/portal/${token}/ops-documents/${doc.id}`);
      const data = await res.json();
      if (data.url) {
        const a = document.createElement('a');
        a.href     = data.url;
        a.download = data.filename ?? doc.filename;
        a.target   = '_blank';
        a.click();
        // Refresh to show updated expiry
        await load();
      }
    } finally { setDownloading(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    setDeleting(id);
    await fetch(`/api/portal/${token}/ops-documents`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    setDocs(prev => prev.filter(d => d.id !== id));
    setDeleting(null);
  }

  return (
    <div id="of-documentos" className="flex flex-col gap-5 p-5 sm:p-7 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-sm font-semibold tracking-widest uppercase flex items-center gap-2" style={{ color: 'var(--c-text-3)' }}>
          <FileText size={14} /> Documentos
        </h1>
        <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>
          PDFs generados por tus agentes. Cada documento se guarda por 30 días desde su última descarga.
          Descárgalo y guárdalo en tu Drive, Notion o donde lo necesites para conservarlo.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl p-3.5" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}>
        <Clock size={13} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
        <div>
          <p className="text-xs font-medium" style={{ color: '#9B6DFF' }}>Retención de 30 días</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Descargar un documento reinicia su contador a 30 días. Los documentos que no se tocan se eliminan automáticamente al vencer.
            Centinelia no es un almacén permanente — descarga lo que necesites guardar.
          </p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-xs py-10 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando documentos...</p>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center py-14 gap-3 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <FilePlus size={32} style={{ color: 'var(--c-text-3)', opacity: 0.35 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--c-text-2)' }}>Sin documentos aún</p>
          <p className="text-xs text-center max-w-xs" style={{ color: 'var(--c-text-3)' }}>
            Pídele a tu agente en <strong>Consultar agente</strong> que genere una propuesta, carta o documento y aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map(doc => {
            const typeCfg  = TYPE_CFG[doc.template_type] ?? TYPE_CFG.general;
            const days     = daysLeft(doc.expires_at);
            const isDown   = downloading === doc.id;
            const isDel    = deleting    === doc.id;
            const created  = new Date(doc.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
            const accessed = doc.last_accessed_at
              ? new Date(doc.last_accessed_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
              : null;

            return (
              <div key={doc.id} className="flex items-center gap-4 px-4 py-3.5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: typeCfg.bg }}>
                  <FileCheck size={16} style={{ color: typeCfg.color }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{doc.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>{typeCfg.label}</span>
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Creado {created}</span>
                    {accessed && <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>· Descargado {accessed}</span>}
                    <span className="text-xs flex items-center gap-0.5" style={{ color: expiryColor(days) }}>
                      <Clock size={9} />
                      {days === 0 ? 'Vence hoy' : `${days}d restantes`}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={isDown}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: '#6C3BFF', color: '#fff' }}
                  >
                    <Download size={12} />
                    {isDown ? 'Descargando...' : 'Descargar'}
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={isDel}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
                    title="Eliminar documento"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tip */}
      {docs.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <Mail size={12} style={{ color: 'var(--c-text-4)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
            Para enviar un documento directamente a un cliente, pídele a tu agente en <strong style={{ color: 'var(--c-text-3)' }}>Consultar agente</strong> que lo envíe por correo — puede adjuntarlo automáticamente.
          </p>
        </div>
      )}
    </div>
  );
}
