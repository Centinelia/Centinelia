'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, Trash2, UserCheck, Send, Users, ExternalLink, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OTemplate {
  id:                string;
  agent_id:          string;
  name:              string;
  type:              string;
  steps:             string[];
  document_requests: string[];
  notes:             string | null;
  active:            boolean;
  created_at:        string;
}

interface OInstance {
  id:              string;
  template_id:     string;
  contact_name:    string;
  contact_email:   string;
  status:          string;
  submitted_at:    string | null;
  submit_token:    string;
  submitted_docs:  { name: string; url: string }[];
  internal_notes:  string | null;
  created_at:      string;
  onboarding_templates?: { name: string; steps: string[] };
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:  { label: 'Pendiente',   color: '#6b7280', bg: 'rgba(107,114,128,0.1)'  },
  en_proceso: { label: 'En proceso',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'   },
  completado: { label: 'Completado',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)'    },
  cancelado:  { label: 'Cancelado',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'    },
};

const TYPE_LABELS: Record<string, string> = {
  empleado:  'Empleado',
  cliente:   'Cliente',
  proveedor: 'Proveedor',
  otro:      'Otro',
};

const SURFACE_STYLE = {
  background: '#ffffff',
  border: '1px solid #E8E3F5',
  boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
} as const;

const INPUT_STYLE = {
  background: '#FAFAFB',
  border: '1px solid #E8E3F5',
  color: '#1A0A3B',
  outline: 'none',
} as const;

export default function OnboardingSection({ token }: {
  token: string;
}) {
  const [templates, setTemplates]   = useState<OTemplate[]>([]);
  const [instances, setInstances]   = useState<OInstance[]>([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState<'instances' | 'templates'>('instances');
  const [search, setSearch]         = useState('');
  const [expandedT, setExpandedT]   = useState<Set<string>>(new Set());
  const [expandedI, setExpandedI]   = useState<Set<string>>(new Set());
  const [showTplForm, setShowTplForm] = useState(false);
  const [showSendForm, setShowSendForm] = useState<string | null>(null); // template id
  const [saving, setSaving]         = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sendError, setSendError]     = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [tplForm, setTplForm] = useState({
    name:    '',
    type:    'empleado',
    steps:   [''],
    docs:    [''],
    notes:   '',
  });

  const [sendForm, setSendForm] = useState({
    contact_name:  '',
    contact_email: '',
    template_id:   '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, iRes] = await Promise.all([
        fetch(`/api/portal/${token}/onboarding`),
        fetch(`/api/portal/${token}/onboarding?view=instances`),
      ]);
      const [tData, iData] = await Promise.all([tRes.json(), iRes.json()]);
      setTemplates(tData.templates ?? []);
      setInstances(iData.instances ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function toggleT(id: string) {
    setExpandedT(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleI(id: string) {
    setExpandedI(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/portal/${token}/onboarding`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:            'create_template',
          name:              tplForm.name,
          type:              tplForm.type,
          steps:             tplForm.steps.filter(Boolean),
          document_requests: tplForm.docs.filter(Boolean),
          notes:             tplForm.notes || null,
        }),
      });
      if (!res.ok) throw new Error('No se pudo crear la plantilla');
      setTplForm({ name: '', type: 'empleado', steps: [''], docs: [''], notes: '' });
      setShowTplForm(false);
      await load();
    } catch (err: any) {
      setCreateError(err.message ?? 'Error al crear la plantilla');
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!showSendForm) return;
    setSaving(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/portal/${token}/onboarding`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:        'create_instance',
          template_id:   showSendForm,
          contact_name:  sendForm.contact_name,
          contact_email: sendForm.contact_email,
        }),
      });
      if (!res.ok) throw new Error('No se pudo enviar el onboarding');
      setSendForm({ contact_name: '', contact_email: '', template_id: '' });
      setShowSendForm(null);
      setView('instances');
      await load();
    } catch (err: any) {
      setSendError(err.message ?? 'Error al enviar el onboarding');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(instanceId: string, status: string) {
    const prev = instances.find(i => i.id === instanceId)?.status;
    setInstances(is => is.map(i => i.id === instanceId ? { ...i, status } : i));
    try {
      const res = await fetch(`/api/portal/${token}/onboarding`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'instance', id: instanceId, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      if (prev) setInstances(is => is.map(i => i.id === instanceId ? { ...i, status: prev } : i));
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
      const res = await fetch(`/api/portal/${token}/onboarding`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'template', id }),
      });
      if (!res.ok) throw new Error('No se pudo eliminar la plantilla');
      await load();
    } catch (err: any) {
      setActionError(err.message ?? 'Error al eliminar');
    }
  }

  async function handleDeleteInstance(id: string) {
    if (!confirm('¿Eliminar este onboarding?')) return;
    try {
      const res = await fetch(`/api/portal/${token}/onboarding`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'instance', id }),
      });
      if (!res.ok) throw new Error('No se pudo eliminar el proceso');
      await load();
    } catch (err: any) {
      setActionError(err.message ?? 'Error al eliminar');
    }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? '');

  const filteredTemplates = templates.filter(t => !search.trim() || t.name.toLowerCase().includes(search.toLowerCase()));
  const filteredInstances = instances.filter(inst => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return inst.contact_name.toLowerCase().includes(q) || inst.contact_email.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-7 w-full">

      {/* Hero */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          Onboarding
        </p>
        <h1 className="text-xl font-bold mt-1.5 leading-snug" style={{ color: '#1A0A3B' }}>
          Tu empleado guía a cada persona en su proceso de incorporación.
        </h1>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: '#6B6480' }}>
          Define plantillas con los pasos y documentos que necesitas de nuevos empleados, clientes o proveedores.
          Tu empleado envía el formulario por correo y lleva el seguimiento desde aquí.
        </p>
      </div>

      {/* How it works — se conserva el acento lila (bloque destacado) */}
      <div className="flex flex-col sm:flex-row gap-3">
        {[
          { n: '1', t: 'Crea una plantilla', d: 'Define los pasos del proceso y los documentos que necesitas recibir.' },
          { n: '2', t: 'Envíala por correo', d: 'El contacto recibe un link con su formulario personalizado para completarlo.' },
          { n: '3', t: 'Supervisa el avance', d: 'Ve el estatus y descarga los documentos recibidos desde esta pantalla.' },
        ].map(s => (
          <div key={s.n} className="flex gap-3 rounded-2xl p-4 flex-1" style={{ background: 'rgba(108,59,255,0.04)', border: '1px solid rgba(108,59,255,0.15)' }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
              style={{ background: 'rgba(108,59,255,0.14)', color: '#6C3BFF' }}>{s.n}</span>
            <div>
              <p className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>{s.t}</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: '#9B8FB5' }}>Plantillas y procesos</p>
        <button
          onClick={() => { setShowTplForm(v => !v); setShowSendForm(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
          <Plus size={12} /> Nueva plantilla
        </button>
      </div>

      {/* Template create form */}
      {showTplForm && (
        <form onSubmit={handleCreateTemplate} className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
          <p className="text-xs font-semibold" style={{ color: '#6C3BFF' }}>Nueva plantilla de onboarding</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: '#6B6480' }}>Nombre *</label>
              <input required value={tplForm.name} onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej. Onboarding empleado nuevo"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={INPUT_STYLE} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: '#6B6480' }}>Tipo</label>
              <Select value={tplForm.type} onValueChange={v => setTplForm(p => ({ ...p, type: v }))}>
                <SelectTrigger style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: '#6B6480' }}>Pasos del proceso</label>
            {tplForm.steps.map((s, i) => (
              <div key={i} className="flex gap-2 mb-1.5">
                <input value={s} onChange={e => {
                  const next = [...tplForm.steps]; next[i] = e.target.value;
                  setTplForm(p => ({ ...p, steps: next }));
                }}
                  placeholder={`Paso ${i + 1}...`}
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={INPUT_STYLE} />
                {tplForm.steps.length > 1 && (
                  <button type="button" onClick={() => setTplForm(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }))}
                    className="px-2 py-1 rounded-lg text-xs"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                    aria-label="Quitar paso">×</button>
                )}
              </div>
            ))}
            <button type="button"
              onClick={() => setTplForm(p => ({ ...p, steps: [...p.steps, ''] }))}
              className="text-xs mt-1 transition-opacity hover:opacity-80 font-medium"
              style={{ color: '#6C3BFF' }}>
              + Agregar paso
            </button>
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: '#6B6480' }}>Documentos a solicitar</label>
            {tplForm.docs.map((d, i) => (
              <div key={i} className="flex gap-2 mb-1.5">
                <input value={d} onChange={e => {
                  const next = [...tplForm.docs]; next[i] = e.target.value;
                  setTplForm(p => ({ ...p, docs: next }));
                }}
                  placeholder={`Ej. Identificación oficial`}
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={INPUT_STYLE} />
                {tplForm.docs.length > 1 && (
                  <button type="button" onClick={() => setTplForm(p => ({ ...p, docs: p.docs.filter((_, j) => j !== i) }))}
                    className="px-2 py-1 rounded-lg text-xs"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                    aria-label="Quitar documento">×</button>
                )}
              </div>
            ))}
            <button type="button"
              onClick={() => setTplForm(p => ({ ...p, docs: [...p.docs, ''] }))}
              className="text-xs mt-1 transition-opacity hover:opacity-80 font-medium"
              style={{ color: '#6C3BFF' }}>
              + Agregar documento
            </button>
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: '#6B6480' }}>Notas adicionales</label>
            <textarea rows={2} value={tplForm.notes} onChange={e => setTplForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Instrucciones especiales..."
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ ...INPUT_STYLE, fontFamily: 'inherit' }} />
          </div>

          {createError && (
            <p className="text-xs px-3 py-2 rounded-lg"
              style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>{createError}</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
              {saving ? 'Guardando...' : 'Crear plantilla'}
            </button>
            <button type="button" onClick={() => { setShowTplForm(false); setCreateError(null); }}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Action error */}
      {actionError && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>{actionError}
          <button onClick={() => setActionError(null)} className="ml-2 underline">Cerrar</button>
        </p>
      )}

      {/* View toggle */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
        {(['instances', 'templates'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: view === v ? '#6C3BFF' : 'transparent',
              color: view === v ? '#fff' : '#6B6480',
              boxShadow: view === v ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
            }}>
            {v === 'instances' ? `Procesos activos${instances.length > 0 ? ` (${instances.length})` : ''}` : 'Plantillas'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9B8FB5', pointerEvents: 'none' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={view === 'templates' ? 'Buscar plantilla...' : 'Buscar por nombre o correo...'}
          className="w-full text-xs rounded-xl"
          style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
        />
      </div>

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: '#6B6480' }}>Cargando...</p>
      ) : view === 'templates' ? (
        /* Templates list */
        templates.length === 0 ? (
          <div className="rounded-2xl p-6 flex flex-col gap-4" style={SURFACE_STYLE}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(108,59,255,0.1)' }}>
                <UserCheck size={16} style={{ color: '#6C3BFF' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Sin plantillas todavía</p>
                <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>Crea una plantilla con los pasos y documentos que necesitas de cada contacto.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pl-12">
              {[
                'Empleado nuevo: contrato, INE, CURP, comprobante de domicilio',
                'Cliente nuevo: RFC, acta constitutiva, firma de contrato de servicios',
                'Proveedor: alta en sistema, datos bancarios, CFDI de servicios',
              ].map(ex => (
                <div key={ex} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: '#9B8FB5' }} />
                  <p className="text-xs" style={{ color: '#6B6480' }}>{ex}</p>
                </div>
              ))}
            </div>
            <div className="pl-12">
              <button
                onClick={() => { setShowTplForm(true); setView('templates'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
              >
                <Plus size={12} /> Crear primera plantilla
              </button>
            </div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: '#6B6480' }}>Sin resultados para "{search}"</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredTemplates.map(t => (
              <div key={t.id} className="rounded-2xl overflow-hidden" style={SURFACE_STYLE}>
                <button onClick={() => toggleT(t.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAFAFB]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>{t.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                        {TYPE_LABELS[t.type] ?? t.type}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>{t.steps.length} pasos · {t.document_requests.length} documentos</p>
                  </div>
                  <button
                    onClick={ev => { ev.stopPropagation(); setShowSendForm(t.id); setShowTplForm(false); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 mr-2 flex-shrink-0"
                    style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
                    <Send size={10} /> Enviar
                  </button>
                  {expandedT.has(t.id) ? <ChevronUp size={14} style={{ color: '#6B6480', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: '#6B6480', flexShrink: 0 }} />}
                </button>

                {expandedT.has(t.id) && (
                  <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid #F0EDF9' }}>
                    <div className="pt-3">
                      <p className="text-xs font-semibold mb-2" style={{ color: '#6B6480' }}>Pasos</p>
                      {t.steps.map((s, i) => <p key={i} className="text-sm mb-1" style={{ color: '#1A0A3B' }}>{i + 1}. {s}</p>)}
                    </div>
                    {t.document_requests.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: '#6B6480' }}>Documentos solicitados</p>
                        {t.document_requests.map((d, i) => <p key={i} className="text-sm mb-1 flex gap-2" style={{ color: '#1A0A3B' }}><span style={{ color: '#6C3BFF' }}>•</span>{d}</p>)}
                      </div>
                    )}
                    {t.notes && <p className="text-sm" style={{ color: '#1A0A3B' }}>{t.notes}</p>}
                    <div className="flex justify-end">
                      <button onClick={() => handleDeleteTemplate(t.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                        <Trash2 size={11} /> Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Instances list */
        instances.length === 0 ? (
          <div className="rounded-2xl p-6 flex flex-col gap-4" style={SURFACE_STYLE}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <Users size={16} style={{ color: '#22c55e' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Sin procesos activos</p>
                <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                  {templates.length === 0
                    ? 'Primero crea una plantilla y luego envíala al contacto que quieres incorporar.'
                    : 'Abre una plantilla en la pestaña "Plantillas" y usa el botón Enviar para iniciar un proceso.'}
                </p>
              </div>
            </div>
            {templates.length > 0 && (
              <div className="pl-12">
                <button
                  onClick={() => setView('templates')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
                >
                  <Send size={12} /> Ver plantillas para enviar
                </button>
              </div>
            )}
          </div>
        ) : filteredInstances.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: '#6B6480' }}>Sin resultados para "{search}"</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredInstances.map(inst => {
              const stCfg   = STATUS_CFG[inst.status] ?? STATUS_CFG.pendiente;
              const tplName = (inst as any).onboarding_templates?.name ?? 'Onboarding';
              const isOpen  = expandedI.has(inst.id);

              return (
                <div key={inst.id} className="rounded-2xl overflow-hidden" style={SURFACE_STYLE}>
                  <button onClick={() => toggleI(inst.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAFAFB]">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: stCfg.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>{inst.contact_name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: stCfg.bg, color: stCfg.color }}>{stCfg.label}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>{inst.contact_email} · {tplName}</p>
                    </div>
                    {isOpen ? <ChevronUp size={14} style={{ color: '#6B6480', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: '#6B6480', flexShrink: 0 }} />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid #F0EDF9' }}>
                      <div className="pt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: '#6B6480' }}>Enviado</p>
                          <p className="text-sm" style={{ color: '#1A0A3B' }}>
                            {new Date(inst.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        {inst.submitted_at && (
                          <div>
                            <p className="text-xs mb-0.5" style={{ color: '#6B6480' }}>Completado</p>
                            <p className="text-sm" style={{ color: '#22c55e' }}>
                              {new Date(inst.submitted_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Link to form */}
                      <a
                        href={`${baseUrl}/onboarding/${inst.submit_token}`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80 font-medium"
                        style={{ color: '#6C3BFF' }}>
                        <ExternalLink size={11} /> Ver formulario de onboarding
                      </a>

                      {/* Submitted docs */}
                      {inst.submitted_docs?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2" style={{ color: '#6B6480' }}>Documentos recibidos</p>
                          {inst.submitted_docs.map((doc, i) => (
                            <a key={i} href={doc.url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs mb-1 transition-opacity hover:opacity-80 font-medium"
                              style={{ color: '#6C3BFF' }}>
                              <ExternalLink size={10} /> {doc.name}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Status change */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {inst.status !== 'completado' && (
                          <button onClick={() => handleStatusChange(inst.id, 'completado')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
                            Marcar completado
                          </button>
                        )}
                        {inst.status !== 'en_proceso' && inst.status !== 'completado' && (
                          <button onClick={() => handleStatusChange(inst.id, 'en_proceso')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                            En proceso
                          </button>
                        )}
                        <button onClick={() => handleDeleteInstance(inst.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                          <Trash2 size={11} /> Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      </div>{/* end inner flex col */}

      {/* Send modal */}
      {showSendForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: 'rgba(15,5,34,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
            style={{
              background: '#ffffff',
              border: '1px solid #E8E3F5',
              boxShadow: '0 24px 60px rgba(26,10,59,0.20)',
            }}>
            <h3 className="text-base font-semibold" style={{ color: '#1A0A3B' }}>Enviar onboarding</h3>
            <form onSubmit={handleSend} className="flex flex-col gap-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: '#6B6480' }}>Nombre del contacto *</label>
                <input required value={sendForm.contact_name} onChange={e => setSendForm(p => ({ ...p, contact_name: e.target.value }))}
                  placeholder="Ana García"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={INPUT_STYLE} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: '#6B6480' }}>Correo electrónico *</label>
                <input required type="email" value={sendForm.contact_email} onChange={e => setSendForm(p => ({ ...p, contact_email: e.target.value }))}
                  placeholder="ana@empresa.com"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={INPUT_STYLE} />
              </div>
              {sendError && (
                <p className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>{sendError}</p>
              )}
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                  {saving ? 'Enviando...' : 'Enviar correo'}
                </button>
                <button type="button" onClick={() => { setShowSendForm(null); setSendError(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
