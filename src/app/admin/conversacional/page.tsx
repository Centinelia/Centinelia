'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, X, Zap, ChevronDown, ChevronUp, Trash2, Pencil, Sparkles } from 'lucide-react';

type Status = 'pending' | 'active' | 'rejected' | 'archived';

const DIMENSION_LABELS: Record<string, string> = {
  fluidez:     'Fluidez',
  comprension: 'Comprensión',
  naturalidad: 'Naturalidad',
  conduccion:  'Conducción',
  confianza:   'Confianza',
  resolucion:  'Resolución',
};

const DOC_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  cce: { label: 'CCE', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
  hcp: { label: 'HCP', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
  mdp: { label: 'MDP', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
};

interface Learning {
  id:              string;
  body:            string;
  dimension:       string | null;
  target_document: string | null;
  source_count:    number;
  status:          string;
  created_at:      string;
  approved_at:     string | null;
}

export default function ConversacionalPage() {
  const [tab, setTab]           = useState<Status>('pending');
  const [items, setItems]       = useState<Learning[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const load = async (s: Status) => {
    setLoading(true);
    const r = await fetch(`/api/admin/conversacional?status=${s}`);
    const d = await r.json();
    setItems(d.items ?? []);
    setLoading(false);
  };

  useEffect(() => { load(tab); }, [tab]);

  const patch = async (id: string, update: { status?: string; body?: string }) => {
    try {
      const res = await fetch('/api/admin/conversacional', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, ...update }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Error ${res.status}: ${err.error ?? 'sin detalle'}`);
        return;
      }
      if (update.status === 'active')   toast.success('Aprendizaje activado');
      if (update.status === 'rejected') toast.success('Aprendizaje rechazado');
      if (update.body)                  toast.success('Cambios guardados');
      load(tab);
    } catch (e) {
      toast.error(`Fallo de red: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch('/api/admin/conversacional', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Error ${res.status}: ${err.error ?? 'sin detalle'}`);
        return;
      }
      toast.success('Aprendizaje eliminado');
      load(tab);
    } catch (e) {
      toast.error(`Fallo de red: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const tabs: { key: Status; label: string }[] = [
    { key: 'pending',  label: 'Pendientes' },
    { key: 'active',   label: 'Activos' },
    { key: 'rejected', label: 'Rechazados' },
    { key: 'archived', label: 'Archivados' },
  ];

  const purgeContaminated = async (apply: boolean) => {
    try {
      const res = await fetch(`/api/admin/conversacional?action=purge-contaminated${apply ? '&apply=1' : ''}`, { method: 'POST' });
      const d   = await res.json();
      if (!res.ok) { toast.error(`Error ${res.status}: ${d.error ?? ''}`); return; }
      if (apply) {
        toast.success(`Purga aplicada: ${d.found} archivado${d.found !== 1 ? 's' : ''}`);
        load(tab);
      } else {
        toast(`Dry-run: ${d.found} contaminado${d.found !== 1 ? 's' : ''} detectado${d.found !== 1 ? 's' : ''}. Confirma para archivar.`, { duration: 10000 });
        if (d.found > 0 && confirm(`Se detectaron ${d.found} aprendizajes contaminados con contexto de negocio. ¿Archivar todos?`)) {
          purgeContaminated(true);
        }
      }
    } catch (e) {
      toast.error(`Fallo de red: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>
          Estilo conversacional
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Aprendizajes globales que se inyectan en el prompt de todos los empleados digitales de la plataforma.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Tabs */}
        <div className="inline-flex gap-1 p-1 rounded-xl" style={{ background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={{
                background: tab === t.key ? '#FFFFFF' : 'transparent',
                color:      tab === t.key ? '#111827' : '#6B7280',
                boxShadow:  tab === t.key ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => purgeContaminated(false)}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
          style={{ background: '#FFFFFF', border: '1px solid #FDE68A', color: '#B45309' }}
          title="Detecta y archiva aprendizajes con contexto de negocio (montos, industrias, nombres propios)"
        >
          Purgar contaminados
        </button>
      </div>

      {loading ? (
        <div
          className="rounded-xl bg-white p-8 text-center"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <p className="text-[13px]" style={{ color: '#6B7280' }}>Cargando...</p>
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-xl bg-white p-10 text-center"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <Sparkles size={20} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
          <p className="text-[13px]" style={{ color: '#6B7280' }}>
            {tab === 'pending' ? 'No hay aprendizajes pendientes.' : 'Sin registros.'}
          </p>
          {tab === 'pending' && (
            <p className="text-[12px] mt-1" style={{ color: '#9CA3AF' }}>
              Se generan automáticamente después de cada llamada con score CES bajo o igual a 2.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => {
            const docInfo = item.target_document ? DOC_LABELS[item.target_document] : null;
            return (
              <div
                key={item.id}
                className="rounded-xl bg-white px-5 py-4"
                style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Badges */}
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {docInfo && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium"
                          style={{ background: docInfo.bg, color: docInfo.color, border: `1px solid ${docInfo.border}` }}
                        >
                          {docInfo.label}
                        </span>
                      )}
                      {item.dimension && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium"
                          style={{ background: '#F3F0FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}
                        >
                          {DIMENSION_LABELS[item.dimension] ?? item.dimension}
                        </span>
                      )}
                    </div>

                    {/* Body — editable when in edit mode */}
                    {editing === item.id ? (
                      <textarea
                        value={editBody}
                        onChange={e => setEditBody(e.target.value)}
                        rows={3}
                        className="w-full text-[13px] rounded-lg p-2.5 outline-none resize-none"
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #6C3BFF',
                          color: '#111827',
                        }}
                      />
                    ) : (
                      <p className="text-[13px] leading-relaxed" style={{ color: '#374151' }}>
                        {item.body}
                      </p>
                    )}

                    <p className="text-[12px] mt-2" style={{ color: '#6B7280' }}>
                      {new Date(item.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {item.source_count > 1 && ` · ${item.source_count} llamadas`}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    {editing === item.id ? (
                      <>
                        <button
                          onClick={() => { patch(item.id, { body: editBody }); setEditing(null); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
                          title="Guardar"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280' }}
                          title="Cancelar"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        {tab === 'pending' && (
                          <>
                            <button
                              onClick={() => patch(item.id, { status: 'active' })}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                              style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' }}
                              title="Activar directo"
                            >
                              <Zap size={14} />
                            </button>
                            <button
                              onClick={() => patch(item.id, { status: 'rejected' })}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                              style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444' }}
                              title="Rechazar"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                        {tab === 'active' && (
                          <button
                            onClick={() => patch(item.id, { status: 'rejected' })}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444' }}
                            title="Desactivar"
                          >
                            <ChevronDown size={14} />
                          </button>
                        )}
                        {(tab === 'rejected' || tab === 'archived') && (
                          <button
                            onClick={() => patch(item.id, { status: 'active' })}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' }}
                            title="Reactivar"
                          >
                            <ChevronUp size={14} />
                          </button>
                        )}
                        {/* Edit body */}
                        <button
                          onClick={() => { setEditing(item.id); setEditBody(item.body); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280' }}
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => remove(item.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280' }}
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'active' && items.length > 0 && (
        <div
          className="rounded-xl p-4 text-[12px]"
          style={{ background: '#F3F0FF', border: '1px solid #DDD6FE', color: '#4C1D95' }}
        >
          Estos {items.length} aprendizaje{items.length !== 1 ? 's' : ''} se inyectan en el system prompt de todos los empleados activos la próxima vez que se sincronicen con Vapi. Para propagarlos de inmediato, ejecuta el cron{' '}
          <code
            className="font-mono text-[11px] px-1.5 py-0.5 rounded"
            style={{ background: '#FFFFFF', border: '1px solid #DDD6FE', color: '#6C3BFF' }}
          >
            /api/cron/push-conversational-prompts
          </code>
          .
        </div>
      )}
    </div>
  );
}
