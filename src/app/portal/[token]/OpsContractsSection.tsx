'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, ChevronDown, ChevronUp, FileText,
  Send, Check, X, ToggleLeft,
  ToggleRight, RefreshCw, Mail,
} from 'lucide-react';

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

  useEffect(() => { load(); }, [load]);

  async function sendDraft(id: string) {
    setSending(id);
    const res = await fetch(`/api/portal/${token}/contract-drafts/${id}/send`, { method: 'POST' });
    if (res.ok) { setSendDone(id); setTimeout(() => { setSendDone(null); load(); }, 2000); }
    setSending(null);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
          Contratos con clientes
        </p>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
          <Plus size={12} /> Nuevo borrador
        </button>
      </div>

      {showNew && <NewDraftForm token={token} templateClauses={templateClauses} onCreated={() => { setShowNew(false); load(); }} />}

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl p-6 flex flex-col gap-4" style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(108,59,255,0.1)' }}>
              <FileText size={16} style={{ color: '#9B6DFF' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Sin contratos aún</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>Tu empleado puede redactar contratos desde cero o a partir de una conversación con un cliente.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-12">
            {[
              'Contrato de servicios para un nuevo cliente',
              'Renovación de un contrato existente con nuevas condiciones',
              'Carta de confidencialidad para un proveedor',
            ].map(ex => (
              <div key={ex} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--c-text-4)' }} />
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{ex}</p>
              </div>
            ))}
          </div>
          <div className="pl-12">
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF' }}
            >
              <Plus size={12} /> Crear primer borrador
            </button>
          </div>
          <div className="flex items-start gap-3 rounded-xl px-4 py-3.5 mt-2" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
            <FileText size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0, marginTop: 1 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>Configura tu plantilla de contrato</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--c-text-4)' }}>
                Sube tu formato y define las cláusulas para que el empleado siempre use el mismo diseño.
              </p>
            </div>
            <Link
              href={`/portal/${token}/oficina/plantillas`}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)', textDecoration: 'none' }}
            >
              Ir a Plantillas
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {drafts.map(draft => {
            const isOpen   = expanded.has(draft.id);
            const statusCf = DRAFT_STATUS[draft.status] ?? DRAFT_STATUS.borrador;
            const canSend  = draft.status !== 'enviado' && draft.status !== 'cancelado' && !!draft.client_email;
            const isSent   = sendDone === draft.id;
            const isSending = sending === draft.id;

            return (
              <div key={draft.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <button onClick={() => setExpanded(prev => { const next = new Set(prev); next.has(draft.id) ? next.delete(draft.id) : next.add(draft.id); return next; })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{draft.client_name || 'Sin nombre'}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: statusCf.bg, color: statusCf.color }}>{statusCf.label}</span>
                      {draft.source_type && draft.source_type !== 'manual' && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--c-text-4)' }}>vía {draft.source_type}</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                      {draft.client_email || 'Sin email'}{draft.client_rfc ? ` · RFC: ${draft.client_rfc}` : ''}
                      {' · '}{new Date(draft.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--c-divider)' }}>
                    <div className="pt-3 grid grid-cols-2 gap-3">
                      {[
                        { label: 'Nombre', field: 'client_name', value: draft.client_name },
                        { label: 'Email',  field: 'client_email', value: draft.client_email },
                        { label: 'RFC',    field: 'client_rfc',   value: draft.client_rfc   },
                        { label: 'Tel.',   field: 'client_phone', value: draft.client_phone  },
                      ].map(({ label, field, value }) => (
                        <div key={field}>
                          <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>{label}</p>
                          <input
                            defaultValue={value ?? ''}
                            onBlur={e => updateDraftField(draft.id, { [field]: e.target.value || null })}
                            disabled={draft.status === 'enviado'}
                            className="w-full px-2 py-1.5 rounded-lg text-xs"
                            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Cláusulas</p>
                      {(draft.clauses as Clause[]).map((clause, ci) => (
                        <div key={clause.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${clause.enabled ? 'var(--c-border)' : 'rgba(255,255,255,0.04)'}`, opacity: clause.enabled ? 1 : 0.45 }}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="text-xs font-bold uppercase flex-1" style={{ color: 'var(--c-text-2)' }}>{ci + 1}. {clause.title}</span>
                            {!clause.required && draft.status !== 'enviado' && (
                              <button onClick={() => {
                                const updated = (draft.clauses as Clause[]).map(c => c.id === clause.id ? { ...c, enabled: !c.enabled } : c);
                                updateDraftField(draft.id, { clauses: updated });
                                setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, clauses: updated } : d));
                              }}>
                                {clause.enabled ? <ToggleRight size={16} style={{ color: '#22c55e' }} /> : <ToggleLeft size={16} style={{ color: 'var(--c-text-4)' }} />}
                              </button>
                            )}
                            {clause.required && <span className="text-xs" style={{ color: '#f87171' }}>Requerida</span>}
                          </div>
                          {clause.enabled && (
                            <div className="px-3 pb-2" style={{ borderTop: '1px solid var(--c-divider)' }}>
                              {draft.status !== 'enviado' ? (
                                <textarea
                                  defaultValue={clause.body}
                                  rows={3}
                                  onBlur={e => {
                                    const updated = (draft.clauses as Clause[]).map(c => c.id === clause.id ? { ...c, body: e.target.value } : c);
                                    updateDraftField(draft.id, { clauses: updated });
                                    setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, clauses: updated } : d));
                                  }}
                                  className="w-full mt-2 px-2 py-1.5 rounded text-xs resize-none"
                                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit', lineHeight: 1.65, outline: 'none' }}
                                />
                              ) : (
                                <p className="text-xs mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{clause.body}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {draft.notes && (
                      <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                        <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Notas del empleado</p>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{draft.notes}</p>
                      </div>
                    )}

                    {draft.status !== 'enviado' && draft.status !== 'cancelado' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => sendDraft(draft.id)}
                          disabled={!canSend || !!sending}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: isSent ? 'rgba(34,197,94,0.15)' : canSend ? '#6C3BFF' : 'var(--c-surface-2)',
                            color: isSent ? '#22c55e' : canSend ? '#fff' : 'var(--c-text-4)',
                            border: isSent ? '1px solid rgba(34,197,94,0.3)' : 'none',
                            cursor: canSend ? 'pointer' : 'not-allowed',
                          }}>
                          {isSent ? <><Check size={12} /> Enviado</> : isSending ? <><RefreshCw size={12} className="animate-spin" /> Enviando...</> : <><Mail size={12} /> Aprobar y enviar</>}
                        </button>
                        {!canSend && !draft.client_email && (
                          <span className="text-xs" style={{ color: '#f59e0b' }}>Agrega el email del cliente para enviar</span>
                        )}
                        <button onClick={() => cancelDraft(draft.id)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                          <X size={11} /> Cancelar
                        </button>
                      </div>
                    )}

                    {draft.status === 'enviado' && draft.sent_at && (
                      <p className="text-xs flex items-center gap-1" style={{ color: '#22c55e' }}>
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
    await fetch(`/api/portal/${token}/contract-drafts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, clauses, source_type: 'manual' }),
    });
    setSaving(false); onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-4 flex flex-col gap-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
      <p className="text-xs font-semibold" style={{ color: '#9B6DFF' }}>Nuevo borrador de contrato</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Nombre del cliente *', field: 'client_name', required: true, placeholder: 'Nombre completo o razón social' },
          { label: 'Email del cliente *',  field: 'client_email', required: true, placeholder: 'correo@empresa.com' },
          { label: 'RFC',                  field: 'client_rfc',   required: false, placeholder: 'XAXX010101000' },
          { label: 'Teléfono',             field: 'client_phone', required: false, placeholder: '+52 81 1234 5678' },
        ].map(({ label, field, required, placeholder }) => (
          <div key={field}>
            <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>{label}</label>
            <input
              required={required}
              value={form[field as keyof typeof form]}
              onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
            />
          </div>
        ))}
      </div>

      {clauses.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Cláusulas a incluir</p>
          {clauses.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <span className="text-xs flex-1 font-medium" style={{ color: c.enabled ? 'var(--c-text)' : 'var(--c-text-4)' }}>{i + 1}. {c.title}</span>
              {c.required
                ? <span className="text-xs" style={{ color: '#f87171' }}>Requerida</span>
                : <button type="button" onClick={() => setClauses(prev => prev.map(cl => cl.id === c.id ? { ...cl, enabled: !cl.enabled } : cl))}>
                    {c.enabled ? <ToggleRight size={16} style={{ color: '#22c55e' }} /> : <ToggleLeft size={16} style={{ color: 'var(--c-text-4)' }} />}
                  </button>
              }
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="text-xs block mb-1" style={{ color: 'var(--c-text-3)' }}>Notas (lo que se acordó en llamada o correo)</label>
        <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Ej: cliente solicitó cambio en cláusula de pago a 30 días, vigencia de 12 meses..."
          className="w-full px-3 py-2 rounded-lg text-xs resize-none"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit', lineHeight: 1.65, outline: 'none' }} />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: '#6C3BFF', color: '#fff' }}>
          {saving ? 'Creando...' : 'Crear borrador'}
        </button>
        <button type="button" onClick={onCreated} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
