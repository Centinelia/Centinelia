'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, ExternalLink, Lock, MessageCircle, Save } from 'lucide-react';
import type { Plan } from '@/types/agent';

const PLAN_ORDER: Plan[] = ['pro'];
const PLAN_LABELS: Record<Plan, string> = { pro: 'Empleado Centinelia' };
const PLAN_COLORS: Record<Plan, string> = { pro: '#a855f7' };

function canUse(clientPlan: Plan, required: Plan): boolean {
  return PLAN_ORDER.indexOf(clientPlan) >= PLAN_ORDER.indexOf(required);
}

interface IntegrationDef {
  id:           'cal_com' | 'google' | 'outlook_cal' | 'calendly';
  label:        string;
  description:  string;
  requiredPlan: Plan;
  icon:         React.ReactNode;
  accentColor:  string;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id:           'cal_com',
    label:        'Cal.com',
    description:  'Agendamiento directo, tu empleado crea la cita durante la llamada',
    requiredPlan: 'pro',
    accentColor:  '#000',
    icon: (
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>cal</span>
      </div>
    ),
  },
  {
    id:           'calendly',
    label:        'Calendly',
    description:  'Agendamiento vía link, tu empleado comparte tu URL de reserva',
    requiredPlan: 'pro',
    accentColor:  '#006BFF',
    icon: (
      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" fill="#006BFF" />
          <rect x="8" y="7" width="16" height="18" rx="2" fill="#fff" />
          <rect x="8" y="7" width="16" height="6" rx="2" fill="#006BFF" />
          <rect x="11" y="17" width="4" height="4" rx="0.5" fill="#006BFF" />
          <rect x="17" y="17" width="4" height="4" rx="0.5" fill="#006BFF" />
          <rect x="11" y="5" width="2" height="4" rx="1" fill="#fff" />
          <rect x="19" y="5" width="2" height="4" rx="1" fill="#fff" />
        </svg>
      </div>
    ),
  },
  {
    id:           'google',
    label:        'Google Calendar',
    description:  'Agendamiento vía link, tu empleado comparte tu URL de reserva',
    requiredPlan: 'pro',
    accentColor:  '#4285F4',
    icon: (
      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" fill="#fff" />
          <rect x="4" y="6" width="24" height="22" rx="2" fill="#fff" stroke="#E0E0E0" strokeWidth="1" />
          <rect x="4" y="6" width="24" height="8" rx="2" fill="#4285F4" />
          <rect x="4" y="10" width="24" height="4" fill="#4285F4" />
          <rect x="10" y="4" width="2.5" height="5" rx="1.25" fill="#4285F4" />
          <rect x="19.5" y="4" width="2.5" height="5" rx="1.25" fill="#4285F4" />
          <text x="16" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4285F4" fontFamily="Arial">31</text>
        </svg>
      </div>
    ),
  },
  {
    id:           'outlook_cal',
    label:        'Outlook Calendar',
    description:  'Agendamiento vía link, tu empleado comparte tu URL de reserva de Outlook',
    requiredPlan: 'pro',
    accentColor:  '#0078D4',
    icon: (
      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" fill="#fff" />
          <rect x="4" y="6" width="24" height="22" rx="2" fill="#fff" stroke="#E0E0E0" strokeWidth="1" />
          <rect x="4" y="6" width="24" height="8" rx="2" fill="#0078D4" />
          <rect x="4" y="10" width="24" height="4" fill="#0078D4" />
          <rect x="10" y="4" width="2.5" height="5" rx="1.25" fill="#0078D4" />
          <rect x="19.5" y="4" width="2.5" height="5" rx="1.25" fill="#0078D4" />
          <text x="16" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0078D4" fontFamily="Arial">31</text>
        </svg>
      </div>
    ),
  },
];

interface State {
  calendar_type:           string | null;
  calendar_event_type_id:  string;
  calendar_link:           string;
  cal_api_configured:      boolean;
  cal_api_key:             string;
}

const SUPPORT_WA = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');

export default function IntegrationsSection({ token, plan }: {
  token:     string;
  plan:      Plan;
}) {
  const [state, setState]       = useState<State>({
    calendar_type: null, calendar_event_type_id: '', calendar_link: '',
    cal_api_configured: false, cal_api_key: '',
  });
  const cleanState = useRef<Pick<State, 'calendar_type' | 'calendar_event_type_id' | 'calendar_link'> | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}/integrations`)
      .then(r => r.json())
      .then(d => {
        setState(prev => ({ ...prev, ...d, cal_api_key: '' }));
        cleanState.current = {
          calendar_type:          d.calendar_type ?? null,
          calendar_event_type_id: d.calendar_event_type_id ?? '',
          calendar_link:          d.calendar_link ?? '',
        };
        if (d.calendar_type) setExpanded(d.calendar_type);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const isDirty = cleanState.current === null ? false : (
    state.calendar_type          !== cleanState.current.calendar_type          ||
    state.calendar_event_type_id !== cleanState.current.calendar_event_type_id ||
    state.calendar_link          !== cleanState.current.calendar_link          ||
    state.cal_api_key            !== ''
  );

  const set = (key: keyof State, val: string | null) =>
    setState(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    const body: Record<string, string | null> = {
      calendar_type:          state.calendar_type,
      calendar_event_type_id: state.calendar_event_type_id || null,
      calendar_link:          state.calendar_link || null,
    };
    if (state.cal_api_key) body.calendar_api_key = state.cal_api_key;
    try {
      await fetch(`/api/portal/${token}/integrations`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      setSaved(true);
      cleanState.current = {
        calendar_type:          state.calendar_type,
        calendar_event_type_id: state.calendar_event_type_id,
        calendar_link:          state.calendar_link,
      };
      if (state.cal_api_key) setState(prev => ({ ...prev, cal_api_configured: true, cal_api_key: '' }));
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const selectType = (type: string | null) => {
    set('calendar_type', type);
    setExpanded(type);
    if (type !== 'cal_com') { set('calendar_event_type_id', ''); set('cal_api_key', ''); }
  };

  if (loading) return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: '#FAFAFB' }} />)}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">

      {INTEGRATIONS.map(intg => {
        const allowed    = canUse(plan, intg.requiredPlan);
        const isActive   = state.calendar_type === intg.id;
        const isExpanded = expanded === intg.id;

        return (
          <div key={intg.id} className="rounded-xl overflow-hidden" style={{
            border:     `1px solid ${isActive ? `${intg.accentColor}55` : '#E8E3F5'}`,
            background: isActive ? `${intg.accentColor}08` : '#FAFAFB',
            opacity:    !allowed ? 0.65 : 1,
          }}>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ background: 'transparent', border: 'none', cursor: allowed ? 'pointer' : 'default' }}
              onClick={() => allowed && setExpanded(isExpanded ? null : intg.id)}
              disabled={!allowed}
            >
              {intg.icon}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>{intg.label}</p>
                <p className="text-xs" style={{ color: '#6B6480' }}>{intg.description}</p>
              </div>

              {!allowed ? (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  style={{ background: `${PLAN_COLORS[intg.requiredPlan]}15`, color: PLAN_COLORS[intg.requiredPlan], border: `1px solid ${PLAN_COLORS[intg.requiredPlan]}30` }}>
                  <Lock size={9} /> {PLAN_LABELS[intg.requiredPlan]}
                </span>
              ) : isActive ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium mr-1 flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Activo</span>
              ) : null}

              {allowed && (
                isExpanded
                  ? <ChevronUp size={14} style={{ color: '#6B6480', flexShrink: 0 }} />
                  : <ChevronDown size={14} style={{ color: '#6B6480', flexShrink: 0 }} />
              )}
            </button>

            {allowed && isExpanded && (
              <div className="px-4 pb-4" style={{ borderTop: '1px solid #E8E3F5' }}>
                <div className="flex flex-col gap-3 mt-3">

                  {intg.id === 'cal_com' && (
                    <>
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: '#1A0A3B' }}>API Key de Cal.com</label>
                        <input
                          type="password"
                          value={state.cal_api_key}
                          onChange={e => set('cal_api_key', e.target.value)}
                          placeholder={state.cal_api_configured ? '••••••••• (guardada, pega nueva para cambiar)' : 'cal_live_...'}
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                        />
                        <a href="https://app.cal.com/settings/developer/api-keys" target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs mt-1 hover:opacity-80" style={{ color: '#6C3BFF' }}>
                          Obtener API Key <ExternalLink size={10} />
                        </a>
                      </div>

                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: '#1A0A3B' }}>ID del tipo de evento</label>
                        <input
                          type="text"
                          value={state.calendar_event_type_id}
                          onChange={e => set('calendar_event_type_id', e.target.value)}
                          placeholder="Ej: 123456"
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                        />
                        <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
                          En cal.com/event-types → editar → revisa la URL del navegador
                        </p>
                      </div>
                    </>
                  )}

                  {(intg.id === 'google' || intg.id === 'outlook_cal') && (
                    <p className="text-xs p-3 rounded-lg" style={{ background: `${intg.accentColor}10`, color: '#6B6480', border: `1px solid ${intg.accentColor}25` }}>
                      Tu empleado captura nombre, servicio y horario durante la llamada. Al terminar, comparte tu link de reserva por correo para que el cliente confirme.
                    </p>
                  )}

                  {intg.id === 'calendly' && (
                    <p className="text-xs p-3 rounded-lg" style={{ background: 'rgba(0,107,255,0.08)', color: '#6B6480', border: '1px solid rgba(0,107,255,0.15)' }}>
                      Tu empleado captura nombre y servicio durante la llamada. Al terminar, comparte tu link de Calendly por correo para que el cliente seleccione su horario. Para agendamiento directo sin link, usa Cal.com.
                    </p>
                  )}

                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: '#1A0A3B' }}>
                      {intg.id === 'cal_com'
                        ? 'Link de reserva (fallback por correo si falla la API)'
                        : intg.id === 'calendly'
                        ? 'Link de tu agenda en Calendly'
                        : 'Link de tu agenda de citas'}
                    </label>
                    <input
                      type="url"
                      value={state.calendar_link}
                      onChange={e => set('calendar_link', e.target.value)}
                      placeholder={
                        intg.id === 'cal_com'
                          ? 'https://cal.com/tu-usuario/servicio'
                          : intg.id === 'calendly'
                          ? 'https://calendly.com/tu-usuario/30min'
                          : intg.id === 'outlook_cal'
                          ? 'https://outlook.office365.com/book/...'
                          : 'https://calendar.google.com/calendar/appointments/...'
                      }
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => selectType(intg.id)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold"
                      style={{
                        background: isActive ? 'rgba(34,197,94,0.12)' : `${intg.accentColor}15`,
                        border:     `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : `${intg.accentColor}40`}`,
                        color:      isActive ? '#22c55e' : intg.accentColor === '#000' ? '#1A0A3B' : intg.accentColor,
                      }}
                    >
                      {isActive ? <><Check size={12} /> Seleccionado</> : `Usar ${intg.label}`}
                    </button>
                    {isActive && (
                      <button
                        onClick={() => selectType(null)}
                        className="px-3 py-2 rounded-lg text-xs"
                        style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6B6480' }}
                      >
                        Desactivar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
        style={{
          background: saved  ? 'rgba(34,197,94,0.15)' : isDirty ? '#6C3BFF' : '#FAFAFB',
          border:     saved  ? '1px solid rgba(34,197,94,0.3)' : isDirty ? 'none' : '1px solid #E8E3F5',
          color:      saved  ? '#22c55e' : isDirty ? '#fff' : '#6B6480',
          opacity:    saving ? 0.6 : 1,
          cursor:     isDirty && !saving ? 'pointer' : 'default',
        }}
      >
        {saved ? <><Check size={14} /> Guardado</> : <><Save size={14} /> {saving ? 'Guardando…' : 'Guardar integración'}</>}
      </button>

      {/* Contact CTA */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
        <div>
          <p className="text-xs font-medium" style={{ color: '#1A0A3B' }}>¿No encuentras tu herramienta?</p>
          <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>Podemos conectar cualquier sistema, escríbenos</p>
        </div>
        {SUPPORT_WA && (
          <a href={`https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent('¡Hola! Quiero conectar una herramienta a mi empleado digital, ¿pueden ayudarme?')}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
            style={{ background: '#25D366', color: '#fff' }}>
            <MessageCircle size={12} /> WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
