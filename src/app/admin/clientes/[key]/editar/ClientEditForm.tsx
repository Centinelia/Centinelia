'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Check, RefreshCw, User as UserIcon, Briefcase, MapPin,
  Building2, ChevronDown, Globe,
} from 'lucide-react';
import type { VoiceAgent, BusinessHours, DaySchedule } from '@/types/agent';

// ── Constants ─────────────────────────────────────────────────────────────────

const MEXICO_TIMEZONES = [
  { value: 'America/Monterrey',   label: 'Monterrey / Noreste' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico / Centro' },
  { value: 'America/Tijuana',     label: 'Tijuana / Baja California' },
  { value: 'America/Hermosillo',  label: 'Hermosillo / Sonora' },
  { value: 'America/Chihuahua',   label: 'Chihuahua / Montana' },
  { value: 'America/Mazatlan',    label: 'Mazatlan / Sinaloa' },
  { value: 'America/Merida',      label: 'Merida / Sureste' },
  { value: 'America/Cancun',      label: 'Cancun / Quintana Roo' },
];

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: 'monday',    label: 'Lunes'     },
  { key: 'tuesday',   label: 'Martes'    },
  { key: 'wednesday', label: 'Miercoles' },
  { key: 'thursday',  label: 'Jueves'    },
  { key: 'friday',    label: 'Viernes'   },
  { key: 'saturday',  label: 'Sabado'    },
  { key: 'sunday',    label: 'Domingo'   },
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

interface Props {
  routeKey:           string;
  agents:             VoiceAgent[];
  orgBusinessWebsite: string | null;
  orgBusinessHours:   BusinessHours | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClientEditForm({
  routeKey, agents, orgBusinessWebsite, orgBusinessHours,
}: Props) {
  const router  = useRouter();
  const primary = agents[0];

  const [saving,   setSaving]   = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Contacto
  const [clientName,  setClientName]  = useState(primary.client_name  ?? '');
  const [clientEmail, setClientEmail] = useState(primary.client_email ?? '');

  // Vertical
  const [vertical, setVertical] = useState<'negocio' | 'gobierno'>(
    (primary.features?.vertical as 'negocio' | 'gobierno') ?? 'negocio'
  );

  // Negocio (compartido: aplica a todos los empleados del cliente)
  const [businessName,        setBusinessName]        = useState(primary.business_name ?? '');
  const [businessDescription, setBusinessDescription] = useState(
    ((primary as unknown as { business_description?: string }).business_description) ?? ''
  );
  const [businessWebsite,     setBusinessWebsite]     = useState(orgBusinessWebsite ?? '');
  const [businessPhoneDisplay,setBusinessPhoneDisplay]= useState(primary.business_phone_display ?? '');
  const [calendarUrl,         setCalendarUrl]         = useState(primary.calendar_url ?? '');

  // Ubicacion y horario
  const [timezone,        setTimezone]        = useState(primary.timezone ?? 'America/Monterrey');
  const [tzOpen,          setTzOpen]          = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);
  const [businessAddress, setBusinessAddress] = useState(primary.business_address ?? '');
  const [hoursEnabled,    setHoursEnabled]    = useState(!!orgBusinessHours);
  const [businessHours,   setBusinessHours]   = useState<BusinessHours>(orgBusinessHours ?? DEFAULT_HOURS);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) setTzOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayName = clientName.trim() || 'Sin nombre';

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg(null);
    const body: Record<string, unknown> = {
      client_name:            clientName.trim(),
      client_email:           clientEmail.trim(),
      vertical,
      business_name:          businessName.trim(),
      business_description:   businessDescription.trim() || null,
      business_website:       businessWebsite.trim()     || null,
      business_phone_display: businessPhoneDisplay.trim(),
      calendar_url:           calendarUrl.trim() || null,
      timezone,
      business_address:       businessAddress.trim(),
      business_hours:         hoursEnabled ? businessHours : null,
    };

    const res = await fetch(`/api/admin/clientes/${routeKey}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      setSavedMsg(`Guardado. ${j.updated ?? agents.length} empleado(s) actualizados.`);
      router.refresh();
      setTimeout(() => setSavedMsg(null), 3500);
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Error' }));
      setSavedMsg(`Error: ${error ?? 'no se pudo guardar'}`);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">

      {/* Back link */}
      <div className="mb-3">
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80"
          style={{ color: '#6B7280' }}
        >
          <ArrowLeft size={14} /> Clientes
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>
          Editar cliente
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          {displayName} · {agents.length} empleado{agents.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex flex-col gap-6">

        <Card title="Contacto" icon={<UserIcon size={13} />}
              subtitle="Datos comerciales del cliente. Aplica a todos sus empleados.">
          <FieldInput
            label="Nombre del contacto"
            value={clientName}
            onChange={setClientName}
            placeholder="Nombre completo"
          />
          <FieldInput
            label="Email del cliente"
            value={clientEmail}
            onChange={setClientEmail}
            placeholder="cliente@negocio.com"
            helper="Para reportes y avisos. El acceso al portal se administra desde la lista de Clientes."
          />
        </Card>

        <Card title="Vertical" icon={<Briefcase size={13} />}
              subtitle="Define que secciones de la Oficina se muestran a este cliente.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { value: 'negocio',  label: 'Negocio',  desc: 'Empresas, comercios, servicios'       },
              { value: 'gobierno', label: 'Gobierno', desc: 'Municipios, dependencias, H. Cabildo' },
            ] as const).map(opt => {
              const active = vertical === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVertical(opt.value)}
                  className="flex flex-col gap-0.5 px-4 py-3 rounded-lg text-left transition-all"
                  style={{
                    background: active ? '#F3F0FF' : '#FFFFFF',
                    border:     active ? '1px solid #6C3BFF' : '1px solid #E5E7EB',
                    color:      active ? '#4C1D95' : '#111827',
                  }}
                >
                  <span className="text-[13px] font-semibold">{opt.label}</span>
                  <span className="text-[12px]" style={{ color: active ? '#7C3AED' : '#6B7280' }}>{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Negocio" icon={<Building2 size={13} />}
              subtitle="Info de la empresa del cliente. Aplica a todos sus empleados.">
          <FieldInput
            label="Nombre del negocio"
            value={businessName}
            onChange={setBusinessName}
            placeholder="Ferreteria Los Amigos"
          />
          <FieldInput
            label="Descripcion"
            value={businessDescription}
            onChange={setBusinessDescription}
            textarea
            rows={3}
            placeholder="A que se dedica el negocio, tono y datos que el empleado debe mencionar"
          />
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
              <span className="inline-flex items-center gap-1"><Globe size={11} /> Sitio web</span>
            </label>
            <input
              value={businessWebsite}
              onChange={e => setBusinessWebsite(e.target.value)}
              placeholder="https://negocio.com"
              className="w-full text-[13px] px-3 py-2 outline-none transition-colors focus:border-[#6C3BFF] rounded-lg"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
            />
          </div>
          <FieldInput
            label="Numero que menciona el empleado en llamada"
            value={businessPhoneDisplay}
            onChange={setBusinessPhoneDisplay}
            placeholder="+52 81 1234 5678"
            helper="El numero que el empleado le dicta al cliente si lo pide. No es el numero de entrada de Vapi."
          />
          <FieldInput
            label="Link de calendario"
            value={calendarUrl}
            onChange={setCalendarUrl}
            placeholder="https://cal.com/..."
            helper="Calendly, Google Cal u otro link para agendar citas."
          />
        </Card>

        <Card title="Ubicacion y horario" icon={<MapPin size={13} />}
              subtitle="Zona horaria y horario de atencion del cliente.">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
              Zona horaria
            </label>
            <div className="relative" ref={tzRef}>
              <button
                type="button"
                onClick={() => setTzOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors focus:border-[#6C3BFF]"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
              >
                <span>{MEXICO_TIMEZONES.find(tz => tz.value === timezone)?.label ?? timezone}</span>
                <ChevronDown size={14} style={{ color: '#6B7280', flexShrink: 0 }} />
              </button>
              {tzOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                >
                  {MEXICO_TIMEZONES.map(tz => (
                    <button
                      key={tz.value}
                      type="button"
                      onClick={() => { setTimezone(tz.value); setTzOpen(false); }}
                      className="w-full text-left px-4 py-2 text-[13px] transition-colors hover:bg-gray-50"
                      style={{
                        color:      timezone === tz.value ? '#6C3BFF' : '#374151',
                        background: timezone === tz.value ? '#F3F0FF' : 'transparent',
                        fontWeight: timezone === tz.value ? 500 : 400,
                      }}
                    >
                      {tz.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <FieldInput
            label="Direccion del negocio"
            value={businessAddress}
            onChange={setBusinessAddress}
            placeholder="Calle, numero, colonia, ciudad"
          />

          <div
            className="flex items-center justify-between p-3 rounded-lg cursor-pointer select-none transition-colors hover:bg-gray-50 mt-1"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
            onClick={() => setHoursEnabled(v => !v)}
          >
            <div>
              <p className="text-[13px] font-medium" style={{ color: '#111827' }}>Horario definido</p>
              <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
                Los empleados solo contestan en el horario configurado
              </p>
            </div>
            <Toggle on={hoursEnabled} />
          </div>

          {hoursEnabled && (
            <div className="rounded-lg overflow-hidden mt-1" style={{ border: '1px solid #E5E7EB' }}>
              {DAYS.map(({ key, label }, i) => {
                const s: DaySchedule = businessHours[key] ?? { open: false };
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{ background: '#FFFFFF', borderTop: i > 0 ? '1px solid #F3F4F6' : undefined }}
                  >
                    <div
                      className="flex items-center gap-2 w-32 flex-shrink-0 cursor-pointer select-none"
                      onClick={() => setBusinessHours(h => ({ ...h, [key]: { ...s, open: !s.open } }))}
                    >
                      <Toggle on={s.open} size="sm" />
                      <span className="text-[13px]" style={{ color: s.open ? '#111827' : '#9CA3AF' }}>{label}</span>
                    </div>
                    {s.open ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={5}
                          placeholder="09:00"
                          value={s.from ?? '09:00'}
                          onChange={e => {
                            let v = e.target.value.replace(/\D/g, '');
                            if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                            setBusinessHours(h => ({ ...h, [key]: { ...s, from: v } }));
                          }}
                          className="rounded-md px-2 py-1 text-[13px] outline-none w-16 text-center tabular-nums"
                          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
                        />
                        <span className="text-[13px]" style={{ color: '#9CA3AF' }}>a</span>
                        <input
                          type="text"
                          maxLength={5}
                          placeholder="18:00"
                          value={s.to ?? '18:00'}
                          onChange={e => {
                            let v = e.target.value.replace(/\D/g, '');
                            if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                            setBusinessHours(h => ({ ...h, [key]: { ...s, to: v } }));
                          }}
                          className="rounded-md px-2 py-1 text-[13px] outline-none w-16 text-center tabular-nums"
                          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
                        />
                      </div>
                    ) : (
                      <span className="text-[12px]" style={{ color: '#9CA3AF' }}>Cerrado</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Botones al final del formulario, no sticky (no estorban al llenar campos abajo) */}
        <div
          className="flex items-center justify-end gap-2 pt-4 mt-2"
          style={{ borderTop: '1px solid #E5E7EB' }}
        >
          {savedMsg && (
            <span
              className="text-[12px] mr-2"
              style={{ color: savedMsg.startsWith('Error') ? '#EF4444' : '#10B981' }}
            >
              {savedMsg}
            </span>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-opacity"
            style={{ background: '#6C3BFF', color: '#FFFFFF', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? (
              <>
                <RefreshCw size={13} className="animate-spin" /> Guardando
              </>
            ) : (
              <>
                <Check size={13} /> Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Card({ title, subtitle, icon, children }: {
  title: React.ReactNode; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl bg-white overflow-hidden"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <h2 className="text-[11px] uppercase tracking-wider font-medium flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
          {icon}
          {title}
        </h2>
        {subtitle && (
          <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{subtitle}</p>
        )}
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, helper, textarea, rows }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; helper?: string; textarea?: boolean; rows?: number;
}) {
  const base: React.CSSProperties = {
    background:  '#FFFFFF',
    border:      '1px solid #E5E7EB',
    borderRadius: 8,
    padding:     '8px 12px',
    color:       '#111827',
    fontSize:    13,
    width:       '100%',
    outline:     'none',
  };
  return (
    <div>
      {label && (
        <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
          {label}
        </label>
      )}
      {textarea ? (
        <textarea
          rows={rows ?? 3}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="focus:border-[#6C3BFF] transition-colors"
          style={{ ...base, resize: 'vertical', fontFamily: 'inherit' }}
        />
      ) : (
        <input
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="focus:border-[#6C3BFF] transition-colors"
          style={base}
        />
      )}
      {helper && <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{helper}</p>}
    </div>
  );
}

function Toggle({ on, size = 'md' }: { on: boolean; size?: 'md' | 'sm' }) {
  const w = size === 'sm' ? 28 : 36;
  const h = size === 'sm' ? 16 : 20;
  const d = size === 'sm' ? 12 : 16;
  return (
    <div
      className="rounded-full transition-colors relative flex-shrink-0"
      style={{ width: w, height: h, background: on ? '#6C3BFF' : '#E5E7EB' }}
    >
      <span
        className="absolute rounded-full bg-white transition-all"
        style={{ width: d, height: d, top: 2, left: on ? w - d - 2 : 2, boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.1)' }}
      />
    </div>
  );
}
