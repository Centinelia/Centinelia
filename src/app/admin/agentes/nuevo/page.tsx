'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UtensilsCrossed, Stethoscope, Sparkles, Briefcase, ShoppingBag, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PLAN_FEATURES, PLAN_LABELS, PLAN_MINUTES, FEATURE_LABELS } from '@/types/agent';
import type { Plan, AgentFeatures } from '@/types/agent';
import { AGENT_TEMPLATES } from '@/lib/voice/templates';
import type { GiroTemplate } from '@/lib/voice/templates';

const TEMPLATE_ICONS: Record<GiroTemplate, LucideIcon> = {
  restaurante: UtensilsCrossed,
  consultorio: Stethoscope,
  estetica:    Sparkles,
  agencia:     Briefcase,
  retail:      ShoppingBag,
  general:     Building2,
};

const PLANS: Plan[] = ['comercial', 'pro'];
const PLAN_COLORS: Record<Plan, string> = {
  comercial: '#3b82f6', pro: '#a855f7',
};

export default function NuevoAgentePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const prefillClientName  = searchParams.get('client_name')  ?? '';
  const prefillClientEmail = searchParams.get('client_email') ?? '';
  const prefillPortalEmail = searchParams.get('portal_email') ?? '';
  const isExistingClient   = !!prefillPortalEmail;

  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<GiroTemplate | null>(null);
  const [plan, setPlan] = useState<Plan>('comercial');
  const [features, setFeatures] = useState<AgentFeatures>(PLAN_FEATURES.comercial);

  const selectedTpl = AGENT_TEMPLATES.find(t => t.id === template);
  const [formTab, setFormTab] = useState<'info' | 'agente' | 'funciones'>('info');

  const handleTemplateSelect = (id: GiroTemplate) => {
    const tpl = AGENT_TEMPLATES.find(t => t.id === id)!;
    setTemplate(id);
    const planFeatures = PLAN_FEATURES[plan];
    const merged = Object.fromEntries(
      Object.keys(tpl.features).map(k => [
        k,
        tpl.features[k as keyof AgentFeatures] && planFeatures[k as keyof AgentFeatures],
      ])
    ) as unknown as AgentFeatures;
    setFeatures(merged);
  };

  const handlePlanChange = (p: Plan) => {
    setPlan(p);
    if (selectedTpl) {
      const planFeatures = PLAN_FEATURES[p];
      const merged = Object.fromEntries(
        Object.keys(selectedTpl.features).map(k => [
          k,
          selectedTpl.features[k as keyof AgentFeatures] && planFeatures[k as keyof AgentFeatures],
        ])
      ) as unknown as AgentFeatures;
      setFeatures(merged);
    } else {
      setFeatures(PLAN_FEATURES[p]);
    }
  };

  const toggleFeature = (key: keyof AgentFeatures) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      client_name:            fd.get('client_name'),
      client_email:           fd.get('client_email') || null,
      portal_email:           prefillPortalEmail || null,
      business_name:          fd.get('business_name'),
      business_description:   fd.get('business_description'),
      business_address:       fd.get('business_address'),
      business_phone_display: fd.get('business_phone_display'),
      transfer_whatsapp:      fd.get('transfer_whatsapp'),
      transfer_number:        fd.get('transfer_number'),
      calendar_url:           fd.get('calendar_url'),
      business_website:       fd.get('business_website') || null,
      timezone:               fd.get('timezone') || 'America/Monterrey',
      phone_number:           fd.get('phone_number'),
      knowledge_base:         fd.get('knowledge_base'),
      agent_name:             plan === 'pro' ? fd.get('agent_name') : null,
      giro_template:          template,
      plan,
      features,
      minutes_included: PLAN_MINUTES[plan],
    };

    const res = await fetch('/api/admin/agentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/agentes/${data.id}`);
    } else {
      alert('Error al crear el agente');
      setSaving(false);
    }
  };

  // Step 1: template selection
  if (!template) {
    return (
      <div className="p-4 md:p-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--c-text)' }}>Nuevo agente</h1>
        {isExistingClient ? (
          <div className="mb-6 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
            style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.2)', color: '#9B6DFF' }}>
            Nueva empresa para <strong style={{ color: 'var(--c-text)' }}>{prefillClientName}</strong>
            <span style={{ color: 'var(--c-text-3)', fontWeight: 400, marginLeft: 4 }}>· acceso portal heredado automáticamente</span>
          </div>
        ) : (
          <p className="text-sm mb-8" style={{ color: 'var(--c-text-2)' }}>
            Elige el tipo de negocio para pre-configurar las funcionalidades correctas.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {AGENT_TEMPLATES.map(tpl => {
            const Icon = TEMPLATE_ICONS[tpl.id];
            return (
            <button
              key={tpl.id}
              onClick={() => handleTemplateSelect(tpl.id)}
              className="p-5 rounded-xl text-left transition-all hover:scale-[1.02]"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            >
              <div className="mb-3 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.1)' }}>
                <Icon size={18} style={{ color: '#9B6DFF' }} />
              </div>
              <div className="font-semibold text-sm mb-1" style={{ color: 'var(--c-text)' }}>{tpl.label}</div>
              <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>{tpl.description}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {Object.entries(tpl.features)
                  .filter(([, v]) => v)
                  .slice(0, 3)
                  .map(([k]) => (
                    <span key={k} className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF' }}>
                      {FEATURE_SHORT[k as keyof AgentFeatures]}
                    </span>
                  ))}
              </div>
            </button>
          ); })}
        </div>
      </div>
    );
  }

  // Step 2: full form (tabbed)
  type Tab = 'info' | 'agente' | 'funciones';
  const FORM_TABS: { id: Tab; label: string }[] = [
    { id: 'info',     label: 'Información' },
    { id: 'agente',   label: 'Agente' },
    { id: 'funciones', label: 'Funciones' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setTemplate(null)} className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>
          ← Cambiar tipo
        </button>
        <div className="flex items-center gap-2">
          {selectedTpl && (() => { const TplIcon = TEMPLATE_ICONS[selectedTpl.id]; return <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.1)' }}><TplIcon size={16} style={{ color: '#9B6DFF' }} /></div>; })()}
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>{selectedTpl?.label}</h1>
            <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>{selectedTpl?.description}</p>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {FORM_TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setFormTab(t.id as any)}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: formTab === t.id ? '#6C3BFF' : 'transparent', color: formTab === t.id ? '#fff' : 'var(--c-text-3)' }}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* Tab: Información */}
        <div className={formTab !== 'info' ? 'hidden' : 'flex flex-col gap-6'}>
          <Section title="Plan">
            <div className="grid grid-cols-3 gap-3">
              {PLANS.map(p => (
                <button key={p} type="button" onClick={() => handlePlanChange(p)}
                  className="p-3 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: plan === p ? PLAN_COLORS[p] : 'var(--c-border)',
                    background:  plan === p ? `${PLAN_COLORS[p]}18` : 'var(--c-surface)',
                  }}>
                  <div className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{PLAN_LABELS[p]}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>{PLAN_MINUTES[p]} min/mes</div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Datos del cliente">
            {isExistingClient && (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: 'var(--c-text-3)' }}>
                Cliente existente · campos bloqueados
              </div>
            )}
            <Field label="Nombre del cliente (interno)" name="client_name" required
              defaultValue={prefillClientName} readOnly={isExistingClient} />
            <Field label="Email del cliente (alertas)" name="client_email" placeholder="cliente@email.com"
              defaultValue={prefillClientEmail} readOnly={isExistingClient} />
            <Field label="WhatsApp del dueño (notificaciones)" name="transfer_whatsapp" placeholder="+52 81 1234 5678" />
          </Section>

          <Section title="Información del negocio">
            <Field label="Nombre del negocio" name="business_name" required placeholder="Ej: Restaurante El Rincón" />
            <Field label="Descripción del negocio" name="business_description" textarea
              placeholder={selectedTpl?.description ? `Ej: ${selectedTpl.description} en Monterrey NL` : undefined} />
            <Field label="Dirección" name="business_address" />
            <Field label="Teléfono (que menciona el agente)" name="business_phone_display" placeholder="+52 81 1234 5678" />
            <Field label="Número de transferencia" name="transfer_number" placeholder="+52 81 1234 5678" />
            {selectedTpl?.features.appointment_booking && (
              <Field label={`Link de calendario para ${selectedTpl.appointmentLabel}s`} name="calendar_url" placeholder="https://calendly.com/..." />
            )}
            <Field label="Sitio web del negocio" name="business_website" placeholder="https://negocio.com" />
            <Field label="Zona horaria" name="timezone" placeholder="America/Monterrey" />
            <Field label="Número Vapi (recibe las llamadas)" name="phone_number" placeholder="+19284158163" />
          </Section>
        </div>

        {/* Tab: Agente */}
        <div className={formTab !== 'agente' ? 'hidden' : 'flex flex-col gap-6'}>
          <Section title="Identidad del agente">
            <div className="p-3 rounded-lg" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                <span style={{ color: '#a855f7', fontWeight: 600 }}>Plan Pro</span> En Comercial el agente se llama <strong style={{ color: 'var(--c-text)' }}>Centinelia</strong>. Con Pro puedes darle un nombre propio.
              </p>
            </div>
            <Field label="Nombre del agente" name="agent_name" placeholder="Ej: Sofía (solo Plan Pro)" disabled={plan !== 'pro'} />
          </Section>

          <Section title="Base de conocimiento">
            <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
              {selectedTpl?.id === 'restaurante' && 'Pega aquí el menú completo con precios, horarios y FAQs.'}
              {selectedTpl?.id === 'consultorio' && 'Pega aquí los servicios, doctores, precios y FAQs del consultorio.'}
              {selectedTpl?.id === 'estetica' && 'Pega aquí el catálogo de servicios con precios y FAQs.'}
              {selectedTpl?.id === 'agencia' && 'Pega aquí los servicios, precios, proceso de trabajo y FAQs.'}
              {selectedTpl?.id === 'retail' && 'Pega aquí el catálogo de productos con precios y FAQs.'}
              {selectedTpl?.id === 'general' && 'Pega aquí la información que el agente necesita para responder preguntas.'}
            </p>
            <Field label="Catálogo / precios / FAQs" name="knowledge_base" textarea rows={12}
              placeholder={selectedTpl?.kbPlaceholder} />
          </Section>
        </div>

        {/* Tab: Funciones */}
        <div className={formTab !== 'funciones' ? 'hidden' : 'flex flex-col gap-6'}>
          <Section title="Funcionalidades activas">
            <div className="flex flex-col gap-2">
              {(Object.keys(features) as (keyof AgentFeatures)[]).map(key => (
                <label key={key} className="flex items-center justify-between p-3 rounded-lg cursor-pointer"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <span className="text-sm" style={{ color: features[key] ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                    {FEATURE_LABELS[key]}
                  </span>
                  <button type="button" onClick={() => toggleFeature(key)}
                    className="w-10 h-5 rounded-full transition-colors relative"
                    style={{ background: features[key] ? '#6C3BFF' : 'var(--c-border-2)' }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: features[key] ? '1.25rem' : '0.125rem' }} />
                  </button>
                </label>
              ))}
            </div>
          </Section>
        </div>

        <button type="submit" disabled={saving}
          className="py-3 rounded-xl font-semibold text-sm transition-opacity"
          style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Creando agente…' : 'Crear agente'}
        </button>
      </form>
    </div>
  );
}

const FEATURE_SHORT: Record<keyof AgentFeatures, string> = {
  receptionist:            'Recepción',
  lead_qualification:      'Leads',
  appointment_booking:     'Citas',
  existing_client_support: 'Clientes',
  smart_transfer:          'Transferencia',
  order_taking:            'Pedidos',
  multilingual:            'Multiidioma',
  client_memory:           'Memoria',
  whatsapp_escalation:     'WhatsApp',
  outbound_calls:          'Salientes',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({ label, name, required, placeholder, textarea, rows, disabled, defaultValue, readOnly }: {
  label: string; name: string; required?: boolean; placeholder?: string;
  textarea?: boolean; rows?: number; disabled?: boolean; defaultValue?: string; readOnly?: boolean;
}) {
  const base = {
    background: readOnly ? 'var(--c-surface-2)' : 'var(--c-input-bg)',
    border: '1px solid var(--c-input-border)',
    borderRadius: 8, padding: '8px 12px', color: 'var(--c-text)',
    fontSize: 14, width: '100%', outline: 'none',
  };
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>
        {label}{required && <span style={{ color: '#9B6DFF' }}> *</span>}
      </label>
      {textarea
        ? <textarea name={name} rows={rows ?? 3} placeholder={placeholder} disabled={disabled}
            defaultValue={defaultValue}
            style={{ ...base, resize: 'vertical', opacity: disabled ? 0.4 : 1 }} />
        : <input name={name} required={required} placeholder={placeholder} disabled={disabled}
            defaultValue={defaultValue} readOnly={readOnly}
            style={{ ...base, opacity: disabled ? 0.4 : 1 }} />
      }
    </div>
  );
}
