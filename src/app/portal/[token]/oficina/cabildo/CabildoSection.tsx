'use client';

import { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, ChevronDown, Check, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/portal-ui';

interface CabildoDoc {
  id:          string;
  tipo:        string;
  titulo:      string | null;
  contenido:   string;
  numero:      string | null;
  sesion_info: string | null;
  created_at:  string;
}

const TIPO_LABELS: Record<string, string> = {
  punto_acuerdo: 'Punto de Acuerdo',
  acta_sesion:   'Acta de Sesión',
  otro:          'Documento',
};

const TIPO_COLORS: Record<string, { color: string; bg: string }> = {
  punto_acuerdo: { color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)' },
  acta_sesion:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  otro:          { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

function DocRow({ doc, token, onDelete, isLast }: {
  doc: CabildoDoc; token: string; onDelete: (id: string) => void; isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [content,  setContent]  = useState(doc.contenido);
  const [saving,   setSaving]   = useState(false);
  const [copied,   setCopied]   = useState(false);

  const date   = new Date(doc.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  const colors = TIPO_COLORS[doc.tipo] ?? TIPO_COLORS.otro;

  async function saveContent() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/cabildo/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido: content }),
      });
      setEditing(false);
    } finally { setSaving(false); }
  }

  async function deleteDoc() {
    if (!confirm('¿Eliminar este documento?')) return;
    await fetch(`/api/portal/${token}/cabildo/${doc.id}`, { method: 'DELETE' });
    onDelete(doc.id);
  }

  function copy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="flex flex-col"
      style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}
    >
      <div className="flex items-start gap-3 px-5 py-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {doc.numero && (
              <span className="font-mono text-xs font-bold" style={{ color: colors.color }}>{doc.numero}</span>
            )}
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: colors.bg, color: colors.color }}>
              {TIPO_LABELS[doc.tipo] ?? doc.tipo}
            </span>
          </div>
          {doc.titulo && (
            <p className="text-sm font-medium leading-snug" style={{ color: '#1A0A3B' }}>{doc.titulo}</p>
          )}
          <div className="flex items-center gap-3 mt-0.5">
            {doc.sesion_info && (
              <span className="text-xs" style={{ color: '#6B6480' }}>{doc.sesion_info}</span>
            )}
            <span className="text-xs" style={{ color: '#9B8FB5' }}>{date}</span>
          </div>
        </div>
        <ChevronDown
          size={14}
          style={{ color: '#9B8FB5', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
        />
      </div>

      {expanded && (
        <div className="px-5 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid #F0EDF9' }}>
          <div className="flex items-center gap-2 pt-3">
            <button onClick={copy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity"
              style={{
                background: '#FAFAFB',
                border:     '1px solid #E8E3F5',
                color:      copied ? '#22c55e' : '#6B6480',
              }}>
              {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar texto</>}
            </button>
            <button onClick={() => { setEditing(e => !e); setContent(doc.contenido); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity"
              style={{
                background: editing ? 'rgba(108,59,255,0.10)' : '#FAFAFB',
                border:     editing ? '1px solid rgba(108,59,255,0.3)' : '1px solid #E8E3F5',
                color:      editing ? '#6C3BFF' : '#6B6480',
              }}>
              {editing ? 'Cancelar edición' : 'Editar'}
            </button>
            <button onClick={deleteDoc}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg ml-auto transition-opacity hover:opacity-70"
              style={{ color: '#ef4444' }}>
              <Trash2 size={12} />
            </button>
          </div>

          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={20}
                className="w-full text-xs font-mono px-3 py-3 rounded-lg resize-y"
                style={{
                  background: '#FAFAFB',
                  border:     '1px solid #E8E3F5',
                  color:      '#1A0A3B',
                  outline:    'none',
                  lineHeight: 1.6,
                }}
              />
              <button onClick={saveContent} disabled={saving}
                className="self-start flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          ) : (
            <pre className="text-xs font-mono p-4 rounded-lg whitespace-pre-wrap leading-relaxed"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
              {doc.contenido}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function CabildoSection({ token }: { token: string }) {
  const [docs,    setDocs]    = useState<CabildoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoF,   setTipoF]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (tipoF) sp.set('tipo', tipoF);
      const res  = await fetch(`/api/portal/${token}/cabildo?${sp}`);
      const data = await res.json();
      setDocs(data.docs ?? []);
    } finally { setLoading(false); }
  }, [token, tipoF]);

  useEffect(() => { load(); }, [load]);

  function handleDelete(id: string) {
    setDocs(ds => ds.filter(d => d.id !== id));
  }

  const subtitle = docs.length > 0
    ? `${docs.length} documento${docs.length !== 1 ? 's' : ''} generado${docs.length !== 1 ? 's' : ''}`
    : 'Los documentos generados por el empleado aparecen aquí';

  return (
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
              Documentos de Cabildo
            </h2>
            {docs.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {docs.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Select value={tipoF || '__all'} onValueChange={v => setTipoF(v === '__all' ? '' : v)}>
            <SelectTrigger
              className="w-auto rounded-lg h-8 text-[12px]"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos los tipos</SelectItem>
              {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {[1, 2].map(i => (
            <div
              key={i}
              className="px-5 py-4 h-16 animate-pulse"
              style={{ borderBottom: i === 2 ? 'none' : '1px solid #F0EDF9', background: '#FAFAFB' }}
            />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tipoF ? 'Sin documentos de ese tipo' : 'Tu empleado aún no ha generado ningún documento'}
        />
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {docs.map((d, idx) => (
            <DocRow key={d.id} doc={d} token={token} onDelete={handleDelete} isLast={idx === docs.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
