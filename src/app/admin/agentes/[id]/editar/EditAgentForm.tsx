'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, RefreshCw, Check, MessageCircle, Phone, PhoneOutgoing, Clock } from 'lucide-react';
import VoiceSelector from '@/components/VoiceSelector';
import { PLAN_FEATURES, PLAN_LABELS, PLAN_MINUTES, FEATURE_LABELS } from '@/types/agent';
import type { Plan, AgentFeatures, VoiceAgent, BusinessHours, DaySchedule } from '@/types/agent';

const PLANS: Plan[] = ['comercial', 'pro'];
const PLAN_COLORS: Record<Plan, string> = {
  comercial: '#3b82f6', pro: '#a855f7',
};

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: 'monday',    label: 'Lunes' },
  { key: 'tuesday',   label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday',  label: 'Jueves' },
  { key: 'friday',    label: 'Viernes' },
  { key: 'saturday',  label: 'Sábado' },
  { key: 'sunday',    label: 'Domingo' },
];

const DEFAULT_HOURS: BusinessHours = {
  monday:    { open: true,  from: '09:00', to: '18:00' },
  tuesday:   { open: true,  from: '09:00', to: '18:00' },
  wednesday: { open: true,  from: '09:00', to: '18:00' },
  thursday:  { open: true,  from: '09:00', to: '18:00' },
  friday:    { open: true,  from: '09:00', to: '18:00' },
  saturday:  { open: false },
  sunday:    { open: false },
};

const INBOUND_FEATURES = (Object.keys(PLAN_FEATURES.pro) as (keyof AgentFeatures)[])
  .filter(k => k !== 'outbound_calls');

type Tab = 'info' | 'agente' | 'funciones' | 'contrato';
const TABS: { id: Tab; label: string }[] = [
  { id: 'info',      label: 'Información' },
  { id: 'agente',    label: 'Agente' },
  { id: 'funciones', label: 'Funciones' },
  { id: 'contrato',  label: 'Contrato' },
];

export default function EditAgentForm({ agent }: { agent: VoiceAgent }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialTab   = (searchParams.get('tab') as Tab | null) ?? 'info';

  const [saving, setSaving]               = useState(false);
  const [resyncing, setResyncing]         = useState(false);
  const [resyncOk, setResyncOk]           = useState(false);
  const [voiceId, setVoiceId]             = useState<string | null>((agent as any).elevenlabs_voice_id ?? null);
  const [tab, setTab]                     = useState<Tab>(initialTab);
  const [plan, setPlan]                   = useState<Plan>(agent.plan);
  const [features, setFeatures]           = useState<AgentFeatures>(agent.features);
  const [businessHours, setBusinessHours] = useState<BusinessHours>(agent.business_hours ?? DEFAULT_HOURS);
  const [hoursEnabled, setHoursEnabled]   = useState<boolean>(!!agent.business_hours);
  const [waActive, setWaActive]           = useState<boolean>(!!agent.wa_phone_number);

  const handlePlanChange = (p: Plan) => {
    setPlan(p);
    setFeatures(PLAN_FEATURES[p]);
  };

  const toggleFeature = (key: keyof AgentFeatures) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResyncWebsite = async () => {
    setResyncing(true);
    setResyncOk(false);
    const res = await fetch(`/api/admin/agentes/${agent.id}/resync-website`, { method: 'POST' });
    setResyncing(false);
    if (res.ok) { setResyncOk(true); setTimeout(() => setResyncOk(false), 4000); }
    else { const { error } = await res.json().catch(() => ({ error: 'Error' })); alert(error ?? 'No se pudo sincronizar'); }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      // Información general
      client_name:            fd.get('client_name'),
      client_email:           fd.get('client_email') || null,
      business_name:          fd.get('business_name'),
      business_description:   fd.get('business_description'),
      business_address:       fd.get('business_address'),
      business_website:       fd.get('business_website') || null,
      timezone:               fd.get('timezone') || 'America/Monterrey',
      phone_number:           fd.get('phone_number'),
      // Agente
      knowledge_base:         fd.get('knowledge_base'),
      agent_name:             plan === 'pro' ? fd.get('agent_name') : null,
      elevenlabs_voice_id:    voiceId ?? null,
      // Funciones — llamadas entrantes
      business_phone_display: fd.get('business_phone_display'),
      transfer_number:        fd.get('transfer_number'),
      transfer_whatsapp:      fd.get('transfer_whatsapp'),
      calendar_url:           fd.get('calendar_url'),
      // Funciones — plan, features, horarios
      plan,
      features,
      business_hours:         hoursEnabled ? businessHours : null,
      minutes_included:       PLAN_MINUTES[plan],
      // Funciones — WhatsApp
      wa_phone_number:        plan === 'pro' && waActive ? (agent.phone_number ?? null) : null,
      // Contrato
      contract_text:          (fd.get('contract_text') as string)?.trim() || null,
    };

    const res = await fetch(`/api/admin/agentes/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.push(`/admin/agentes/${agent.id}`);
      router.refresh();
    } else {
      alert('Error al guardar los cambios');
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/agentes/${agent.id}`} className="p-2 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors" style={{ color: 'var(--c-text-2)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Editar agente</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-2)' }}>{agent.business_name}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: tab === t.id ? '#6C3BFF' : 'transparent', color: tab === t.id ? '#fff' : 'var(--c-text-3)' }}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── Tab: Información ─────────────────────────────────────────── */}
        <div className={tab !== 'info' ? 'hidden' : 'flex flex-col gap-6'}>
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
            <Field label="Nombre del cliente (interno)" name="client_name" required defaultValue={agent.client_name} />
            <Field label="Email del cliente" name="client_email" placeholder="cliente@email.com" defaultValue={(agent as any).client_email ?? ''} />
          </Section>

          <Section title="Negocio">
            <Field label="Nombre del negocio" name="business_name" required defaultValue={agent.business_name} />
            <Field label="Descripción" name="business_description" textarea defaultValue={agent.business_description} />
            <Field label="Dirección" name="business_address" defaultValue={agent.business_address ?? ''} />
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>Sitio web</label>
              <div className="flex gap-2">
                <input name="business_website" placeholder="https://negocio.com" defaultValue={(agent as any).business_website ?? ''}
                  className="flex-1"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', borderRadius: 8, padding: '8px 12px', color: 'var(--c-text)', fontSize: 14, outline: 'none' }} />
                <button type="button" onClick={handleResyncWebsite} disabled={resyncing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80"
                  style={{
                    background: resyncOk ? 'rgba(34,197,94,0.1)' : 'rgba(108,59,255,0.08)',
                    color:      resyncOk ? '#16a34a' : '#9B6DFF',
                    border:     `1px solid ${resyncOk ? 'rgba(34,197,94,0.25)' : 'rgba(108,59,255,0.2)'}`,
                    opacity:    resyncing ? 0.5 : 1,
                  }}>
                  {resyncing ? <RefreshCw size={11} className="animate-spin" /> : resyncOk ? <Check size={11} /> : <RefreshCw size={11} />}
                  {resyncing ? 'Sincronizando…' : resyncOk ? 'Listo' : 'Sincronizar'}
                </button>
              </div>
            </div>
            <Field label="Zona horaria" name="timezone" defaultValue={agent.timezone} />
            <Field label="Número Vapi (Twilio)" name="phone_number" defaultValue={agent.phone_number} />
          </Section>
        </div>

        {/* ── Tab: Agente ──────────────────────────────────────────────── */}
        <div className={tab !== 'agente' ? 'hidden' : 'flex flex-col gap-6'}>
          <Section title="Identidad">
            <div className="p-3 rounded-lg" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                <span style={{ color: '#a855f7', fontWeight: 600 }}>Plan Pro:</span> puedes darle un nombre propio al agente. En Básico y Estándar siempre se llama <strong style={{ color: 'var(--c-text)' }}>Centinelia</strong>.
              </p>
            </div>
            <Field label="Nombre del agente" name="agent_name"
              placeholder="Ej: Sofía (solo Plan Pro)"
              defaultValue={agent.agent_name ?? ''}
              disabled={plan !== 'pro'} />
          </Section>

          <Section title="Voz">
            <p className="text-xs mb-1" style={{ color: 'var(--c-text-2)' }}>
              Elige la voz de ElevenLabs. Usa ▶ para escuchar una muestra antes de seleccionar.
            </p>
            <VoiceSelector selected={voiceId} onChange={setVoiceId} />
          </Section>

          <Section title="Base de conocimiento">
            <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
              Catálogo de productos, precios, servicios y preguntas frecuentes del negocio.
            </p>
            <Field label="Catálogo / precios / FAQs" name="knowledge_base" textarea rows={12}
              defaultValue={agent.knowledge_base ?? ''}
              placeholder={`SERVICIOS:\n- Ejemplo: $150\n\nFAQs:\n¿Aceptan tarjeta? Sí.`} />
          </Section>
        </div>

        {/* ── Tab: Funciones ───────────────────────────────────────────── */}
        <div className={tab !== 'funciones' ? 'hidden' : 'flex flex-col gap-6'}>

          {/* Llamadas entrantes */}
          <Section title={<span className="flex items-center gap-1.5"><Phone size={13} />Llamadas entrantes</span>}>
            {/* Feature toggles */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
              {INBOUND_FEATURES.map((key, i) => (
                <div key={key}
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
                  style={{
                    background:   'var(--c-surface)',
                    borderBottom: i < INBOUND_FEATURES.length - 1 ? '1px solid var(--c-border)' : undefined,
                  }}
                  onClick={() => toggleFeature(key)}>
                  <span className="text-sm" style={{ color: features[key] ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                    {FEATURE_LABELS[key]}
                  </span>
                  <Toggle on={features[key]} />
                </div>
              ))}
            </div>

            {/* Ajustes específicos */}
            <Field label="Teléfono que menciona el agente verbalmente" name="business_phone_display" defaultValue={agent.business_phone_display} />
            <Field label="Número de transferencia a humano" name="transfer_number" defaultValue={agent.transfer_number ?? ''} />
            <Field label="WhatsApp del dueño (notificaciones de leads)" name="transfer_whatsapp" defaultValue={agent.transfer_whatsapp ?? ''} />
            <Field label="Link de calendario (para agendar citas)" name="calendar_url" defaultValue={agent.calendar_url ?? ''} />
          </Section>

          {/* Llamadas salientes — solo Pro */}
          <Section title={<span className="flex items-center gap-1.5"><PhoneOutgoing size={13} />Llamadas salientes</span>}>
            <ProToggleRow
              label="Activar llamadas salientes"
              desc={features.outbound_calls ? 'El cliente puede subir contactos y disparar llamadas desde su portal' : 'Permite al cliente disparar llamadas programadas desde su portal'}
              isPro={plan === 'pro'}
              active={plan === 'pro' && features.outbound_calls}
              accentColor="#6C3BFF"
              onToggle={() => plan === 'pro' && toggleFeature('outbound_calls')}
            />
          </Section>

          {/* WhatsApp — solo Pro */}
          <Section title={<span className="flex items-center gap-1.5"><MessageCircle size={13} />WhatsApp</span>}>
            <ProToggleRow
              label="Activar WhatsApp"
              desc={waActive ? `Número activo: ${agent.phone_number}` : 'Usa el mismo número de voz para atender por WhatsApp'}
              isPro={plan === 'pro'}
              active={plan === 'pro' && waActive}
              accentColor="#25D366"
              onToggle={() => plan === 'pro' && setWaActive(v => !v)}
            />
          </Section>

          {/* Horarios */}
          <Section title={<span className="flex items-center gap-1.5"><Clock size={13} />Horarios de atención</span>}>
            <div className="flex items-center justify-between p-3 rounded-xl cursor-pointer select-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              onClick={() => setHoursEnabled(v => !v)}>
              <div>
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>Restringir horario</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>El agente solo contesta en el horario configurado</p>
              </div>
              <Toggle on={hoursEnabled} color="#6C3BFF" />
            </div>

            {hoursEnabled && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
                {DAYS.map(({ key, label }, i) => {
                  const s: DaySchedule = businessHours[key] ?? { open: false };
                  return (
                    <div key={key} className="flex items-center gap-3 px-3 py-2"
                      style={{
                        background:   'var(--c-surface)',
                        borderBottom: i < DAYS.length - 1 ? '1px solid var(--c-border)' : undefined,
                      }}>
                      <div className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer select-none"
                        onClick={() => setBusinessHours(h => ({ ...h, [key]: { ...s, open: !s.open } }))}>
                        <Toggle on={s.open} size="sm" color="#6C3BFF" />
                        <span className="text-xs" style={{ color: s.open ? 'var(--c-text)' : 'var(--c-text-3)' }}>{label}</span>
                      </div>
                      {s.open ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={s.from ?? '09:00'} maxLength={5} placeholder="09:00"
                            onChange={e => {
                              let v = e.target.value.replace(/\D/g, '');
                              if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                              setBusinessHours(h => ({ ...h, [key]: { ...s, from: v } }));
                            }}
                            className="rounded px-2 py-1 text-xs outline-none w-14 text-center"
                            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                          <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>–</span>
                          <input type="text" value={s.to ?? '18:00'} maxLength={5} placeholder="18:00"
                            onChange={e => {
                              let v = e.target.value.replace(/\D/g, '');
                              if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                              setBusinessHours(h => ({ ...h, [key]: { ...s, to: v } }));
                            }}
                            className="rounded px-2 py-1 text-xs outline-none w-14 text-center"
                            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* ── Tab: Contrato ────────────────────────────────────────────── */}
        <div className={tab !== 'contrato' ? 'hidden' : 'flex flex-col gap-6'}>
          <Section title="Texto del contrato">
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: 'var(--c-text-2)' }}>
              <strong style={{ color: '#9B6DFF' }}>Template automático activo.</strong> Si dejas este campo vacío, el contrato se genera automáticamente. Solo escribe aquí si necesitas personalizar para este cliente.
            </div>
            <Field
              label="Texto personalizado (opcional)"
              name="contract_text"
              textarea
              rows={16}
              placeholder={"Escribe el contrato personalizado aquí...\n\nSi lo dejas vacío se usa el template automático de Centinelia."}
              defaultValue={(agent as any).contract_text ?? ''}
            />
            {agent.portal_token && (
              <a href={`/portal/${agent.portal_token}/contrato`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs transition-opacity hover:opacity-80"
                style={{ color: '#9B6DFF' }}>
                <ExternalLink size={12} />
                Previsualizar contrato del cliente
              </a>
            )}
            {(agent as any).contract_accepted_at && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-xs"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', color: '#16a34a' }}>
                ✓ Firmado el {new Date((agent as any).contract_accepted_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
          </Section>
        </div>

        <button type="submit" disabled={saving}
          className="py-3 rounded-xl font-semibold text-sm transition-opacity"
          style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold mb-3 tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Toggle({ on, color = '#6C3BFF', size = 'md' }: { on: boolean; color?: string; size?: 'md' | 'sm' }) {
  const w  = size === 'sm' ? 28 : 36;
  const h  = size === 'sm' ? 14 : 18;
  const d  = size === 'sm' ? 10 : 14;
  const on_left  = size === 'sm' ? w - d - 2 : w - d - 2;
  const off_left = 2;
  return (
    <div className="rounded-full transition-colors relative flex-shrink-0"
      style={{ width: w, height: h, background: on ? color : 'var(--c-border-2)' }}>
      <span className="absolute rounded-full bg-white transition-all"
        style={{ width: d, height: d, top: 2, left: on ? on_left : off_left }} />
    </div>
  );
}

function ProToggleRow({ label, desc, isPro, active, accentColor, onToggle }: {
  label: string; desc: string; isPro: boolean; active: boolean; accentColor: string; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl cursor-pointer select-none"
      style={{
        background: active ? `${accentColor}0D` : 'var(--c-surface)',
        border:     `1px solid ${active ? `${accentColor}40` : 'var(--c-border)'}`,
        opacity:    !isPro ? 0.5 : 1,
        cursor:     !isPro ? 'not-allowed' : 'pointer',
      }}
      onClick={onToggle}>
      <div>
        <p className="text-sm" style={{ color: active ? 'var(--c-text)' : 'var(--c-text-3)' }}>
          {label}
          {!isPro && <span className="ml-2 text-xs" style={{ color: '#a855f7' }}>Solo Plan Pro</span>}
        </p>
        <p className="text-xs mt-0.5" style={{ color: active ? accentColor : 'var(--c-text-3)' }}>{desc}</p>
      </div>
      <Toggle on={active} color={accentColor} />
    </div>
  );
}

function Field({ label, name, required, placeholder, textarea, rows, defaultValue, disabled }: {
  label: string; name: string; required?: boolean; placeholder?: string;
  textarea?: boolean; rows?: number; defaultValue?: string; disabled?: boolean;
}) {
  const base = {
    background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)',
    borderRadius: 8, padding: '8px 12px', color: 'var(--c-text)',
    fontSize: 14, width: '100%', outline: 'none',
  };
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>
        {label}{required && <span style={{ color: '#9B6DFF' }}> *</span>}
      </label>
      {textarea
        ? <textarea name={name} rows={rows ?? 3} placeholder={placeholder} defaultValue={defaultValue} disabled={disabled} style={{ ...base, resize: 'vertical', opacity: disabled ? 0.4 : 1 }} />
        : <input name={name} required={required} placeholder={placeholder} defaultValue={defaultValue} disabled={disabled} style={{ ...base, opacity: disabled ? 0.4 : 1 }} />
      }
    </div>
  );
}
