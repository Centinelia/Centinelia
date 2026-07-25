'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UtensilsCrossed, Stethoscope, Sparkles, Briefcase, ShoppingBag, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FEATURE_LABELS } from '@/types/agent';
import type { AgentFeatures } from '@/types/agent';
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

const FEATURE_DESCRIPTIONS: Partial<Record<keyof AgentFeatures, string>> = {
  receptionist:            'Contesta llamadas, da información del negocio y horarios',
  lead_qualification:      'Pregunta por nombre, contacto e interés del llamante',
  appointment_booking:     'Agenda citas o reservaciones y las registra',
  existing_client_support: 'Atiende a clientes que ya conocen el negocio',
  smart_transfer:          'Transfiere la llamada a un humano cuando es necesario',
  order_taking:            'Toma pedidos de productos o platillos',
  multilingual:            'Responde en inglés además de español',
  client_memory:           'Recuerda información de llamadas anteriores del mismo número',
  outbound_calls:          'Permite disparar llamadas salientes desde el portal del cliente',
};

const VOICE_FEATURE_KEYS: (keyof AgentFeatures)[] = [
  'receptionist', 'lead_qualification', 'appointment_booking',
  'existing_client_support', 'smart_transfer', 'order_taking',
  'multilingual', 'client_memory',
];

const KB_LABELS: Record<GiroTemplate, string> = {
  restaurante: 'Menú, horarios y preguntas frecuentes',
  consultorio: 'Servicios, médicos, precios y FAQs',
  estetica:    'Catálogo de servicios, precios y FAQs',
  agencia:     'Servicios, proceso de trabajo y FAQs',
  retail:      'Catálogo de productos, precios y FAQs',
  general:     'Información del negocio',
};

const FEATURE_SHORT: Record<keyof AgentFeatures, string> = {
  receptionist:            'Recepción',
  lead_qualification:      'Leads',
  appointment_booking:     'Citas',
  existing_client_support: 'Clientes',
  smart_transfer:          'Transferencia',
  order_taking:            'Pedidos',
  multilingual:            'Multiidioma',
  client_memory:           'Memoria',
  outbound_calls:          'Salientes',
  vertical:                '',
  helpdesk:                'Helpdesk',
  is_coordinator:          'Coordinador',
  meerkat_role_id:         '',
  lite_prompt:             '',
  skip_aup:                '',
  skip_recording_notice:   '',
  of_encuestas:            '',
  civic_reports:           '',
  contract_drafts:         '',
};

const DEFAULT_FEATURES: AgentFeatures = {
  receptionist: true, lead_qualification: false, appointment_booking: false,
  existing_client_support: false, smart_transfer: false, order_taking: false,
  multilingual: false, client_memory: false, outbound_calls: false,
  vertical: undefined, helpdesk: false, is_coordinator: false, meerkat_role_id: '',
  lite_prompt: false, skip_aup: false, skip_recording_notice: false,
  of_encuestas: false, civic_reports: false, contract_drafts: false,
};

export default function NuevoEmpleadoPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const prefillClientName  = searchParams.get('client_name')  ?? '';
  const prefillClientEmail = searchParams.get('client_email') ?? '';
  const prefillPortalEmail = searchParams.get('portal_email') ?? '';
  const isExistingClient   = !!prefillPortalEmail;

  const [saving, setSaving]     = useState(false);
  const [template, setTemplate] = useState<GiroTemplate | null>(null);
  const [features, setFeatures] = useState<AgentFeatures>(DEFAULT_FEATURES);
  const [formTab, setFormTab]   = useState<'negocio' | 'empleado' | 'funciones'>('negocio');
  const [errors, setErrors]     = useState<string[]>([]);

  const selectedTpl = AGENT_TEMPLATES.find(t => t.id === template);

  const handleTemplateSelect = (id: GiroTemplate) => {
    const tpl = AGENT_TEMPLATES.find(t => t.id === id)!;
    setTemplate(id);
    setFeatures(prev => ({ ...prev, ...tpl.features }));
  };

  const toggleFeature = (key: keyof AgentFeatures) => {
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
      setFormTab('negocio');
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
      agent_name:             fd.get('agent_name') || null,
      giro_template:          template,
      features,
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
      alert(error ?? 'Error al crear el empleado');
      setSaving(false);
    }
  };

  // ── Step 1: template selection ────────────────────────────────────────────────
  if (!template) {
    return (
      <div className="p-4 md:p-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--c-text)' }}>Nuevo empleado</h1>
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
  type Tab = 'negocio' | 'empleado' | 'funciones';
  const FORM_TABS: { id: Tab; label: string }[] = [
    { id: 'negocio',   label: 'Negocio' },
    { id: 'empleado',  label: 'Empleado' },
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

        {/* ── Tab: Negocio ───────────────────────────────────────────────────── */}
        <div className={formTab !== 'negocio' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Cliente">
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

          <Section title="Negocio">
            <Field label="Nombre del negocio" name="business_name" required
              placeholder="Ej: Restaurante El Rincón" />
            <Field label="Descripción" name="business_description" textarea
              placeholder={selectedTpl?.description ? `Ej: ${selectedTpl.description} en Monterrey NL` : undefined} />
            <Field label="Dirección" name="business_address" />
            <Field label="Teléfono que menciona el empleado" name="business_phone_display"
              placeholder="+52 81 1234 5678" />
            <Field label="Número de transferencia a humano" name="transfer_number"
              placeholder="+52 81 1234 5678"
              helper="Si el caller pide hablar con una persona, el empleado transfiere a este número." />
            <Field label="WhatsApp del dueño (notificaciones de leads)" name="transfer_whatsapp"
              placeholder="+52 81 1234 5678" />
            {selectedTpl?.features.appointment_booking && (
              <Field label={`Link de calendario para ${selectedTpl.appointmentLabel}s`}
                name="calendar_url" placeholder="https://calendly.com/..." />
            )}
            <Field label="Sitio web" name="business_website" placeholder="https://negocio.com" />
            <TimezoneSelect />
            <Field label="Número de teléfono (Centinelia)" name="phone_number"
              placeholder="+19284158163"
              helper="Número asignado en Vapi que recibirá las llamadas entrantes." />
          </Section>
        </div>

        {/* ── Tab: Empleado ──────────────────────────────────────────────────── */}
        <div className={formTab !== 'empleado' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Identidad">
            <Field label="Nombre del empleado" name="agent_name"
              placeholder="Ej: Sofía, Carlos, Luna…"
              helper="Nombre con el que se presentará en llamadas y en el portal." />
          </Section>

          <Section title="Base de conocimiento del negocio">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              {selectedTpl?.id === 'restaurante' && 'Pega aquí el menú completo con precios, horarios y preguntas frecuentes.'}
              {selectedTpl?.id === 'consultorio' && 'Pega aquí los servicios, médicos disponibles, precios y preguntas frecuentes.'}
              {selectedTpl?.id === 'estetica'    && 'Pega aquí el catálogo de servicios con precios y preguntas frecuentes.'}
              {selectedTpl?.id === 'agencia'     && 'Pega aquí los servicios, proceso de trabajo y preguntas frecuentes.'}
              {selectedTpl?.id === 'retail'      && 'Pega aquí el catálogo de productos con precios y preguntas frecuentes.'}
              {selectedTpl?.id === 'general'     && 'Pega aquí toda la información que el empleado necesita para responder preguntas.'}
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

          <Section title="Llamadas entrantes">
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
              {VOICE_FEATURE_KEYS.map((key, i) => {
                const on = features[key] as boolean;
                return (
                  <div key={key}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => toggleFeature(key)}
                    style={{
                      background: 'var(--c-surface)',
                      borderBottom: i < VOICE_FEATURE_KEYS.length - 1 ? '1px solid var(--c-border)' : undefined,
                    }}>
                    <div className="w-9 h-5 rounded-full transition-colors relative flex-shrink-0 mt-0.5"
                      style={{ background: on ? '#6C3BFF' : 'var(--c-border-2)' }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: on ? '1.125rem' : '0.125rem' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: on ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                        {FEATURE_LABELS[key]}
                      </p>
                      {FEATURE_DESCRIPTIONS[key] && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Llamadas salientes">
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
              {(['outbound_calls'] as (keyof AgentFeatures)[]).map((key) => {
                const on = features[key] as boolean;
                return (
                  <div key={key}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => toggleFeature(key)}
                    style={{ background: 'var(--c-surface)' }}>
                    <div className="w-9 h-5 rounded-full transition-colors relative flex-shrink-0 mt-0.5"
                      style={{ background: on ? '#6C3BFF' : 'var(--c-border-2)' }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: on ? '1.125rem' : '0.125rem' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: on ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                        {FEATURE_LABELS[key]}
                      </p>
                      {FEATURE_DESCRIPTIONS[key] && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                      )}
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
          {saving ? 'Creando empleado…' : 'Crear empleado'}
        </button>
      </form>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
