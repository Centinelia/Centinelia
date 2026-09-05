'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, ChevronDown, ChevronUp, FileText,
  Send, Check, X, ToggleLeft,
  ToggleRight, RefreshCw, Mail,
} from 'lucide-react';

type StateFilter = 'todos' | 'borrador' | 'aprobado' | 'enviado' | 'cancelado';

interface Clause {
  id: string; title: string; body: string; required: boolean; enabled: boolean;
}

interface Draft {
  id: string; agent_id: string; client_name: string | null;
  client_email: string | null; client_rfc: string | null; client_phone: string | null;
  clauses: Clause[]; notes: string | null; status: string;
  source_type: string | null; sent_at: string | null; created_at: string;
}

const DRAFT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  aprobado: { label: 'Aprobado',  color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)'  },
  enviado:  { label: 'Enviado',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  cancelado:{ label: 'Cancelado', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

export default function OpsContractsSection({ token }: { token: string }) {
  const [drafts, setDrafts]       = useState<Draft[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [showNew, setShowNew]     = useState(false);
  const [sending, setSending]     = useState<string | null>(null);
  const [sendDone, setSendDone]   = useState<string | null>(null);
  const [templateClauses, setTemplateClauses] = useState<Clause[]>([]);
  const [stateFilter, setStateFilter] = useState<StateFilter>('todos');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, tpl] = await Promise.all([
        fetch(`/api/portal/${token}/contract-drafts`).then(r => r.json()),
        fetch(`/api/portal/${token}/contract-template`).then(r => r.json()),
      ]);
      setDrafts(dr.drafts ?? []);
      setTemplateClauses(tpl.template?.clauses ?? []);
    } finally { setLoading(false); }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function sendDraft(id: string) {
    setSending(id);
    try {
      const res = await fetch(`/api/portal/${token}/contract-drafts/${id}/send`, { method: 'POST' });
      if (res.ok) { setSendDone(id); setTimeout(() => { setSendDone(null); load(); }, 2000); }
    } finally { setSending(null); }
  }

  async function updateDraftField(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/portal/${token}/contract-drafts`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } as Draft : d));
  }

  async function cancelDraft(id: string) {
    if (!confirm('¿Cancelar este borrador?')) return;
    await fetch(`/api/portal/${token}/contract-drafts`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  // Filtro por estado + rango de fechas (created_at)
  const filteredDrafts = drafts.filter(d => {
    if (stateFilter !== 'todos' && d.status !== stateFilter) return false;
    const iso = d.created_at?.slice(0, 10) ?? '';
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo   && iso > dateTo)   return false;
    return true;
  });

  const stateCounts: Record<StateFilter, number> = {
    todos:     drafts.length,
    borrador:  drafts.filter(d => d.status === 'borrador').length,
    aprobado:  drafts.filter(d => d.status === 'aprobado').length,
    enviado:   drafts.filter(d => d.status === 'enviado').length,
    cancelado: drafts.filter(d => d.status === 'cancelado').length,
  };

  const stateChips: { key: StateFilter; label: string }[] = [
    { key: 'todos',     label: 'Todos'     },
    { key: 'borrador',  label: 'Borrador'  },
    { key: 'aprobado',  label: 'Aprobado'  },
    { key: 'enviado',   label: 'Enviado'   },
    { key: 'cancelado', label: 'Cancelado' },
  ];

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
              Contratos con clientes
            </h2>
            {filteredDrafts.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {filteredDrafts.length}
                {filteredDrafts.length !== drafts.length && (
                  <span style={{ color: '#9B8FB5', fontWeight: 400 }}> / {drafts.length}</span>
                )}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Contratos ya redactados por tu equipo. Revísalos, ajusta lo que quieras y envíalos al cliente cuando estén listos.
          </p>
        </div>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
          <Plus size={12} /> Nuevo borrador
        </button>
      </div>

      {showNew && (
        <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
          <NewDraftForm token={token} templateClauses={templateClauses} onCreated={() => { setShowNew(false); load(); }} />
        </div>
      )}

      {/* Filter chips + rango fechas (solo si hay borradores para filtrar) */}
      {drafts.length > 0 && (
        <div
          className="px-5 py-2.5 flex items-center gap-3 flex-wrap"
          style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {stateChips.map(chip => {
              const active = stateFilter === chip.key;
              const count  = stateCounts[chip.key];
              return (
                <button
                  key={chip.key}
                  onClick={() => setStateFilter(chip.key)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors flex items-center gap-1.5"
                  style={{
                    background: active ? '#6C3BFF' : '#ffffff',
                    color:      active ? '#ffffff' : '#6B6480',
                    border:     active ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                  }}
                >
                  {chip.label}
                  <span className="tabular-nums" style={{ opacity: 0.75 }}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] ml-auto" style={{ color: '#6B6480' }}>
            <span>Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded-md px-2 py-1 text-xs"
              style={{
                background: '#ffffff',
                border: dateFrom ? '1px solid rgba(108,59,255,0.5)' : '1px solid #E8E3F5',
                color: '#1A0A3B', outline: 'none',
              }}
            />
            <span>hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="rounded-md px-2 py-1 text-xs"
              style={{
                background: '#ffffff',
                border: dateTo ? '1px solid rgba(108,59,255,0.5)' : '1px solid #E8E3F5',
                color: '#1A0A3B', outline: 'none',
              }}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:opacity-70"
                style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', fontWeight: 600 }}
              >
                <X size={10} /> limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[12px] py-8 text-center" style={{ color: '#6B6480', borderTop: '1px solid #F0EDF9' }}>Cargando...</p>
      ) : drafts.length === 0 ? (
        <div className="flex flex-col gap-4 px-5 py-8" style={{ borderTop: '1px solid #F0EDF9' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(108,59,255,0.1)' }}>
              <FileText size={18} style={{ color: '#6C3BFF' }} />
            </div>
            <div>
              <p className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>Sin contratos aún</p>
              <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>Tu empleado puede redactar contratos desde cero o a partir de una conversación con un cliente.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2" style={{ paddingLeft: 52 }}>
            {[
              'Contrato de servicios para un nuevo cliente',
              'Renovación de un contrato existente con nuevas condiciones',
              'Carta de confidencialidad para un proveedor',
            ].map(ex => (
              <div key={ex} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: '#9B8FB5' }} />
                <p className="text-[12px]" style={{ color: '#9B8FB5' }}>{ex}</p>
              </div>
            ))}
          </div>
          <div style={{ paddingLeft: 52 }}>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
            >
              <Plus size={12} /> Crear primer borrador
            </button>
          </div>
          <div className="flex items-start gap-3 rounded-xl px-4 py-3.5 mt-2"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            <FileText size={14} style={{ color: '#6B6480', flexShrink: 0, marginTop: 1 }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>Configura tu plantilla de contrato</p>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#9B8FB5' }}>
                Sube tu formato y define las cláusulas para que el empleado siempre use el mismo diseño.
              </p>
            </div>
            <Link
              href={`/portal/${token}/oficina/plantillas`}
              className="shrink-0 text-[11px] font-medium px-3 h-8 flex items-center rounded-lg transition-opacity hover:opacity-70"
              style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5', textDecoration: 'none' }}
            >
              Ir a Plantillas
            </Link>
          </div>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <p className="text-[12px] py-8 text-center" style={{ color: '#9B8FB5', borderTop: '1px solid #F0EDF9' }}>
          Sin borradores que coincidan con el filtro. Ajusta el estado o las fechas.
        </p>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {filteredDrafts.map((draft, idx) => {
            const isOpen   = expanded.has(draft.id);
            const statusCf = DRAFT_STATUS[draft.status] ?? DRAFT_STATUS.borrador;
            const canSend  = draft.status !== 'enviado' && draft.status !== 'cancelado' && !!draft.client_email;
            const isSent   = sendDone === draft.id;
            const isSending = sending === draft.id;

            return (
              <div key={draft.id}
                style={{ borderBottom: idx === filteredDrafts.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                <button onClick={() => setExpanded(prev => { const next = new Set(prev); if (next.has(draft.id)) next.delete(draft.id); else next.add(draft.id); return next; })}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFB]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{draft.client_name || 'Sin nombre'}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: statusCf.bg, color: statusCf.color }}>{statusCf.label}</span>
                      {draft.source_type && draft.source_type !== 'manual' && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: '#F0EDF9', color: '#9B8FB5' }}>vía {draft.source_type}</span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: '#9B8FB5' }}>
                      {draft.client_email || 'Sin email'}{draft.client_rfc ? ` · RFC: ${draft.client_rfc}` : ''}
                      {' · '}{new Date(draft.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp size={14} style={{ color: '#6B6480', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: '#6B6480', flexShrink: 0 }} />}
                </button>

                {isOpen && (
                  <div className="px-5 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
                    <div className="pt-3 grid grid-cols-2 gap-3">
                      {[
                        { label: 'Nombre', field: 'client_name', value: draft.client_name },
                        { label: 'Email',  field: 'client_email', value: draft.client_email },
                        { label: 'RFC',    field: 'client_rfc',   value: draft.client_rfc   },
                        { label: 'Tel.',   field: 'client_phone', value: draft.client_phone  },
                      ].map(({ label, field, value }) => (
                        <div key={field}>
                          <p className="text-[11px] mb-1" style={{ color: '#6B6480' }}>{label}</p>
                          <input
                            defaultValue={value ?? ''}
                            onBlur={e => updateDraftField(draft.id, { [field]: e.target.value || null })}
                            disabled={draft.status === 'enviado'}
                            className="w-full px-2 py-1.5 rounded-lg text-[12px]"
                            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Cláusulas</p>
                      {(draft.clauses as Clause[]).map((clause, ci) => (
                        <div key={clause.id} className="rounded-lg overflow-hidden"
                          style={{ background: '#ffffff', border: `1px solid ${clause.enabled ? '#E8E3F5' : '#F0EDF9'}`, opacity: clause.enabled ? 1 : 0.55 }}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="text-[11px] font-bold uppercase flex-1" style={{ color: '#1A0A3B' }}>{ci + 1}. {clause.title}</span>
                            {!clause.required && draft.status !== 'enviado' && (
                              <button onClick={() => {
                                const updated = (draft.clauses as Clause[]).map(c => c.id === clause.id ? { ...c, enabled: !c.enabled } : c);
                                updateDraftField(draft.id, { clauses: updated });
                                setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, clauses: updated } : d));
                              }}>
                                {clause.enabled ? <ToggleRight size={16} style={{ color: '#22c55e' }} /> : <ToggleLeft size={16} style={{ color: '#9B8FB5' }} />}
                              </button>
                            )}
                            {clause.required && <span className="text-[11px]" style={{ color: '#ef4444' }}>Requerida</span>}
                          </div>
                          {clause.enabled && (
                            <div className="px-3 pb-2" style={{ borderTop: '1px solid #F0EDF9' }}>
                              {draft.status !== 'enviado' ? (
                                <textarea
                                  defaultValue={clause.body}
                                  rows={3}
                                  onBlur={e => {
                                    const updated = (draft.clauses as Clause[]).map(c => c.id === clause.id ? { ...c, body: e.target.value } : c);
                                    updateDraftField(draft.id, { clauses: updated });
                                    setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, clauses: updated } : d));
                                  }}
                                  className="w-full mt-2 px-2 py-1.5 rounded text-[12px] resize-none"
                                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', fontFamily: 'inherit', lineHeight: 1.65, outline: 'none' }}
                                />
                              ) : (
                                <p className="text-[12px] mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: '#1A0A3B' }}>{clause.body}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {draft.notes && (
                      <div className="rounded-lg p-3" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
                        <p className="text-[11px] mb-1 font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Notas del empleado</p>
                        <p className="text-[12px] leading-relaxed" style={{ color: '#1A0A3B' }}>{draft.notes}</p>
                      </div>
                    )}

                    {draft.status !== 'enviado' && draft.status !== 'cancelado' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => sendDraft(draft.id)}
                          disabled={!canSend || !!sending}
                          className="flex items-center gap-1.5 px-4 h-8 rounded-lg text-[12px] font-semibold transition-all"
                          style={{
                            background: isSent ? 'rgba(34,197,94,0.15)' : canSend ? '#6C3BFF' : '#F0EDF9',
                            color:      isSent ? '#22c55e' : canSend ? '#fff' : '#9B8FB5',
                            border:     isSent ? '1px solid rgba(34,197,94,0.3)' : 'none',
                            boxShadow:  canSend && !isSent ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
                            cursor:     canSend ? 'pointer' : 'not-allowed',
                          }}>
                          {isSent ? <><Check size={12} /> Enviado</> : isSending ? <><RefreshCw size={12} className="animate-spin" /> Enviando...</> : <><Mail size={12} /> Aprobar y enviar</>}
                        </button>
                        {!canSend && !draft.client_email && (
                          <span className="text-[11px]" style={{ color: '#b45309' }}>Agrega el email del cliente para enviar</span>
                        )}
                        <button onClick={() => cancelDraft(draft.id)}
                          className="flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-medium"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                          <X size={11} /> Cancelar
                        </button>
                      </div>
                    )}

                    {draft.status === 'enviado' && draft.sent_at && (
                      <p className="text-[11px] flex items-center gap-1" style={{ color: '#16a34a' }}>
                        <Send size={11} /> Enviado el {new Date(draft.sent_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewDraftForm({ token, templateClauses, onCreated }: { token: string; templateClauses: Clause[]; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [clauses, setClauses] = useState<Clause[]>(templateClauses.map(c => ({ ...c })));
  const [form, setForm] = useState({ client_name: '', client_email: '', client_rfc: '', client_phone: '', notes: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await fetch(`/api/portal/${token}/contract-drafts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, clauses, source_type: 'manual' }),
      });
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#6C3BFF' }}>Nuevo borrador de contrato</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Nombre del cliente *', field: 'client_name', required: true, placeholder: 'Nombre completo o razón social' },
          { label: 'Email del cliente *',  field: 'client_email', required: true, placeholder: 'correo@empresa.com' },
          { label: 'RFC',                  field: 'client_rfc',   required: false, placeholder: 'XAXX010101000' },
          { label: 'Teléfono',             field: 'client_phone', required: false, placeholder: '+52 81 1234 5678' },
        ].map(({ label, field, required, placeholder }) => (
          <div key={field}>
            <label className="text-[11px] block mb-1" style={{ color: '#6B6480' }}>{label}</label>
            <input
              required={required}
              value={form[field as keyof typeof form]}
              onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-[12px]"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            />
          </div>
        ))}
      </div>

      {clauses.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Cláusulas a incluir</p>
          {clauses.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
              <span className="text-[12px] flex-1 font-medium" style={{ color: c.enabled ? '#1A0A3B' : '#9B8FB5' }}>{i + 1}. {c.title}</span>
              {c.required
                ? <span className="text-[11px]" style={{ color: '#ef4444' }}>Requerida</span>
                : <button type="button" onClick={() => setClauses(prev => prev.map(cl => cl.id === c.id ? { ...cl, enabled: !cl.enabled } : cl))}>
                    {c.enabled ? <ToggleRight size={16} style={{ color: '#22c55e' }} /> : <ToggleLeft size={16} style={{ color: '#9B8FB5' }} />}
                  </button>
              }
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="text-[11px] block mb-1" style={{ color: '#6B6480' }}>Notas (lo que se acordó en llamada o correo)</label>
        <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Ej: cliente solicitó cambio en cláusula de pago a 30 días, vigencia de 12 meses..."
          className="w-full px-3 py-2 rounded-lg text-[12px] resize-none"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', fontFamily: 'inherit', lineHeight: 1.65, outline: 'none' }} />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-4 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
          {saving ? 'Creando...' : 'Crear borrador'}
        </button>
        <button type="button" onClick={onCreated}
          className="px-4 h-8 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70"
          style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
