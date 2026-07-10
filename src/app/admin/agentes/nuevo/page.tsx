'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UtensilsCrossed, Stethoscope, Sparkles, Briefcase, ShoppingBag, Building2, Check, Lock } from 'lucide-react';
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
  comercial: '#6C3BFF', pro: '#a855f7',
};

const MEXICO_TIMEZONES = [
  { value: 'America/Monterrey',   label: 'Monterrey / Noreste' },
  { value: 'America/Mexico_City', label: 'Ciudad de México / Centro' },
  { value: 'America/Tijuana',     label: 'Tijuana / Baja California' },
  { value: 'America/Hermosillo',  label: 'Hermosillo / Sonora' },
  { value: 'America/Chihuahua',   label: 'Chihuahua / Montaña' },
  { value: 'America/Mazatlan',    label: 'Mazatlán / Sinaloa' },
  { value: 'America/Merida',      label: 'Mérida / Sureste' },
  { value: 'America/Cancun',      label: 'Cancún / Quintana Roo' },
];

const FEATURE_DESCRIPTIONS: Record<keyof AgentFeatures, string> = {
  receptionist:            'Contesta llamadas, da información del negocio y horarios',
  lead_qualification:      'Pregunta por nombre, contacto e interés del llamante',
  appointment_booking:     'Agenda citas o reservaciones y las registra',
  existing_client_support: 'Atiende a clientes que ya conocen el negocio',
  smart_transfer:          'Transfiere la llamada a un humano cuando es necesario',
  order_taking:            'Toma pedidos de productos o platillos',
  multilingual:            'Responde en inglés además de español',
  client_memory:           'Recuerda información de llamadas anteriores del mismo número',
  whatsapp_escalation:     'Envía un WhatsApp al dueño si el agente no puede resolver',
  outbound_calls:          'Permite disparar llamadas salientes desde el portal del cliente',
};

const KB_LABELS: Record<GiroTemplate, string> = {
  restaurante: 'Menú, horarios y preguntas frecuentes',
  consultorio: 'Servicios, médicos, precios y FAQs',
  estetica:    'Catálogo de servicios, precios y FAQs',
  agencia:     'Servicios, proceso de trabajo y FAQs',
  retail:      'Catálogo de productos, precios y FAQs',
  general:     'Información del negocio',
};

export default function NuevoAgentePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const prefillClientName  = searchParams.get('client_name')  ?? '';
  const prefillClientEmail = searchParams.get('client_email') ?? '';
  const prefillPortalEmail = searchParams.get('portal_email') ?? '';
  const isExistingClient   = !!prefillPortalEmail;

  const [saving, setSaving]     = useState(false);
  const [template, setTemplate] = useState<GiroTemplate | null>(null);
  const [plan, setPlan]         = useState<Plan>('comercial');
  const [features, setFeatures] = useState<AgentFeatures>(PLAN_FEATURES.comercial);
  const [formTab, setFormTab]   = useState<'info' | 'agente' | 'funciones'>('info');
  const [errors, setErrors]     = useState<string[]>([]);

  const selectedTpl = AGENT_TEMPLATES.find(t => t.id === template);

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
    const isBase  = PLAN_FEATURES.comercial[key];
    const isProOnly = !PLAN_FEATURES.comercial[key];
    if (isBase || (isProOnly && plan === 'comercial')) return;
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const missing: string[] = [];
    if (!fd.get('client_name'))   missing.push('Nombre del cliente');
    if (!fd.get('business_name')) missing.push('Nombre del negocio');
    if (missing.length > 0) {
      setErrors(missing);
      setFormTab('info');
      return;
    }
    setErrors([]);
    setSaving(true);

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
      minutes_included:       PLAN_MINUTES[plan],
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
      const { error } = await res.json().catch(() => ({ error: null }));
      alert(error ?? 'Error al crear el agente');
      setSaving(false);
    }
  };

  // ── Step 1: template selection ────────────────────────────────────────────────
  if (!template) {
    return (
      <div className="p-4 md:p-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--c-text)' }}>Nuevo agente</h1>
        {isExistingClient ? (
          <div className="mb-6 px-4 py-3 rounded-xl text-sm flex flex-wrap items-center gap-2"
            style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.2)', color: '#9B6DFF' }}>
            Nueva empresa para <strong style={{ color: 'var(--c-text)' }}>{prefillClientName}</strong>
            <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>· acceso portal heredado automáticamente</span>
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
                className="p-4 sm:p-5 rounded-xl text-left transition-all hover:scale-[1.02]"
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
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 2: full form (tabbed) ────────────────────────────────────────────────
  type Tab = 'info' | 'agente' | 'funciones';
  const FORM_TABS: { id: Tab; label: string }[] = [
    { id: 'info',      label: 'Información' },
    { id: 'agente',    label: 'Agente' },
    { id: 'funciones', label: 'Funciones' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setTemplate(null)}
          className="text-xs px-3 py-2 rounded-lg transition-colors flex-shrink-0"
          style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
        >
          ← Cambiar
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {selectedTpl && (() => {
            const TplIcon = TEMPLATE_ICONS[selectedTpl.id];
            return (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.1)' }}>
                <TplIcon size={16} style={{ color: '#9B6DFF' }} />
              </div>
            );
          })()}
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate" style={{ color: 'var(--c-text)' }}>{selectedTpl?.label}</h1>
            <p className="text-xs truncate" style={{ color: 'var(--c-text-2)' }}>{selectedTpl?.description}</p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {errors.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
          Completa los campos requeridos: <strong>{errors.join(', ')}</strong>
        </div>
      )}

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {FORM_TABS.map(t => (
          <button key={t.id} type="button" onClick={() => { setFormTab(t.id as Tab); setErrors([]); }}
            className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: formTab === t.id ? '#6C3BFF' : 'transparent',
              color: formTab === t.id ? '#fff' : 'var(--c-text-3)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── Tab: Información ───────────────────────────────────────────────── */}
        <div className={formTab !== 'info' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Plan">
            <div className="grid grid-cols-2 gap-3">
              {PLANS.map(p => (
                <button key={p} type="button" onClick={() => handlePlanChange(p)}
                  className="p-3 sm:p-4 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: plan === p ? PLAN_COLORS[p] : 'var(--c-border)',
                    background:  plan === p ? `${PLAN_COLORS[p]}15` : 'var(--c-surface)',
                  }}>
                  <div className="font-semibold text-sm" style={{ color: plan === p ? PLAN_COLORS[p] : 'var(--c-text)' }}>
                    {PLAN_LABELS[p]}
                  </div>
                  <div className="text-xs mt-1 leading-snug" style={{ color: 'var(--c-text-3)' }}>
                    {p === 'comercial' ? 'Funciones base · agente Centinelia' : 'Todas las funciones · nombre propio'}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Datos del cliente">
            {isExistingClient && (
              <div className="px-3 py-2 rounded-lg text-xs"
                style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: 'var(--c-text-3)' }}>
                Cliente existente · campos bloqueados
              </div>
            )}
            <Field label="Nombre del cliente" name="client_name" required
              defaultValue={prefillClientName} readOnly={isExistingClient} />
            <Field label="Email del cliente" name="client_email" placeholder="cliente@email.com"
              defaultValue={prefillClientEmail} readOnly={isExistingClient} />
          </Section>

          <Section title="Información del negocio">
            <Field label="Nombre del negocio" name="business_name" required
              placeholder="Ej: Restaurante El Rincón" />
            <Field label="Descripción del negocio" name="business_description" textarea
              placeholder={selectedTpl?.description ? `Ej: ${selectedTpl.description} en Monterrey NL` : undefined} />
            <Field label="Dirección" name="business_address" />
            <Field label="Teléfono que menciona el agente" name="business_phone_display"
              placeholder="+52 81 1234 5678" />
            <Field label="Número de transferencia a humano" name="transfer_number"
              placeholder="+52 81 1234 5678"
              helper="Si el caller pide hablar con una persona, el agente transfiere a este número." />
            <Field label="WhatsApp del dueño (notificaciones de leads)" name="transfer_whatsapp"
              placeholder="+52 81 1234 5678" />
            {selectedTpl?.features.appointment_booking && (
              <Field label={`Link de calendario para ${selectedTpl.appointmentLabel}s`}
                name="calendar_url" placeholder="https://calendly.com/..." />
            )}
            <Field label="Sitio web del negocio" name="business_website" placeholder="https://negocio.com" />
            <TimezoneSelect />
            <Field label="Número de teléfono del agente" name="phone_number"
              placeholder="+19284158163"
              helper="Número asignado en Vapi que recibirá las llamadas entrantes." />
          </Section>
        </div>

        {/* ── Tab: Agente ────────────────────────────────────────────────────── */}
        <div className={formTab !== 'agente' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Identidad del agente">
            <div className="p-3 rounded-lg leading-relaxed"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                En <strong style={{ color: 'var(--c-text)' }}>Agente Comercial</strong> el agente
                siempre se llama <strong style={{ color: 'var(--c-text)' }}>Centinelia</strong>.
                Con <span style={{ color: '#a855f7', fontWeight: 600 }}>Ejecutivo Senior</span> puedes
                asignarle un nombre personalizado.
              </p>
            </div>
            <Field label="Nombre del agente" name="agent_name"
              placeholder={plan === 'pro' ? 'Ej: Sofía, Carlos, Luna…' : 'Disponible en Ejecutivo Senior'}
              disabled={plan !== 'pro'} />
          </Section>

          <Section title="Base de conocimiento">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              {selectedTpl?.id === 'restaurante' && 'Pega aquí el menú completo con precios, horarios y preguntas frecuentes.'}
              {selectedTpl?.id === 'consultorio' && 'Pega aquí los servicios, médicos disponibles, precios y preguntas frecuentes.'}
              {selectedTpl?.id === 'estetica'    && 'Pega aquí el catálogo de servicios con precios y preguntas frecuentes.'}
              {selectedTpl?.id === 'agencia'     && 'Pega aquí los servicios, proceso de trabajo y preguntas frecuentes.'}
              {selectedTpl?.id === 'retail'      && 'Pega aquí el catálogo de productos con precios y preguntas frecuentes.'}
              {selectedTpl?.id === 'general'     && 'Pega aquí toda la información que el agente necesita para responder preguntas.'}
            </p>
            <Field
              label={selectedTpl ? KB_LABELS[selectedTpl.id] : 'Base de conocimiento'}
              name="knowledge_base" textarea rows={12}
              placeholder={selectedTpl?.kbPlaceholder}
            />
          </Section>
        </div>

        {/* ── Tab: Funciones ─────────────────────────────────────────────────── */}
        <div className={formTab !== 'funciones' ? 'hidden' : 'flex flex-col gap-5'}>

          {/* Base features — always on, no toggle */}
          <Section title="Siempre incluidas">
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(108,59,255,0.2)' }}>
              {BASE_FEATURE_KEYS.map((key, i) => (
                <div key={key}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{
                    background: 'var(--c-surface)',
                    borderBottom: i < BASE_FEATURE_KEYS.length - 1 ? '1px solid rgba(108,59,255,0.1)' : undefined,
                  }}>
                  <Check size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#6C3BFF' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{FEATURE_LABELS[key]}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Pro-only features */}
          <Section title={plan === 'pro' ? 'Funciones adicionales' : 'Funciones Pro'}>
            {plan === 'comercial' && (
              <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                Disponibles al cambiar a <span style={{ color: '#a855f7', fontWeight: 600 }}>Ejecutivo Senior</span>.
              </p>
            )}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${plan === 'pro' ? 'var(--c-border)' : 'rgba(168,85,247,0.15)'}` }}>
              {PRO_FEATURE_KEYS.map((key, i) => {
                const on = features[key];
                return (
                  <div key={key}
                    className={`flex items-start gap-3 px-4 py-3 ${plan === 'pro' ? 'cursor-pointer' : ''}`}
                    onClick={() => plan === 'pro' && toggleFeature(key)}
                    style={{
                      background: 'var(--c-surface)',
                      borderBottom: i < PRO_FEATURE_KEYS.length - 1 ? '1px solid var(--c-border)' : undefined,
                      opacity: plan === 'comercial' ? 0.45 : 1,
                    }}>
                    {plan === 'comercial' ? (
                      <Lock size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#a855f7' }} />
                    ) : (
                      <div className="w-9 h-5 rounded-full transition-colors relative flex-shrink-0 mt-0.5"
                        style={{ background: on ? '#6C3BFF' : 'var(--c-border-2)' }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                          style={{ left: on ? '1.125rem' : '0.125rem' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: plan === 'pro' && on ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                        {FEATURE_LABELS[key]}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
          style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Creando agente…' : 'Crear agente'}
        </button>
      </form>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_FEATURE_KEYS = (Object.keys(PLAN_FEATURES.comercial) as (keyof AgentFeatures)[])
  .filter(k => PLAN_FEATURES.comercial[k]);

const PRO_FEATURE_KEYS = (Object.keys(PLAN_FEATURES.comercial) as (keyof AgentFeatures)[])
  .filter(k => !PLAN_FEATURES.comercial[k]);

// ── Sub-components ────────────────────────────────────────────────────────────

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

function TimezoneSelect() {
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>Zona horaria</label>
      <select
        name="timezone"
        defaultValue="America/Monterrey"
        style={{
          background: 'var(--c-input-bg)',
          border: '1px solid var(--c-input-border)',
          borderRadius: 8,
          padding: '8px 12px',
          color: 'var(--c-text)',
          fontSize: 14,
          width: '100%',
          outline: 'none',
          colorScheme: 'dark',
        }}
      >
        {MEXICO_TIMEZONES.map(tz => (
          <option key={tz.value} value={tz.value}>{tz.label}</option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold mb-3 tracking-widest uppercase"
        style={{ color: 'var(--c-text-3)' }}>{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({ label, name, required, placeholder, textarea, rows, disabled, defaultValue, readOnly, helper }: {
  label: string; name: string; required?: boolean; placeholder?: string;
  textarea?: boolean; rows?: number; disabled?: boolean; defaultValue?: string;
  readOnly?: boolean; helper?: string;
}) {
  const base: React.CSSProperties = {
    background: readOnly ? 'var(--c-surface-2)' : disabled ? 'var(--c-surface)' : 'var(--c-input-bg)',
    border: '1px solid var(--c-input-border)',
    borderRadius: 8,
    padding: '10px 12px',
    color: 'var(--c-text)',
    fontSize: 14,
    width: '100%',
    outline: 'none',
    opacity: disabled ? 0.45 : 1,
  };
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>
        {label}{required && <span style={{ color: '#9B6DFF' }}> *</span>}
      </label>
      {textarea
        ? <textarea name={name} rows={rows ?? 3} placeholder={placeholder} disabled={disabled}
            defaultValue={defaultValue}
            style={{ ...base, resize: 'vertical' }} />
        : <input name={name} required={required} placeholder={placeholder} disabled={disabled}
            defaultValue={defaultValue} readOnly={readOnly}
            style={base} />
      }
      {helper && (
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>{helper}</p>
      )}
    </div>
  );
}
