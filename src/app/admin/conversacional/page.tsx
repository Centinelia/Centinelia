'use client';

import { useEffect, useState } from 'react';
import { Check, X, Zap, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

type Status = 'pending' | 'active' | 'rejected';

const DIMENSION_LABELS: Record<string, string> = {
  fluidez:     'Fluidez',
  comprension: 'Comprensión',
  naturalidad: 'Naturalidad',
  conduccion:  'Conducción',
  confianza:   'Confianza',
  resolucion:  'Resolución',
};

const DOC_LABELS: Record<string, { label: string; color: string }> = {
  cce: { label: 'CCE',  color: '#f97316' },
  hcp: { label: 'HCP',  color: '#22c55e' },
  mdp: { label: 'MDP',  color: '#0ea5e9' },
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
    await fetch('/api/admin/conversacional', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, ...update }),
    });
    load(tab);
  };

  const remove = async (id: string) => {
    await fetch('/api/admin/conversacional', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    load(tab);
  };

  const tabs: { key: Status; label: string }[] = [
    { key: 'pending',  label: 'Pendientes' },
    { key: 'active',   label: 'Activos' },
    { key: 'rejected', label: 'Rechazados' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Estilo conversacional</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          Aprendizajes globales que se inyectan en el prompt de TODOS los agentes de la plataforma.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'var(--c-surface-2)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t.key ? '#6C3BFF' : 'transparent',
              color:      tab === t.key ? '#fff' : 'var(--c-text-3)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
          {tab === 'pending' ? 'No hay aprendizajes pendientes. Se generan automáticamente después de cada llamada con score CES ≤ 2.' : 'Sin registros.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => (
            <div
              key={item.id}
              className="rounded-xl p-4"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Badges */}
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {item.target_document && DOC_LABELS[item.target_document] && (
                      <span
                        className="inline-block text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: `${DOC_LABELS[item.target_document].color}18`,
                          color:       DOC_LABELS[item.target_document].color,
                        }}
                      >
                        {DOC_LABELS[item.target_document].label}
                      </span>
                    )}
                    {item.dimension && (
                      <span
                        className="inline-block text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF' }}
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
                      className="w-full text-sm rounded-lg p-2 outline-none resize-none"
                      style={{
                        background: 'var(--c-surface-2)',
                        border:     '1px solid rgba(108,59,255,0.4)',
                        color:      'var(--c-text)',
                      }}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>
                      {item.body}
                    </p>
                  )}

                  <p className="text-xs mt-2" style={{ color: 'var(--c-text-3)' }}>
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
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: '#6C3BFF' }}
                        title="Guardar"
                      >
                        <Check size={13} color="#fff" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--c-surface-2)' }}
                        title="Cancelar"
                      >
                        <X size={13} style={{ color: 'var(--c-text-3)' }} />
                      </button>
                    </>
                  ) : (
                    <>
                      {tab === 'pending' && (
                        <>
                          <button
                            onClick={() => patch(item.id, { status: 'active' })}
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(34,197,94,0.12)' }}
                            title="Activar directo"
                          >
                            <Zap size={13} color="#22c55e" />
                          </button>
                          <button
                            onClick={() => patch(item.id, { status: 'rejected' })}
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(239,68,68,0.10)' }}
                            title="Rechazar"
                          >
                            <X size={13} color="#ef4444" />
                          </button>
                        </>
                      )}
                      {tab === 'active' && (
                        <button
                          onClick={() => patch(item.id, { status: 'rejected' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(239,68,68,0.10)' }}
                          title="Desactivar"
                        >
                          <ChevronDown size={13} color="#ef4444" />
                        </button>
                      )}
                      {tab === 'rejected' && (
                        <button
                          onClick={() => patch(item.id, { status: 'active' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(34,197,94,0.12)' }}
                          title="Reactivar"
                        >
                          <ChevronUp size={13} color="#22c55e" />
                        </button>
                      )}
                      {/* Edit body */}
                      <button
                        onClick={() => { setEditing(item.id); setEditBody(item.body); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}
                        title="Editar"
                      >
                        E
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--c-surface-2)' }}
                        title="Eliminar"
                      >
                        <Trash2 size={12} style={{ color: 'var(--c-text-3)' }} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'active' && items.length > 0 && (
        <div
          className="mt-6 p-4 rounded-xl text-xs"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: 'var(--c-text-3)' }}
        >
          Estos {items.length} aprendizaje{items.length !== 1 ? 's' : ''} se inyectan en el system prompt de todos los agentes activos la próxima vez que se sincronicen con Vapi. Para propagarlos a todos de inmediato, ejecuta el cron <code className="text-xs" style={{ color: '#9B6DFF' }}>/api/cron/push-conversational-prompts</code>.
        </div>
      )}
    </div>
  );
}
