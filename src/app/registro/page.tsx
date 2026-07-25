'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check, ChevronRight, ChevronLeft, ChevronDown, Loader, X,
  Phone, Building2, User, Utensils, Stethoscope,
  Smartphone, ShoppingBag, Landmark, GraduationCap, Clock, Zap,
  UserPlus, CalendarCheck, Users, PhoneCall, PhoneForwarded, Wrench, Network,
  type LucideProps,
} from 'lucide-react';
import Image from 'next/image';
import { MEERKAT_ROLES, MEERKAT_MAP, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';
import { FEATURE_LABELS } from '@/types/agent';
import { JORNADA_CONFIG } from '@/lib/billing/plans';

type FormPlan = 'pro' | 'empresarial';
type FormTier = 'starter' | 'growth' | 'scale';
type Giro    = 'general' | 'restaurante' | 'consultorio' | 'estetica' | 'agencia' | 'retail' | 'gubernamental' | 'educacion';

type Country = 'mx' | 'us';

const COUNTRIES: { id: Country; label: string; flag: string; codeLabel: string; placeholder: string }[] = [
  { id: 'mx', label: 'México',         flag: '🇲🇽', codeLabel: 'Lada',        placeholder: 'Busca por lada o ciudad…' },
  { id: 'us', label: 'Estados Unidos', flag: '🇺🇸', codeLabel: 'Área code',   placeholder: 'Search by area code or city…' },
];

const CITIES_MX: { label: string; lada: string }[] = [
  { label: 'CDMX / Ciudad de México',  lada: '55'  },
  { label: 'Monterrey, NL',            lada: '81'  },
  { label: 'Guadalajara, JAL',         lada: '33'  },
  { label: 'Puebla, PUE',              lada: '222' },
  { label: 'Tijuana, BC',              lada: '664' },
  { label: 'León, GTO',                lada: '477' },
  { label: 'Querétaro, QRO',           lada: '442' },
  { label: 'Cancún, QR',               lada: '998' },
  { label: 'Mérida, YUC',              lada: '999' },
  { label: 'Hermosillo, SON',          lada: '662' },
  { label: 'Chihuahua, CHIH',          lada: '614' },
  { label: 'Juárez, CHIH',             lada: '656' },
  { label: 'San Luis Potosí, SLP',     lada: '444' },
  { label: 'Aguascalientes, AGS',      lada: '449' },
  { label: 'Morelia, MICH',            lada: '443' },
  { label: 'Torreón, COAH',            lada: '871' },
  { label: 'Saltillo, COAH',           lada: '844' },
  { label: 'Culiacán, SIN',            lada: '667' },
  { label: 'Mazatlán, SIN',            lada: '669' },
  { label: 'Veracruz, VER',            lada: '229' },
  { label: 'Xalapa, VER',              lada: '228' },
  { label: 'Oaxaca, OAX',              lada: '951' },
  { label: 'Acapulco, GRO',            lada: '744' },
  { label: 'Villahermosa, TAB',        lada: '993' },
  { label: 'Tuxtla Gutiérrez, CHIS',   lada: '961' },
  { label: 'San Cristóbal, CHIS',      lada: '967' },
  { label: 'Cuernavaca, MOR',          lada: '777' },
  { label: 'Toluca, MEX',              lada: '722' },
  { label: 'Durango, DUR',             lada: '618' },
  { label: 'Zacatecas, ZAC',           lada: '492' },
  { label: 'Tepic, NAY',               lada: '311' },
  { label: 'Colima, COL',              lada: '312' },
  { label: 'Pachuca, HGO',             lada: '771' },
  { label: 'Campeche, CAMP',           lada: '981' },
  { label: 'Chetumal, QR',             lada: '983' },
  { label: 'Ensenada, BC',             lada: '646' },
  { label: 'Los Cabos, BCS',           lada: '624' },
];

const CITIES_US: { label: string; lada: string }[] = [
  { label: 'Atlanta, GA',              lada: '404' },
  { label: 'Austin, TX',               lada: '512' },
  { label: 'Baltimore, MD',            lada: '410' },
  { label: 'Boston, MA',               lada: '617' },
  { label: 'Charlotte, NC',            lada: '704' },
  { label: 'Chicago, IL',              lada: '312' },
  { label: 'Cleveland, OH',            lada: '216' },
  { label: 'Dallas, TX',               lada: '214' },
  { label: 'Denver, CO',               lada: '303' },
  { label: 'Detroit, MI',              lada: '313' },
  { label: 'El Paso, TX',              lada: '915' },
  { label: 'Houston, TX',              lada: '713' },
  { label: 'Indianapolis, IN',         lada: '317' },
  { label: 'Jacksonville, FL',         lada: '904' },
  { label: 'Kansas City, MO',          lada: '816' },
  { label: 'Las Vegas, NV',            lada: '702' },
  { label: 'Los Angeles, CA',          lada: '213' },
  { label: 'Louisville, KY',           lada: '502' },
  { label: 'Memphis, TN',              lada: '901' },
  { label: 'Miami, FL',                lada: '305' },
  { label: 'Milwaukee, WI',            lada: '414' },
  { label: 'Minneapolis, MN',          lada: '612' },
  { label: 'Nashville, TN',            lada: '615' },
  { label: 'New York, NY',             lada: '212' },
  { label: 'Oklahoma City, OK',        lada: '405' },
  { label: 'Orlando, FL',              lada: '407' },
  { label: 'Philadelphia, PA',         lada: '215' },
  { label: 'Phoenix, AZ',              lada: '602' },
  { label: 'Portland, OR',             lada: '503' },
  { label: 'Raleigh, NC',              lada: '919' },
  { label: 'Sacramento, CA',           lada: '916' },
  { label: 'Salt Lake City, UT',       lada: '801' },
  { label: 'San Antonio, TX',          lada: '210' },
  { label: 'San Diego, CA',            lada: '619' },
  { label: 'San Francisco, CA',        lada: '415' },
  { label: 'San Jose, CA',             lada: '408' },
  { label: 'Seattle, WA',              lada: '206' },
  { label: 'Tampa, FL',                lada: '813' },
  { label: 'Tucson, AZ',               lada: '520' },
  { label: 'Virginia Beach, VA',       lada: '757' },
  { label: 'Washington, DC',           lada: '202' },
];

const CITIES_BY_COUNTRY: Record<Country, { label: string; lada: string }[]> = {
  mx: [...CITIES_MX].sort((a, b) => Number(a.lada) - Number(b.lada)),
  us: [...CITIES_US].sort((a, b) => Number(a.lada) - Number(b.lada)),
};

type AgentPlanDef = {
  id:           FormPlan;
  label:        string;
  setupFee:     number;
  color:        string;
  description:  string;
  recommended?: boolean;
  custom?:      boolean;
  features:     { label: string; desc: string }[];
};

const AGENT_PLANS: AgentPlanDef[] = [
  {
    id: 'pro', label: 'Empleado Centinelia', setupFee: 14990, color: '#6C3BFF',
    description: 'Todo lo que tu organización necesita para automatizar la atención telefónica.',
    features: [
      { label: 'Atención telefónica 24/7', desc: 'Contesta a cualquier hora con el nombre e información de tu organización.' },
      { label: 'Captura de leads y agendamiento', desc: 'Obtiene datos del prospecto y confirma o modifica citas durante la llamada.' },
      { label: 'Transferencia inteligente', desc: 'Transfiere al staff cuando el cliente lo necesita.' },
      { label: 'Hasta 3 llamadas simultáneas', desc: 'Tu agente atiende hasta 3 llamadas al mismo tiempo sin dar señal de ocupado.' },
      { label: 'Llamadas salientes y devolución automática', desc: 'Llama a contactos para confirmar citas y devuelve llamadas perdidas.' },
      { label: 'Toma de pedidos', desc: 'Recibe pedidos completos durante la llamada y los registra en el portal.' },
      { label: 'Memoria de cliente', desc: 'Recuerda quién ha llamado antes, qué pidió y sus preferencias.' },
      { label: 'Multiidioma (ES + EN)', desc: 'Detecta el idioma del cliente y responde en español o inglés.' },
      { label: 'Voz y nombre personalizables', desc: 'Elige nombre, voz y diseña lógica conversacional a medida de tu operación.' },
      { label: 'Reseñas Google automáticas', desc: 'Tras cada llamada exitosa manda el link de tu reseña Google por correo.' },
      { label: 'Módulo Oficina completo', desc: 'Bandeja, contratos, juntas, reportes y herramientas de IA integradas.' },
    ],
  },
  {
    id: 'empresarial', label: 'Centinelia Empresarial', setupFee: 0, color: '#f59e0b', custom: true,
    description: 'Múltiples empleados y sucursales, integraciones POS/CRM y SLA dedicado.',
    features: [
      { label: 'Todo lo del Empleado Centinelia', desc: 'Todas las capacidades del plan estándar, más las siguientes.' },
      { label: 'Integración con tu sistema', desc: 'Conectamos el agente con tu POS, CRM o calendario en tiempo real.' },
      { label: 'Múltiples empleados y sucursales', desc: 'Un empleado independiente por sucursal con su propio portal.' },
      { label: 'SLA y soporte dedicado', desc: 'Tiempo de respuesta garantizado y línea directa con el equipo técnico.' },
    ],
  },
];

type TierDef = { id: FormTier; label: string; minutes: number; aiOps: number; price: number; popular?: boolean };

const TIERS: TierDef[] = [
  { id: 'starter', label: 'Media Jornada',    minutes: 300,  aiOps: 120, price: 2997 },
  { id: 'growth',  label: 'Jornada Completa', minutes: 600,  aiOps: 220, price: 5994, popular: true },
  { id: 'scale',   label: 'Alta Demanda',     minutes: 1200, aiOps: 320, price: 11988 },
];

// Ops-only tiers for Nox (no minutes cost)
type NoxTierDef = { id: FormTier; label: string; aiOps: number; price: number; popular?: boolean; desc: string };
const NOX_TIERS: NoxTierDef[] = [
  { id: 'starter', label: 'Media Jornada',    aiOps:  500, price: 2997,  desc: 'Ideal para organizaciones en crecimiento.' },
  { id: 'growth',  label: 'Jornada Completa', aiOps: 1200, price: 5994,  popular: true, desc: 'Para organizaciones con operación constante.' },
  { id: 'scale',   label: 'Alta Demanda',     aiOps: 3000, price: 11988, desc: 'Diseñado para operaciones de alto volumen.' },
];

// Roles for the 3×3 grid — excludes coordinator (Nox gets its own card above)
const GRID_ROLES = MEERKAT_ROLES.filter(r => !(r.features as Record<string, unknown>)?.is_coordinator);

const GIROS: { id: Giro; label: string; icon: React.FC<LucideProps> }[] = [
  { id: 'retail',         label: 'Tienda / Comercio',        icon: ShoppingBag    },
  { id: 'restaurante',    label: 'Restaurante / Café',       icon: Utensils       },
  { id: 'consultorio',    label: 'Salud / Clínica',          icon: Stethoscope    },
  { id: 'agencia',        label: 'Agencia / Servicios',      icon: Smartphone     },
  { id: 'gubernamental',  label: 'Gobierno / Municipio',     icon: Landmark       },
  { id: 'educacion',      label: 'Universidad / Educación',  icon: GraduationCap  },
];

const GIRO_GENERAL = { id: 'general' as Giro, label: 'General / Otro', icon: Building2 };

const ROLE_PREVIEW: Partial<Record<MeerkatRoleId, { subtitle: string; bullets: string[] }>> = {
  nia:   {
    subtitle: 'Tu primera línea de atención',
    bullets:  ['Resuelve preguntas frecuentes', 'Agenda citas y servicios', 'Captura datos de prospectos', 'Transfiere a quien corresponde'],
  },
  noah:  {
    subtitle: 'Cierra oportunidades sin parar',
    bullets:  ['Califica prospectos en la llamada', 'Toma pedidos y los registra', 'Llama a contactos de tu lista', 'Reactiva clientes dormidos'],
  },
  nara:  {
    subtitle: 'Coordinación operativa sin fricciones',
    bullets:  ['Recibe reportes y solicitudes internas', 'Actualiza estatus en tiempo real', 'Da seguimiento a cada caso abierto', 'Canaliza al departamento correcto'],
  },
  nico:  {
    subtitle: 'Recupera cartera sin confrontaciones',
    bullets:  ['Recuerda pagos pendientes a clientes', 'Genera cotizaciones y acuerdos de pago', 'Hace seguimiento de facturas', 'Reporta conciliaciones básicas'],
  },
  naia:  {
    subtitle: 'Gestión de personal sin papeleos',
    bullets:  ['Registra faltas, permisos y vacaciones', 'Responde dudas del personal 24/7', 'Agenda entrevistas y evaluaciones', 'Mantiene el directorio de empleados'],
  },
  nelia: {
    subtitle: 'Cada cliente recibe respuesta',
    bullets:  ['Resuelve dudas frecuentes al instante', 'Hace seguimiento de casos abiertos', 'Llama para encuestas de satisfacción', 'Envía confirmaciones automáticas'],
  },
  neo:   {
    subtitle: 'Resuelve incidentes sin demora',
    bullets:  ['Abre y gestiona tickets de soporte', 'Consulta el directorio tecnológico', 'Escala incidentes críticos al equipo', 'Automatiza respuestas a problemas frecuentes'],
  },
  nova:  {
    subtitle: 'Coordina tu operación en campo',
    bullets:  ['Despacha equipos en segundos', 'Coordina repartidores, técnicos o brigadas', 'Actualiza el estatus de cada unidad', 'Registra y archiva cada operación'],
  },
  nox:   {
    subtitle: 'El que mantiene todo en orden',
    bullets:  ['Enruta correos al agente correcto', 'Monitorea tareas delegadas y escala las vencidas', 'Genera reportes de operación automáticos', 'Sin llamadas: coordinación pura, máxima eficiencia'],
  },
  niva:  {
    subtitle: 'La que ve lo que otros no notan',
    bullets:  ['Analiza el contexto antes de asignar cada tarea', 'Detecta cuellos de botella y los resuelve de raíz', 'Monitorea al equipo y escala lo vencido a tiempo', 'Sin llamadas: estrategia y criterio, cero interrupciones'],
  },
};

const CUSTOM_PORTAL_FEATURES: { label: string; desc: string }[] = [
  { label: 'Nombre y voz del agente',        desc: 'Elige el nombre y la voz que mejor represente a tu organización.' },
  { label: 'Rol y descripción del puesto',   desc: 'Define qué hace, cómo se llama su rol y cómo se presenta ante los clientes.' },
  { label: 'Base de conocimiento',           desc: 'Carga información de tu organización para que responda con precisión.' },
  { label: 'Capacidades activas',            desc: 'Activa o desactiva recepción, agendamiento, cobranza, ventas y más.' },
  { label: 'Horarios de atención',           desc: 'Configura cuándo atiende llamadas y cuándo redirige al personal.' },
  { label: 'Transferencias',                  desc: 'Define a quién y cuándo transferir llamadas.' },
  { label: 'Instrucciones personalizadas',   desc: 'Dale un guion, tono de voz y estilo de conversación propio.' },
  { label: 'Llamadas salientes',             desc: 'Activa marcación automática para confirmaciones o seguimiento.' },
];


// ── Capability chips (dark-themed, for registration flow) ─────────────────────
const REG_VOICE_CAPS = [
  { key: 'lead_qualification',      icon: UserPlus,       label: 'Captura leads'        },
  { key: 'appointment_booking',     icon: CalendarCheck,  label: 'Agenda citas'         },
  { key: 'existing_client_support', icon: Users,          label: 'Atiende clientes'     },
  { key: 'order_taking',            icon: ShoppingBag,    label: 'Toma pedidos'         },
  { key: 'outbound_calls',          icon: PhoneCall,      label: 'Llam. salientes'      },
  { key: 'smart_transfer',          icon: PhoneForwarded, label: 'Transferencia'        },
  { key: 'helpdesk',                icon: Wrench,         label: 'Mesa de ayuda IT'     },
] as const;

function CapabilityChipsRegistro({ features, color, isCoordinator }: {
  features: Record<string, unknown>;
  color: string;
  isCoordinator: boolean;
}) {
  const lightC = lightenColor(color, 0.45);
  const chip = (active: boolean) => ({
    display: 'inline-flex' as const, alignItems: 'center' as const, gap: 4,
    padding: '3px 9px', borderRadius: 999,
    fontSize: '0.67rem', fontWeight: 600,
    background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
    color:      active ? lightC       : 'rgba(255,255,255,0.22)',
    border:     `1px solid ${active ? `${color}35` : 'rgba(255,255,255,0.07)'}`,
  });
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 8 }}>
        Capacidades
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {isCoordinator ? (
          <>
            <span style={chip(true)}><Network size={9} strokeWidth={2} />Coordina al equipo</span>
            <span style={chip(true)}><Phone   size={9} strokeWidth={2} />Sin llamadas entrantes</span>
          </>
        ) : (
          <>
            <span style={chip(true)}><Phone size={9} strokeWidth={2} />Atención 24/7</span>
            {REG_VOICE_CAPS.map(({ key, icon: Icon, label }) => {
              const active = !!features[key];
              return (
                <span key={key} style={chip(active)}>
                  {active ? <Icon size={9} strokeWidth={2} /> : <X size={9} strokeWidth={2} style={{ opacity: 0.4 }} />}
                  {label}
                </span>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

const priceFmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r + (255 - r) * amount)}, ${Math.round(g + (255 - g) * amount)}, ${Math.round(b + (255 - b) * amount)})`;
}

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.45 ? '#1A0A3B' : '#ffffff';
}

// ─── City dropdown ─────────────────────────────────────────────────────────────

function CitySelect({ value, onChange, cities, searchPlaceholder }: {
  value:             string;
  onChange:          (v: string) => void;
  cities:            { label: string; lada: string }[];
  searchPlaceholder: string;
}) {
  const [open, setOpen]     = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [query, setQuery]   = useState('');
  const ref                 = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);
  const selected            = cities.find(c => c.lada === value);

  const filtered = query.trim()
    ? cities.filter(c =>
        c.lada.includes(query.trim()) ||
        c.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : cities;

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleToggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setOpenUp(rect.bottom + 280 > window.innerHeight);
    }
    setOpen(o => !o);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '12px 16px',
          color: selected ? '#E2D9FF' : 'rgba(255,255,255,0.3)',
          width: '100%', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span style={{ fontWeight: 700, color: '#9B6DFF', letterSpacing: '0.02em' }}>{selected.lada}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>·</span>
            <span>{selected.label}</span>
          </span>
        ) : <span style={{ color: 'rgba(255,255,255,0.3)' }}>Selecciona…</span>}
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.4)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          ...(openUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
          left: 0, right: 0, background: 'linear-gradient(140deg, #2A0E6B 0%, #150835 100%)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
          zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && filtered.length === 1) {
                  onChange(filtered[0].lada);
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                padding: '7px 11px', fontSize: 13, color: '#E2D9FF', outline: 'none',
              }}
            />
          </div>
          {/* Options list */}
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sin resultados</p>
            ) : filtered.map(c => (
              <button key={c.lada} type="button" onClick={() => { onChange(c.lada); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', fontSize: 13,
                  color: c.lada === value ? '#9B6DFF' : 'rgba(255,255,255,0.72)',
                  background: c.lada === value ? 'rgba(108,59,255,0.15)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 32, color: c.lada === value ? '#9B6DFF' : '#C4A8FF' }}>{c.lada}</span>
                <span style={{ color: c.lada === value ? '#9B6DFF' : 'rgba(255,255,255,0.55)', fontSize: 12 }}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Meerkat card ──────────────────────────────────────────────────────────────

function MeerkatCard({
  roleId, selected, onClick,
}: { roleId: MeerkatRoleId; selected: boolean; onClick: () => void }) {
  const role      = MEERKAT_MAP[roleId];
  const [err, setErr] = useState(false);

  const hasImg = !!role.imagen && !err;
  const isCustom = role.id === 'custom';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background:   selected ? `${role.color}18` : 'rgba(255,255,255,0.03)',
        border:       `2px solid ${selected ? role.color : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16,
        padding:      0,
        cursor:       'pointer',
        transition:   'border-color 0.15s, background 0.15s, transform 0.1s',
        transform:    selected ? 'scale(1.02)' : 'scale(1)',
        overflow:     'hidden',
        display:      'flex',
        flexDirection:'column',
        alignItems:   'center',
        textAlign:    'center',
      }}
    >
      {/* Image area */}
      <div style={{ width: '100%', aspectRatio: '1', position: 'relative', overflow: 'hidden', background: '#F4F0FF' }}>
        {hasImg ? (
          <img
            src={role.imagen!}
            alt={role.nombre}
            onError={() => setErr(true)}
            style={{
              width: '100%', height: '100%',
              objectFit: 'contain', objectPosition: 'bottom center',
              ...(roleId === 'nia' && { transform: 'scale(1.09)', transformOrigin: 'bottom center' }),
            }}
          />
        ) : isCustom ? (
          <div style={{ width: '100%', height: '100%', background: '#0a0618', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 64 80" style={{ width: '55%', height: '55%', fill: 'rgba(255,255,255,0.12)' }}>
              <ellipse cx="32" cy="26" rx="13" ry="14" />
              <ellipse cx="20" cy="16" rx="5" ry="6" />
              <ellipse cx="44" cy="16" rx="5" ry="6" />
              <rect x="14" y="38" width="36" height="28" rx="10" />
            </svg>
          </div>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: `${role.color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 900, color: role.color,
          }}>
            {role.nombre[0]}
          </div>
        )}
        {selected && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 20, height: 20, borderRadius: '50%',
            background: role.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={11} color="#fff" />
          </div>
        )}
      </div>

      {/* Text */}
      <div style={{ padding: '10px 8px 12px', width: '100%', background: 'rgba(255,255,255,0.07)', flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.9)', lineHeight: 1.2 }}>
          {role.nombre}
        </div>
        {role.rol && (
          <div style={{ fontSize: 12, fontWeight: 600, color: lightenColor(role.color, 0.45), marginTop: 4 }}>
            {role.rol}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Chat personality messages — Step 3 ──────────────────────────────────────
type MeerkatChatDef = {
  name:  { filled: (org: string) => string; cleared: string };
  desc:  { filled: string; cleared: string };
  phone: { filled: string; cleared: string };
};

const MEERKAT_CHAT: Record<string, MeerkatChatDef> = {
  nia: {
    name:  { filled: n => `Anotado. Bienvenidos, ${n}.`, cleared: '¿No era ese el nombre? Sin problema, aquí lo cambio.' },
    desc:  { filled: 'Perfecto. Ya sé cómo presentar tu organización con cada llamada.', cleared: 'Sin prisa. Puedes reescribirla cuando quieras.' },
    phone: { filled: 'Anotado. Ese será el número que mencione en las llamadas.', cleared: '¿Cambiaste el teléfono? Cuando tengas el correcto, lo anoto.' },
  },
  noah: {
    name:  { filled: n => `${n}. Bien. ¿Qué vendemos?`, cleared: '¿Distinto nombre? No hay problema.' },
    desc:  { filled: 'Entendido. Ya sé cómo hablar de la organización.', cleared: 'Cuando tengas la descripción lista, seguimos.' },
    phone: { filled: 'Ese número queda anotado.', cleared: '¿Cambiaste el teléfono? Dime el correcto.' },
  },
  nara: {
    name:  { filled: n => `${n}. Expediente iniciado.`, cleared: '¿Corrección de nombre? Esperando el definitivo.' },
    desc:  { filled: 'Contexto recibido. Ya tengo lo que necesito para operar.', cleared: 'Cuando tengas la versión final, continúa.' },
    phone: { filled: 'Número registrado en el expediente.', cleared: '¿Corrección de número? Aquí lo actualizo.' },
  },
  nico: {
    name:  { filled: n => `${n}, anotado. Vamos bien.`, cleared: '¿No era ese? Sin problema.' },
    desc:  { filled: 'Claro, ya entiendo de qué va la organización.', cleared: 'Cuando lo tengas más claro, seguimos.' },
    phone: { filled: 'Número anotado. ¿Seguimos?', cleared: '¿Ese no era el número? Cuando tengas el correcto, dime.' },
  },
  naia: {
    name:  { filled: n => `¿${n}?, ¡sí los conozco! Hace mucho que quiero trabajar con ustedes.`, cleared: '¿No era ese el nombre? Cuando lo confirmes, lo registro.' },
    desc:  { filled: 'Todo bien documentado. Ya sé cómo funciona el equipo.', cleared: '¿Revisando la descripción? Tómate tu tiempo.' },
    phone: { filled: 'Número registrado. Lista para las comunicaciones del equipo.', cleared: '¿Cambio de número? Aquí lo actualizo.' },
  },
  nelia: {
    name:  { filled: n => `¡${n}! Ya los tengo en mi lista.`, cleared: '¿Cambiaste el nombre? Sin problema, dime el correcto.' },
    desc:  { filled: 'Perfecto. Ya puedo ayudar a sus clientes como si fuera parte del equipo.', cleared: 'Cuando tengas lista la descripción, seguimos.' },
    phone: { filled: 'Anotado. Ese es el número que mencionaré si alguien pregunta.', cleared: '¿Ese no era el número? Dime el correcto.' },
  },
  neo: {
    name:  { filled: n => `${n}. Nombre registrado.`, cleared: 'Nombre eliminado. Esperando el definitivo.' },
    desc:  { filled: 'Contexto operativo procesado correctamente.', cleared: 'Descripción eliminada. Esperando la versión final.' },
    phone: { filled: 'Número de contacto almacenado.', cleared: 'Número eliminado. Continúa cuando tengas el correcto.' },
  },
  nova: {
    name:  { filled: n => `Recibido. ${n} en el sistema.`, cleared: '¿Corrección de nombre? Esperando confirmación.' },
    desc:  { filled: 'Contexto operacional registrado. Listo para coordinar.', cleared: 'Descripción borrada. En espera de la definitiva.' },
    phone: { filled: 'Número de contacto registrado.', cleared: '¿Cambio de número? Actualizando cuando lo tengas.' },
  },
  nox: {
    name:  { filled: n => `${n}. Lo registro para el equipo.`, cleared: '¿Corrección? Cuando lo confirmes, lo asigno.' },
    desc:  { filled: 'Contexto claro. Ya puedo coordinar al equipo.', cleared: 'Cuando tengas la descripción, seguimos.' },
    phone: { filled: 'Número del equipo registrado.', cleared: '¿Cambio de número? Esperando el definitivo.' },
  },
  niva: {
    name:  { filled: n => `${n}. Bien, empezamos a construir el expediente.`, cleared: '¿Revisión del nombre? Tómate el tiempo que necesites.' },
    desc:  { filled: 'Ya veo el contexto. Entiendo cómo opera la organización.', cleared: '¿Ajustando la descripción? Sin prisa.' },
    phone: { filled: 'Número registrado. Sigamos.', cleared: '¿Cambio de número? Aquí lo actualizo.' },
  },
  custom: {
    name:  { filled: n => `${n}, registrado.`, cleared: 'Sin problema. Cuando lo tengas, continúa.' },
    desc:  { filled: 'Información registrada.', cleared: 'Puedes reescribirla cuando quieras.' },
    phone: { filled: 'Número registrado.', cleared: 'Cuando tengas el número, continúa.' },
  },
};

const MEERKAT_GREETING: Record<string, string> = {
  nia:    'Antes de comenzar a recibir llamadas, necesito conocer un poco tu organización.',
  noah:   'Para empezar a cerrar tratos, cuéntame un poco de la organización.',
  nara:   'Para abrir tu expediente, necesito los datos de la organización.',
  nico:   'Antes de ponerme a contestar, dime un poco de la organización.',
  naia:   'Para poder apoyar a tu equipo, necesito conocer la organización.',
  nelia:  'Para atender a tus clientes como si fuera parte del equipo, cuéntame de la organización.',
  neo:    'Para inicializar mis protocolos de soporte, necesito los datos de la organización.',
  nova:   'Para coordinar correctamente, necesito el contexto operacional de la organización.',
  nox:    'Para empezar a coordinar al equipo, dime los datos de la organización.',
  niva:   'Para construir el expediente de la organización, necesito algunos datos.',
  custom: 'Para empezar a trabajar, necesito conocer un poco tu organización.',
};

const MEERKAT_AGENT_NAME_MSG: Record<string, (name: string) => string> = {
  nia:    n => `Me encanta ese nombre. ¡Encantada de ser ${n}!`,
  noah:   n => `${n}. Suena a alguien que cierra tratos. Me gusta.`,
  nara:   n => `${n}. Profesional. Me queda bien.`,
  nico:   n => `${n}. Suena amigable. Me gusta.`,
  naia:   n => `¡${n}! Qué bonito nombre. Ya lo tengo en mi expediente.`,
  nelia:  n => `¡${n}! Me encanta. Ya me lo aprendo.`,
  neo:    n => `${n}. Nombre actualizado en el sistema.`,
  nova:   n => `Recibido. Operaré como ${n}.`,
  nox:    n => `${n}. Se lo comunico al equipo.`,
  niva:   n => `${n}. Bien elegido.`,
  custom: n => `¡${n} me queda perfecto!`,
};

const MEERKAT_GIRO_MSG: Record<string, (label: string) => string> = {
  nia:    g => `¡Perfecto! El sector ${g} es justo mi especialidad.`,
  noah:   g => `${g}. Ese sector tiene mucho potencial. Vamos.`,
  nara:   g => `Sector ${g} registrado. Ya adapto el protocolo.`,
  nico:   g => `¡Bien! ${g}. Conozco bien ese sector.`,
  naia:   g => `${g}. Tengo experiencia con ese tipo de equipo.`,
  nelia:  g => `¡${g}! Ese sector me encanta atender.`,
  neo:    g => `Sector ${g} detectado. Ajustando protocolo de soporte.`,
  nova:   g => `Sector ${g} registrado. Listo para coordinar.`,
  nox:    g => `${g}. Lo añado al perfil del equipo.`,
  niva:   g => `${g}. Conozco los patrones de ese sector.`,
  custom: g => `Excelente, el sector ${g} es mi especialidad.`,
};

// ─── Main form ────────────────────────────────────────────────────────────────

function RegistroInner() {
  const params   = useSearchParams();
  const canceled = params.get('canceled') === '1';
  const backUrl  = params.get('back') ?? null;

  const validPlans: FormPlan[] = ['pro', 'empresarial'];
  const validTiers: FormTier[] = ['starter', 'growth', 'scale'];
  const validRoles             = MEERKAT_ROLES.map(r => r.id) as MeerkatRoleId[];
  const rawPlan  = params.get('plan') as FormPlan | null;
  const rawTier  = params.get('tier') as FormTier | null;
  const rawRole  = params.get('role') as MeerkatRoleId | null;
  const initPlan: FormPlan       = rawPlan && validPlans.includes(rawPlan) ? rawPlan : 'pro';
  const initTier: FormTier       = rawTier && validTiers.includes(rawTier) ? rawTier : 'growth';
  const initRole: MeerkatRoleId | null = rawRole && validRoles.includes(rawRole) ? rawRole : null;

  const [step,          setStep]         = useState<1 | 2 | 3 | 4>(initRole ? 2 : 1);
  const [loading,       setLoading]      = useState(false);
  const [error,         setError]        = useState('');
  const [submitted,     setSubmitted]    = useState(false);

  // Step 1 — Meerkat
  const [meerkatRoleId, setMeerkatRoleId] = useState<MeerkatRoleId | null>(initRole);

  // Step 2 — Plan
  const [plan, setPlan]     = useState<FormPlan>(initPlan);
  const [tier, setTier]     = useState<FormTier>(initTier);
  const [jornada, setJornada] = useState<'combinada' | 'minutos' | 'tareas'>('combinada');

  // Step 3 — Business
  const [businessName,  setBusinessName]  = useState('');
  const [businessDesc,  setBusinessDesc]  = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [giro,          setGiro]          = useState<Giro>('general');
  const [country,       setCountry]       = useState<Country>('mx');
  const [cityLada,      setCityLada]      = useState('');

  const handleCountryChange = (c: Country) => { setCountry(c); setCityLada(''); };
  const countryDef  = COUNTRIES.find(c => c.id === country)!;
  const citiesList  = CITIES_BY_COUNTRY[country];
  const [agentName,     setAgentName]     = useState(
    initRole && initRole !== 'custom' ? (MEERKAT_MAP[initRole]?.nombre ?? '') : ''
  );

  // Step 4 — Contact
  const [clientFirstName, setClientFirstName] = useState('');
  const [clientLastName,  setClientLastName]  = useState('');
  const [clientEmail,     setClientEmail]     = useState('');

  // Step 4 — KYC
  const [rfc,         setRfc]         = useState('');
  const [curp,        setCurp]        = useState('');
  const [aupAccepted, setAupAccepted] = useState(false);

  // Step 3 — Chat widget
  const [chatMessages,   setChatMessages]   = useState<string[]>([]);
  const [countryClicked, setCountryClicked] = useState(false);
  const chatShownRef        = useRef({ name: false, desc: false, country: false, phone: false });
  const chatClearedRef      = useRef({ name: false, desc: false, phone: false });
  const chatEndRef          = useRef<HTMLDivElement>(null);
  const [mobileBubble,      setMobileBubble]      = useState<string | null>(null);
  const mobileBubbleTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentNameChatShown   = useRef(false);
  const lastGiroShown        = useRef<string | null>(null);

  const selectedMeerkat    = meerkatRoleId ? MEERKAT_MAP[meerkatRoleId] : null;
  const selectedAgentPlan  = AGENT_PLANS.find(p => p.id === plan)!;
  const isCoordinator      = !!((selectedMeerkat?.features as Record<string, unknown>)?.is_coordinator);
  const effectiveJornada   = isCoordinator ? 'tareas' : jornada;
  const selectedTier       = TIERS.find(t => t.id === tier) ?? TIERS[1];
  const selectedNoxTier    = NOX_TIERS.find(t => t.id === tier) ?? NOX_TIERS[1];
  const monthlyPrice       = plan !== 'empresarial' ? (isCoordinator ? selectedNoxTier.price : selectedTier.price) : 0;
  const roleColor          = selectedMeerkat?.color ?? selectedAgentPlan.color;

  const STEP_LABELS = ['Empleado', isCoordinator ? 'Tareas' : 'Jornada', 'Onboarding', 'Contratación'];

  const [empresarialOpen, setEmpresarialOpen] = useState(false);
  const [overlayOpen,     setOverlayOpen]     = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step === 1) {
        if (overlayOpen)      setOverlayOpen(false);
        else if (meerkatRoleId)   setMeerkatRoleId(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [step, meerkatRoleId, overlayOpen]);

  // Chat widget effects — Step 3
  useEffect(() => {
    if (step === 3 && selectedMeerkat) {
      chatShownRef.current   = { name: false, desc: false, country: false, phone: false };
      chatClearedRef.current = { name: false, desc: false, phone: false };
      agentNameChatShown.current = false;
      lastGiroShown.current      = null;
      setChatMessages([
        `Hola, soy ${selectedMeerkat.nombre}.`,
        MEERKAT_GREETING[selectedMeerkat.id] ?? MEERKAT_GREETING.custom,
      ]);
      setCountryClicked(false);
    }
    if (step !== 3) setChatMessages([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== 3 || !countryClicked || chatShownRef.current.country) return;
    chatShownRef.current.country = true;
    const msg = country === 'mx'
      ? 'Excelente, responderé como una organización mexicana.'
      : 'Excelente, responderé como una organización estadounidense.';
    setChatMessages(prev => [...prev, msg]);
  }, [country, countryClicked, step]);

  const handleFieldBlur = (field: 'name' | 'desc' | 'phone') => {
    if (step !== 3 || !selectedMeerkat) return;
    const thresholds = { name: 4, desc: 10, phone: 6 } as const;
    const values     = { name: businessName, desc: businessDesc, phone: businessPhone };
    const val        = values[field].trim();
    const filled     = val.length >= thresholds[field];
    const chatDef    = MEERKAT_CHAT[selectedMeerkat.id] ?? MEERKAT_CHAT.custom;

    if (!chatShownRef.current[field] && filled) {
      chatShownRef.current[field] = true;
      chatClearedRef.current[field] = false;
      const msg = field === 'name' ? chatDef.name.filled(val) : chatDef[field].filled;
      setChatMessages(prev => [...prev, msg]);
    } else if (chatShownRef.current[field] && filled) {
      chatClearedRef.current[field] = false;
    } else if (chatShownRef.current[field] && !chatClearedRef.current[field] && !filled) {
      chatClearedRef.current[field] = true;
      setChatMessages(prev => [...prev, chatDef[field].cleared]);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (chatMessages.length === 0) { setMobileBubble(null); return; }
    const last = chatMessages[chatMessages.length - 1];
    setMobileBubble(last);
    if (mobileBubbleTimer.current) clearTimeout(mobileBubbleTimer.current);
    mobileBubbleTimer.current = setTimeout(() => setMobileBubble(null), 5000);
  }, [chatMessages]);

  const handleGiroSelect = (giroId: Giro, giroLabel: string) => {
    setGiro(giroId);
    if (!selectedMeerkat || lastGiroShown.current === giroId) return;
    lastGiroShown.current = giroId;
    const msgFn = MEERKAT_GIRO_MSG[selectedMeerkat.id] ?? MEERKAT_GIRO_MSG.custom;
    setChatMessages(prev => [...prev, msgFn(giroLabel)]);
  };

  const handleAgentNameBlur = () => {
    if (step !== 3 || !selectedMeerkat) return;
    const val = agentName.trim();
    if (val.length < 2) return;
    agentNameChatShown.current = true;
    const msgFn = MEERKAT_AGENT_NAME_MSG[selectedMeerkat.id] ?? MEERKAT_AGENT_NAME_MSG.custom;
    setChatMessages(prev => [...prev, msgFn(val)]);
  };

  const handleSelectMeerkat = (roleId: MeerkatRoleId) => {
    if (meerkatRoleId === roleId) { setMeerkatRoleId(null); setAgentName(''); setError(''); return; }
    const role = MEERKAT_MAP[roleId];
    setMeerkatRoleId(roleId);
    setOverlayOpen(false);
    if (role.id !== 'custom') setAgentName(role.nombre);
    else setAgentName('');
    setError('');
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!meerkatRoleId) { setError('Elige un empleado para continuar'); return; }
      setOverlayOpen(false);
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      if (!businessName.trim())  { setError('Escribe el nombre de tu organización'); return; }
      if (!businessDesc.trim())  { setError('Escribe una descripción de la organización'); return; }
      if (!businessPhone.trim() && effectiveJornada !== 'tareas') { setError('Escribe el teléfono de la organización'); return; }
      setStep(4);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!clientFirstName.trim())                           { setError('Escribe tu nombre'); return; }
    if (!clientLastName.trim())                            { setError('Escribe tu apellido'); return; }
    if (!clientEmail.trim() || !clientEmail.includes('@')) { setError('Escribe un correo electrónico válido'); return; }
    if (country === 'mx') {
      const rfcClean = rfc.trim().toUpperCase().replace(/\s/g, '');
      if (rfcClean.length < 12 || rfcClean.length > 13 || !/^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfcClean)) {
        setError('El RFC debe tener 12 o 13 caracteres con formato válido (ej. GALO880506H10)'); return;
      }
      const curpClean = curp.trim().toUpperCase().replace(/\s/g, '');
      if (curpClean.length !== 18) { setError('La CURP debe tener exactamente 18 caracteres'); return; }
    }
    if (!aupAccepted) { setError('Debes aceptar la Política de Uso Aceptable para continuar'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          minutes_tier:           tier,
          business_name:          businessName.trim(),
          business_description:   businessDesc.trim(),
          business_phone_display: businessPhone.trim(),
          giro_template:          giro,
          jornada_type:           effectiveJornada,
          area_code:              effectiveJornada !== 'tareas' ? cityLada || undefined : undefined,
          country:                country,
          agent_name:             agentName.trim() || null,
          client_name:            `${clientFirstName.trim()} ${clientLastName.trim()}`,
          client_email:           clientEmail.trim(),
          meerkat_role_id:        meerkatRoleId ?? undefined,
          rfc:                    country === 'mx' ? rfc.trim().toUpperCase().replace(/\s/g, '') : undefined,
          curp:                   country === 'mx' ? curp.trim().toUpperCase().replace(/\s/g, '') : undefined,
          aup_accepted:           aupAccepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Ocurrió un error'); return; }
      if (data.empresarial) { setSubmitted(true); return; }
      window.location.href = data.url;
    } catch {
      setError('No se pudo conectar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: '12px 16px', color: '#E2D9FF', width: '100%', fontSize: 14, outline: 'none',
  } as const;
  const labelStyle = {
    fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6,
  } as const;

  // ── Empresarial success ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center px-4 overflow-hidden film-grain" style={{ background: 'linear-gradient(140deg, #2A0E6B 0%, #150835 100%)' }}>
        <div className="orb" style={{ width: 500, height: 500, top: -150, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 65%)', ['--orb-dur' as string]: '12s' }} />
        <div className="w-full max-w-md rounded-3xl p-8 text-center"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
            🎯
          </div>
          <h1 className="text-xl font-bold text-white mb-2">¡Solicitud recibida!</h1>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Revisaremos los requisitos de integración de <strong style={{ color: '#fff' }}>{businessName}</strong> y
            te contactaremos en menos de 24 horas con una propuesta a medida.
          </p>
          <div className="flex flex-col gap-2 text-left mb-6">
            {['Revisión de necesidades de integración', 'Propuesta personalizada vía correo', 'Llamada de onboarding con el equipo'].map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                  {i + 1}
                </div>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{s}</span>
              </div>
            ))}
          </div>
          <a href="/" className="block py-3 rounded-2xl text-sm font-semibold text-white text-center transition-opacity hover:opacity-90"
            style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.35)' }}>
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden film-grain" style={{ background: 'linear-gradient(140deg, #2A0E6B 0%, #150835 100%)' }}>
      <div className="orb" style={{ width: 600, height: 600, top: -200, right: -150, background: 'radial-gradient(circle, rgba(108,59,255,0.2) 0%, transparent 65%)', ['--orb-dur' as string]: '13s' }} />
      <div className="orb" style={{ width: 400, height: 400, bottom: 50, left: -120, background: 'radial-gradient(circle, rgba(155,109,255,0.12) 0%, transparent 65%)', ['--orb-dur' as string]: '18s' }} />

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 1 }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center">
            <Image src="/logo-icon.png" alt="Centinelia" width={56} height={56} style={{ width: 56, height: 56, objectFit: 'contain' }} />
          </a>
          {backUrl ? (
            <a href={backUrl} className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <ChevronLeft size={13} /> Devuelta al portal
            </a>
          ) : (
            <a href="/portal/login" className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ¿Ya tienes cuenta? Entra aquí
            </a>
          )}
        </div>
      </div>

      <div className={`${step === 4 ? 'max-w-3xl' : 'max-w-2xl'} mx-auto px-4 py-10`} style={{ position: 'relative', zIndex: 1 }}>

        {/* Step indicator — 4 steps */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, gap: 8 }}>
          {/* Row 1: circles + connectors */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {STEP_LABELS.map((label, i) => {
              const n      = (i + 1) as 1 | 2 | 3 | 4;
              const done   = step > n;
              const active = step === n;
              const canNav = done;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => { if (canNav) { setError(''); if (n === 1) setOverlayOpen(false); setStep(n); } }}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all flex-shrink-0"
                    style={{
                      cursor:     canNav ? 'pointer' : 'default',
                      background: done ? '#6C3BFF' : active ? 'rgba(108,59,255,0.3)' : 'rgba(255,255,255,0.05)',
                      border:     `2px solid ${done || active ? '#6C3BFF' : 'rgba(255,255,255,0.1)'}`,
                      color:      done || active ? '#fff' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {done ? <Check size={11} /> : n}
                  </button>
                  {i < 3 && (
                    <div className="w-4 sm:w-14 h-px mx-0.5 sm:mx-1 flex-shrink-0"
                      style={{ background: step > n + 1 ? '#6C3BFF' : 'rgba(255,255,255,0.08)' }} />
                  )}
                </div>
              );
            })}
          </div>
          {/* Row 2: labels — hidden on mobile to avoid overlap, visible on sm+ */}
          <div className="hidden sm:flex" style={{ alignItems: 'flex-start' }}>
            {STEP_LABELS.map((label, i) => {
              const n      = (i + 1) as 1 | 2 | 3 | 4;
              const done   = step > n;
              const active = step === n;
              const canNav = done;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div className="w-8 flex-shrink-0" style={{ position: 'relative', height: 20 }}>
                    <button
                      type="button"
                      onClick={() => { if (canNav) { setError(''); if (n === 1) setOverlayOpen(false); setStep(n); } }}
                      className="text-[11px] font-medium leading-tight"
                      style={{
                        position:            'absolute',
                        left:                '50%',
                        transform:           'translateX(-50%)',
                        whiteSpace:          'nowrap',
                        cursor:              canNav ? 'pointer' : 'default',
                        background:          'none',
                        border:              'none',
                        padding:             0,
                        color:               active ? '#9B6DFF' : done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                        textDecoration:      canNav ? 'underline' : 'none',
                        textUnderlineOffset: 2,
                      }}
                    >
                      {label}
                    </button>
                  </div>
                  {i < 3 && <div className="w-14 mx-1 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
          {/* Mobile: single step line — no overlap risk */}
          <p className="sm:hidden text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Paso {step} de 4
            <span style={{ color: '#9B6DFF' }}> · {STEP_LABELS[step - 1]}</span>
          </p>
        </div>

        {canceled && (
          <div className="mb-6 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
            La contratación no se completó. Tu Centinelia sigue esperándote. Puedes retomar el proceso cuando quieras.
          </div>
        )}

        {/* ── STEP 1: Elige tu empleado ────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Tu equipo Centinelia</h1>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Cada Centinelia domina una especialidad. Juntos forman un equipo extraordinario.
            </p>

            {/* Director General duo — Nox + Niva (featured 2-col grid above specialists) */}
            <div className="mb-3">
              <div className="grid grid-cols-2 gap-3 mb-2">
                {(['nox', 'niva'] as const).map(dirId => {
                  const dir = MEERKAT_MAP[dirId];
                  const sel = meerkatRoleId === dirId;
                  return (
                    <button
                      key={dirId}
                      type="button"
                      onClick={() => { handleSelectMeerkat(dirId); }}
                      style={{
                        background:    sel ? `${dir.color}18` : 'rgba(255,255,255,0.03)',
                        border:        `2px solid ${sel ? dir.color : 'rgba(255,255,255,0.07)'}`,
                        borderRadius:  16,
                        padding:       0,
                        cursor:        'pointer',
                        transition:    'border-color 0.15s, background 0.15s, transform 0.1s',
                        transform:     sel ? 'scale(1.02)' : 'scale(1)',
                        overflow:      'hidden',
                        display:       'flex',
                        flexDirection: 'column',
                        alignItems:    'center',
                        textAlign:     'center',
                      }}
                    >
                      {/* Image */}
                      <div style={{ width: '100%', aspectRatio: '1', position: 'relative', overflow: 'hidden', background: '#F4F0FF' }}>
                        <img
                          src={dir.imagen!}
                          alt={dir.nombre}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }}
                        />
                        {sel && (
                          <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: dir.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={11} color="#fff" />
                          </div>
                        )}
                        {/* Director badge */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 8px 5px', background: `linear-gradient(to top, ${dir.color}ee, ${dir.color}55)` }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                            Director{dir.genero === 'F' ? 'a' : ''} General
                          </span>
                        </div>
                      </div>
                      {/* Text */}
                      <div style={{ padding: '10px 8px 12px', width: '100%', background: 'rgba(255,255,255,0.07)' }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#fff', lineHeight: 1.2 }}>{dir.nombre}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: lightenColor(dir.color, 0.45), marginTop: 4, lineHeight: 1.3 }}>
                          {dir.tagline}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Inline panel for selected director */}
              {(meerkatRoleId === 'nox' || meerkatRoleId === 'niva') && selectedMeerkat && (() => {
                const preview = ROLE_PREVIEW[selectedMeerkat.id as keyof typeof ROLE_PREVIEW];
                if (!preview) return null;
                return (
                  <div className="rounded-2xl overflow-hidden"
                    style={{ border: `1px solid ${selectedMeerkat.color}50`, background: `${selectedMeerkat.color}18` }}>
                    <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${selectedMeerkat.color}35` }}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{selectedMeerkat.nombre}</div>
                          <div style={{ fontSize: 11, color: lightenColor(selectedMeerkat.color, 0.45), fontWeight: 600, marginTop: 2 }}>{selectedMeerkat.rol}</div>
                        </div>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', maxWidth: 180, textAlign: 'right', lineHeight: 1.45, flexShrink: 0 }}>
                          {selectedMeerkat.descripcion}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                        {preview.subtitle}
                      </p>
                      <div className="flex flex-col gap-1.5 mb-4">
                        {preview.bullets.map(b => (
                          <div key={b} className="flex items-center gap-2">
                            <Check size={10} style={{ color: lightenColor(selectedMeerkat.color, 0.45), flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{b}</span>
                          </div>
                        ))}
                      </div>
                      <CapabilityChipsRegistro
                        features={selectedMeerkat.features as Record<string, unknown>}
                        color={selectedMeerkat.color}
                        isCoordinator={true}
                      />
                      {/* Price summary — visible on mobile */}
                      <div className="sm:hidden mb-5 rounded-xl px-3 py-2.5"
                        style={{ background: `${selectedMeerkat.color}14`, border: `1px solid ${selectedMeerkat.color}28` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
                          <span>Instalación</span>
                          <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>$14,990 + IVA</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                          <span>Mensualidad</span>
                          <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>desde $2,997 + IVA/mes</span>
                        </div>
                      </div>
                      <button
                        onClick={handleNext}
                        className="sm:hidden w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                        style={{ background: `linear-gradient(135deg, ${selectedMeerkat.color}, ${selectedMeerkat.color}99)` }}
                      >
                        Continuar con {selectedMeerkat.nombre} <ChevronRight size={15} />
                      </button>
                      <button
                        onClick={() => setOverlayOpen(true)}
                        className="hidden sm:flex w-full py-3 rounded-xl font-semibold text-sm text-white items-center justify-center gap-2 transition-opacity hover:opacity-90"
                        style={{ background: `linear-gradient(135deg, ${selectedMeerkat.color}, ${selectedMeerkat.color}99)` }}
                      >
                        Continuar con {selectedMeerkat.nombre} <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Divider before the specialists grid */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Equipo Especializado
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* Grid split into rows of 3 with inline capabilities panel */}
            <div className="flex flex-col gap-1 mb-6">
              {[0, 1, 2].map(rowIdx => {
                const rowRoles = GRID_ROLES.slice(rowIdx * 3, rowIdx * 3 + 3);
                const selectedIndex = meerkatRoleId
                  ? GRID_ROLES.findIndex(r => r.id === meerkatRoleId)
                  : -1;
                const panelVisible = selectedIndex >= 0 && Math.floor(selectedIndex / 3) === rowIdx;

                return (
                  <div key={rowIdx}>
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      {rowRoles.map(role => (
                        <MeerkatCard
                          key={role.id}
                          roleId={role.id}
                          selected={meerkatRoleId === role.id}
                          onClick={() => { handleSelectMeerkat(role.id); }}
                        />
                      ))}
                    </div>

                    {/* Inline capabilities panel */}
                    {panelVisible && selectedMeerkat && (
                      <div className="rounded-2xl overflow-hidden mb-2"
                        style={{
                          border: `1px solid ${selectedMeerkat.color}50`,
                          background: `${selectedMeerkat.color}18`,
                        }}>

                        {selectedMeerkat.id !== 'custom' ? (
                          <>
                            <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${selectedMeerkat.color}35` }}>
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{selectedMeerkat.nombre}</div>
                                  <div style={{ fontSize: 11, color: lightenColor(selectedMeerkat.color, 0.45), fontWeight: 600, marginTop: 2 }}>{selectedMeerkat.rol}</div>
                                </div>
                                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', maxWidth: 180, textAlign: 'right', lineHeight: 1.45, flexShrink: 0 }}>
                                  {selectedMeerkat.descripcion}
                                </p>
                              </div>
                            </div>
                            <div className="px-4 py-3">
                              {ROLE_PREVIEW[selectedMeerkat.id as keyof typeof ROLE_PREVIEW] && (() => {
                                const preview = ROLE_PREVIEW[selectedMeerkat.id as keyof typeof ROLE_PREVIEW]!;
                                return (
                                  <>
                                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                                      {preview.subtitle}
                                    </p>
                                    <div className="flex flex-col gap-1.5 mb-4">
                                      {preview.bullets.map(b => (
                                        <div key={b} className="flex items-center gap-2">
                                          <Check size={10} style={{ color: lightenColor(selectedMeerkat.color, 0.45), flexShrink: 0 }} />
                                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{b}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <CapabilityChipsRegistro
                                      features={selectedMeerkat.features as Record<string, unknown>}
                                      color={selectedMeerkat.color}
                                      isCoordinator={false}
                                    />
                                  </>
                                );
                              })()}
                              {/* Mobile: price + go straight to next step */}
                              <div className="sm:hidden mb-5 rounded-xl px-3 py-2.5"
                                style={{ background: `${selectedMeerkat.color}14`, border: `1px solid ${selectedMeerkat.color}28` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
                                  <span>Instalación</span>
                                  <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>$14,990 + IVA</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                                  <span>Mensualidad</span>
                                  <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>desde $2,997 + IVA/mes</span>
                                </div>
                              </div>
                              <button
                                onClick={handleNext}
                                className="sm:hidden w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                                style={{ background: `linear-gradient(135deg, ${selectedMeerkat.color}, #9B6DFF)` }}
                              >
                                Continuar con {selectedMeerkat.nombre} <ChevronRight size={15} />
                              </button>
                              {/* Desktop: open full overlay */}
                              <button
                                onClick={() => setOverlayOpen(true)}
                                className="hidden sm:flex w-full py-3 rounded-xl font-semibold text-sm text-white items-center justify-center gap-2 transition-opacity hover:opacity-90"
                                style={{ background: `linear-gradient(135deg, ${selectedMeerkat.color}, #9B6DFF)` }}
                              >
                                Continuar con {selectedMeerkat.nombre} <ChevronRight size={15} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="px-4 py-3 flex flex-col gap-3">
                            <div style={{ borderBottom: `1px solid ${selectedMeerkat.color}35`, paddingBottom: 10, marginBottom: 2 }}>
                              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{selectedMeerkat.nombre}</div>
                              <div style={{ fontSize: 11, color: lightenColor(selectedMeerkat.color, 0.45), fontWeight: 600, marginTop: 2 }}>{selectedMeerkat.rol}</div>
                            </div>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                              Configurarás manualmente el rol, las capacidades y el comportamiento desde tu portal.
                            </p>
                            {/* Mobile */}
                            <button
                              onClick={handleNext}
                              className="sm:hidden w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                              style={{ background: `linear-gradient(135deg, ${selectedMeerkat.color}, #9ca3af)` }}
                            >
                              Continuar <ChevronRight size={15} />
                            </button>
                            {/* Desktop */}
                            <button
                              onClick={() => setOverlayOpen(true)}
                              className="hidden sm:flex w-full py-3 rounded-xl font-semibold text-sm text-white items-center justify-center gap-2 transition-opacity hover:opacity-90"
                              style={{ background: `linear-gradient(135deg, ${selectedMeerkat.color}, #9ca3af)` }}
                            >
                              Ver detalles <ChevronRight size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <p className="mb-4 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                {error}
              </p>
            )}

            {/* Centinelia Empresarial — expandable */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                type="button"
                onClick={() => setEmpresarialOpen(v => !v)}
                className="w-full rounded-2xl transition-all text-left flex items-center justify-between gap-4"
                style={{
                  background: empresarialOpen ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.06)',
                  border: `1px solid ${empresarialOpen ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.18)'}`,
                  padding: '14px 18px', cursor: 'pointer',
                  borderRadius: empresarialOpen ? '16px 16px 0 0' : 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 3 }}>
                    Centinelia Empresarial
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.45 }}>
                    Múltiples empleados, sucursales e integraciones con tu sistema
                  </div>
                </div>
                <ChevronDown
                  size={15}
                  style={{
                    color: 'rgba(245,158,11,0.6)', flexShrink: 0,
                    transition: 'transform 0.2s',
                    transform: empresarialOpen ? 'rotate(180deg)' : 'none',
                  }}
                />
              </button>

              {empresarialOpen && (
                <div style={{
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  borderTop: 'none',
                  borderRadius: '0 0 16px 16px',
                  padding: '16px 18px 18px',
                }}>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 14 }}>
                    Para organizaciones con múltiples sucursales, franquicias o que requieren integraciones con su propio sistema (POS, CRM, ERP). Cada sucursal puede tener su propio empleado con portal independiente.
                  </p>
                  <div className="flex flex-col gap-2 mb-5">
                    {AGENT_PLANS.find(p => p.id === 'empresarial')!.features.map(f => (
                      <div key={f.label} className="flex items-start gap-2">
                        <Check size={11} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{f.label}</span>
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1, lineHeight: 1.45 }}>{f.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPlan('empresarial'); setMeerkatRoleId(null); setError(''); setStep(3); }}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}
                  >
                    Solicitar propuesta Empresarial <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Minutos / Ops ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              {isCoordinator
                ? <>{`¿Cuánto coordinará ${selectedMeerkat!.nombre}`}<br />cada mes?</>
                : <>{`¿Cuánto trabajará ${selectedMeerkat?.nombre ?? 'tu empleado'}`}<br />cada mes?</>
              }
            </h1>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isCoordinator
                ? `${selectedMeerkat?.nombre ?? 'El director'} no realiza llamadas. Su jornada depende del volumen de tareas inteligentes que realizará para tu organización. Puedes ajustarlo cuando quieras desde el portal, sin permanencia.`
                : 'Empieza con la jornada que tu organización necesita. Siempre podrás ampliarla cuando tu equipo crezca, sin permanencia.'
              }
            </p>

            {/* Jornada type tabs — only for non-coordinator employees */}
            {!isCoordinator && (
              <div className="flex gap-2 mb-4" style={{ paddingTop: 20 }}>
                {([
                  { id: 'combinada', label: 'Combinada',    icon: <><Clock size={10} /><Zap size={10} /></> },
                  { id: 'minutos',   label: 'Solo minutos', icon: <Clock size={10} /> },
                  { id: 'tareas',    label: 'Solo tareas',  icon: <Zap size={10} /> },
                ] as const).map(j => {
                  const sel = jornada === j.id;
                  return (
                    <button key={j.id} type="button" onClick={() => setJornada(j.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: sel ? 'rgba(108,59,255,0.2)' : 'rgba(255,255,255,0.05)',
                        border:     `1.5px solid ${sel ? '#6C3BFF' : 'rgba(255,255,255,0.08)'}`,
                        color:      sel ? '#9B6DFF' : 'rgba(255,255,255,0.45)',
                      }}>
                      <span className="flex items-center gap-0.5 flex-shrink-0">{j.icon}</span>
                      <span>{j.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Standard tiers */}
            {!isCoordinator && (
              <div className="flex flex-col gap-3 mb-6">
                {TIERS.map(t => {
                  const sel   = tier === t.id;
                  const alloc = JORNADA_CONFIG[jornada][t.id];
                  return (
                    <div key={t.id} onClick={() => setTier(t.id)}
                      className="rounded-xl cursor-pointer transition-all"
                      style={{
                        position: 'relative',
                        background: sel ? 'rgba(108,59,255,0.14)' : 'rgba(255,255,255,0.03)',
                        border: `2px solid ${sel ? '#6C3BFF' : 'rgba(255,255,255,0.07)'}`,
                        padding: '16px 20px',
                        display: 'flex', alignItems: 'center', gap: 16,
                      }}>
                      {t.popular && (
                        <div style={{
                          position: 'absolute', top: -1, right: 16,
                          background: '#6C3BFF',
                          borderRadius: '0 0 5px 5px',
                          padding: '2px 8px 3px',
                          fontSize: 8, fontWeight: 700,
                          color: '#fff', letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          Más usado
                        </div>
                      )}
                      {/* Radio */}
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{ borderColor: sel ? '#6C3BFF' : 'rgba(255,255,255,0.2)', background: sel ? '#6C3BFF' : 'transparent' }}>
                        {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      {/* Label + bullets */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm mb-2">{t.label}</p>
                        <div className="flex flex-col gap-1">
                          {alloc.minutes > 0 && (
                            <p className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              <Clock size={11} style={{ flexShrink: 0 }} />
                              Hasta {alloc.minutes} minutos de conversación al mes
                            </p>
                          )}
                          <p className="text-xs flex items-center gap-1.5" style={{ color: sel ? '#9B6DFF' : 'rgba(255,255,255,0.4)' }}>
                            <Zap size={11} style={{ flexShrink: 0 }} />
                            {alloc.aiOps} tareas inteligentes{jornada === 'minutos' && alloc.aiOps <= 20 ? ' (buffer)' : ''}
                          </p>
                        </div>
                      </div>
                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold tabular-nums" style={{ fontSize: 17, color: sel ? '#9B6DFF' : '#fff' }}>
                          {priceFmt(t.price)}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}> + IVA/mes</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Nox ops-only tiers */}
            {isCoordinator && (
              <div className="flex flex-col gap-3 mb-6" style={{ paddingTop: 20 }}>
                {NOX_TIERS.map(t => {
                  const sel = tier === t.id;
                  return (
                    <div key={t.id} onClick={() => setTier(t.id)}
                      className="rounded-xl cursor-pointer transition-all flex items-center gap-4 px-4 py-3.5"
                      style={{ position: 'relative', background: sel ? `${roleColor}18` : 'rgba(255,255,255,0.03)', border: `2px solid ${sel ? roleColor : 'rgba(255,255,255,0.07)'}` }}>
                      {/* Radio */}
                      <div className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all"
                        style={{ borderColor: sel ? roleColor : 'rgba(255,255,255,0.2)', background: sel ? roleColor : 'transparent' }}>
                        {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      {/* Label + desc */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-base leading-tight">
                          {t.label}
                        </p>
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: sel ? lightenColor(roleColor, 0.45) : 'rgba(255,255,255,0.4)' }}>
                          <Zap size={10} style={{ flexShrink: 0 }} />{t.aiOps.toLocaleString('es-MX')} tareas inteligentes
                        </p>
                        <p className="text-xs mt-1.5" style={{ color: sel ? lightenColor(roleColor, 0.45) : 'rgba(255,255,255,0.38)' }}>{t.desc}</p>
                      </div>
                      {t.popular && (
                        <div style={{
                          position: 'absolute', top: -1, right: 14,
                          background: roleColor,
                          borderRadius: '0 0 5px 5px',
                          padding: '2px 8px 3px',
                          fontSize: 8, fontWeight: 700,
                          color: '#fff', letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          Más usado
                        </div>
                      )}
                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold tabular-nums" style={{ fontSize: 17, color: sel ? lightenColor(roleColor, 0.45) : '#fff', display: 'block' }}>
                          {priceFmt(t.price)}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}> + IVA/mes</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs mb-6 text-center" style={{ color: 'rgba(255,255,255,0.28)' }}>
              {isCoordinator
                ? <>Si {selectedMeerkat?.nombre ?? 'el director'} necesita trabajar más,<br />puedes comprar más tareas desde tu portal de cliente.</>
                : <>Si {selectedMeerkat?.nombre ?? 'tu empleado'} necesita trabajar más,<br />puedes comprar saldo desde tu portal de cliente.</>
              }
            </p>

            <div className="flex gap-3">
              <button onClick={() => { setError(''); setStep(1); }}
                className="flex items-center gap-1 px-4 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button onClick={handleNext}
                className="flex-1 py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: isCoordinator ? `linear-gradient(135deg, ${roleColor}, ${lightenColor(roleColor, 0.3)})` : 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}>
                Asignar {isCoordinator ? selectedNoxTier.label : selectedTier.label} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Business info ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              {`Cuéntale a ${selectedMeerkat?.nombre ?? 'tu empleado'} sobre tu organización`}
            </h1>
            <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isCoordinator
                ? `${selectedMeerkat?.nombre ?? 'El director'} usará esta información para coordinar y reportar al equipo.`
                : 'Mientras más conozca tu organización, mejores decisiones podrá tomar.'
              }
            </p>

            <div className="flex flex-col gap-5">
              <div>
                <label style={labelStyle}>¿Cómo se llama tu organización? *</label>
                <div className="relative">
                  <Building2 size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)} onBlur={() => handleFieldBlur('name')} placeholder="Ej. Clínica San Rafael, UAdeNL, Municipio de Monterrey…" style={{ ...inputStyle, paddingLeft: 40 }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Sector o industria *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                  {GIROS.map(g => (
                    <button key={g.id} type="button" onClick={() => handleGiroSelect(g.id, g.label)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all"
                      style={{
                        background: giro === g.id ? 'rgba(108,59,255,0.2)' : 'rgba(255,255,255,0.04)',
                        border:     `1px solid ${giro === g.id ? '#6C3BFF' : 'rgba(255,255,255,0.08)'}`,
                        color:      giro === g.id ? '#9B6DFF' : 'rgba(255,255,255,0.5)',
                        fontWeight: giro === g.id ? 600 : 400,
                      }}>
                      <g.icon size={14} color={giro === g.id ? '#9B6DFF' : 'rgba(255,255,255,0.4)'} />
                      <span className="text-xs">{g.label}</span>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => handleGiroSelect(GIRO_GENERAL.id, GIRO_GENERAL.label)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: giro === 'general' ? 'rgba(108,59,255,0.2)' : 'rgba(255,255,255,0.04)',
                    border:     `1px solid ${giro === 'general' ? '#6C3BFF' : 'rgba(255,255,255,0.08)'}`,
                    color:      giro === 'general' ? '#9B6DFF' : 'rgba(255,255,255,0.5)',
                    fontWeight: giro === 'general' ? 600 : 400,
                  }}>
                  <GIRO_GENERAL.icon size={14} color={giro === 'general' ? '#9B6DFF' : 'rgba(255,255,255,0.4)'} />
                  <span className="text-xs">{GIRO_GENERAL.label}</span>
                </button>
              </div>

              <div>
                <label style={labelStyle}>¿Cómo le describirías tu organización a un nuevo empleado? *</label>
                <textarea
                  value={businessDesc}
                  onChange={e => setBusinessDesc(e.target.value)}
                  onBlur={() => handleFieldBlur('desc')}
                  placeholder={`Imagina que hoy es el primer día de trabajo de ${selectedMeerkat?.nombre ?? 'tu empleado'}.\n\nExplícale qué hace tu organización, qué vende, cuáles son sus horarios y cualquier información importante que debería conocer.`}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* Country + area code — only for agents with voice channel */}
              {!isCoordinator && effectiveJornada !== 'tareas' && (
                <div className="flex flex-col gap-3">
                  <label style={labelStyle}>
                    País de la organización
                    <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(para asignar un número local)</span>
                  </label>
                  <div className="flex gap-2">
                    {COUNTRIES.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { handleCountryChange(c.id); setCountryClicked(true); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all flex-1 justify-center"
                        style={{
                          background: country === c.id ? 'rgba(108,59,255,0.2)' : 'rgba(255,255,255,0.04)',
                          border:     `1px solid ${country === c.id ? '#6C3BFF' : 'rgba(255,255,255,0.08)'}`,
                          color:      country === c.id ? '#9B6DFF' : 'rgba(255,255,255,0.5)',
                          fontWeight: country === c.id ? 600 : 400,
                          cursor:     'pointer',
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{c.flag}</span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 6 }}>
                      {countryDef.codeLabel} de la organización
                    </label>
                    <CitySelect
                      value={cityLada}
                      onChange={setCityLada}
                      cities={citiesList}
                      searchPlaceholder={countryDef.placeholder}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>
                  Teléfono de la organización{effectiveJornada !== 'tareas' ? ' *' : ''}
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>
                    {effectiveJornada === 'tareas'
                      ? '(opcional, para referencia interna)'
                      : isCoordinator ? '(para contacto y reportes)' : '(tu empleado lo menciona en llamadas)'}
                  </span>
                </label>
                <div className="relative">
                  <Phone size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} onBlur={() => handleFieldBlur('phone')} placeholder="Ej. 81 1234 5678" style={{ ...inputStyle, paddingLeft: 40 }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>¿Cómo quieres llamarlo?</label>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 8, marginTop: -4 }}>
                  Puedes personalizar el nombre de tu Centinelia.
                </p>
                <input
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  onBlur={handleAgentNameBlur}
                  placeholder={selectedMeerkat && selectedMeerkat.id !== 'custom' ? selectedMeerkat.nombre : 'Ej. Ana, Carlos, Sofía…'}
                  style={inputStyle}
                />
              </div>
            </div>

            {error && (
              <p className="mt-4 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                {error}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setError(''); setStep(2); }}
                className="flex items-center gap-1 px-4 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button onClick={handleNext}
                className="flex-1 py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}>
                Continuar <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Contact + summary ─────────────────────────────────────────── */}
        {step === 4 && (
          <div className="grid sm:grid-cols-2 gap-6 items-start">

            {/* LEFT — Form */}
            <div>
              <h1 className="text-xl font-bold text-white mb-1">Solo falta crear tu acceso</h1>
              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Crearemos tu portal de administración para que puedas supervisar a tu equipo Centinelia.
              </p>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={labelStyle}>Nombre(s) *</label>
                    <div className="relative">
                      <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                      <input value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} placeholder="Juan" style={{ ...inputStyle, paddingLeft: 40 }} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Apellido(s) *</label>
                    <input value={clientLastName} onChange={e => setClientLastName(e.target.value)} placeholder="García López" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>
                    Correo electrónico *
                    <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>(acceso al portal)</span>
                  </label>
                  <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="tu@correo.com" style={inputStyle} />
                </div>
                {country === 'mx' && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: -4 }}>
                      Verificación de identidad (requerida por Política de Uso Aceptable)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label style={labelStyle}>RFC *</label>
                        <input
                          value={rfc}
                          onChange={e => setRfc(e.target.value.toUpperCase())}
                          placeholder="GALO880506H10"
                          maxLength={13}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>CURP *</label>
                        <input
                          value={curp}
                          onChange={e => setCurp(e.target.value.toUpperCase())}
                          placeholder="GALO880506HNLRPR01"
                          maxLength={18}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setAupAccepted(v => !v)}
                  onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAupAccepted(v => !v); } }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                    padding: '10px 12px', borderRadius: 10,
                    background: aupAccepted ? 'rgba(108,59,255,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${aupAccepted ? 'rgba(108,59,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    background: aupAccepted ? '#6C3BFF' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${aupAccepted ? '#6C3BFF' : 'rgba(255,255,255,0.15)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}>
                    {aupAccepted && <Check size={10} color="#fff" strokeWidth={3} />}
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55, userSelect: 'none' }}>
                    He leído y acepto la{' '}
                    <a href="/legal#aup" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ color: '#9B6DFF', textDecoration: 'underline' }}>
                      Política de Uso Aceptable
                    </a>.
                    Entiendo que el uso de Centinelia para actividades ilegales resulta en la rescisión inmediata del servicio.
                  </p>
                </div>
              </div>

              {error && (
                <p className="mt-3 text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  {error}
                </p>
              )}

              {plan !== 'empresarial' && (
                <p className="text-center text-sm mt-5 mb-1" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  Hoy estás incorporando a{' '}
                  <strong style={{ color: '#fff' }}>
                    {agentName || selectedMeerkat?.nombre || 'tu empleado'}
                  </strong>{' '}
                  a tu organización.
                </p>
              )}
              <div className={plan !== 'empresarial' ? 'flex gap-3 mt-3' : 'flex gap-3 mt-5'}>
                <button onClick={() => { setError(''); setStep(3); }}
                  className="flex items-center gap-1 px-4 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <ChevronLeft size={16} /> Atrás
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="flex-1 py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                  style={{
                    background: plan === 'empresarial' ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : `linear-gradient(135deg, ${roleColor}, #9B6DFF)`,
                    opacity:    loading ? 0.6 : 1,
                  }}>
                  {loading
                    ? <><Loader size={15} className="animate-spin" /> Procesando…</>
                    : plan === 'empresarial'
                      ? <>Enviar solicitud <ChevronRight size={16} /></>
                      : <>Completar contratación <ChevronRight size={16} /></>
                  }
                </button>
              </div>

              <p className="text-center text-xs mt-3" style={{ color: 'rgba(255,255,255,0.22)', lineHeight: 1.6 }}>
                {plan !== 'empresarial' && <>Pago seguro procesado por Stripe · Precios en MXN<br /></>}
                Al continuar aceptas nuestros{' '}
                <a href="/legal" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>Términos y Condiciones</a>
                {' '}y el{' '}
                <a href="/privacidad-datos" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>Aviso de Privacidad</a>.
              </p>
            </div>

            {/* RIGHT — Expediente de contratación */}
            {plan !== 'empresarial' ? (
              <div className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${roleColor}38`, background: `${roleColor}08` }}>

                {/* Header label */}
                <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)' }}>
                    Expediente de contratación
                  </p>
                </div>

                {/* Employee hero */}
                <div className="relative flex justify-center items-end" style={{ minHeight: 130, background: `${roleColor}10` }}>
                  <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 90%, ${roleColor}30 0%, transparent 70%)` }} />
                  {selectedMeerkat && selectedMeerkat.id !== 'custom' ? (
                    selectedMeerkat.imagen
                      ? <img src={selectedMeerkat.imagen} alt={selectedMeerkat.nombre}
                          style={{ height: 130, objectFit: 'contain', objectPosition: 'bottom', position: 'relative', zIndex: 1 }} />
                      : <div style={{ width: 70, height: 70, borderRadius: 18, marginBottom: 16, background: `${roleColor}25`, border: `1px solid ${roleColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: roleColor, position: 'relative', zIndex: 1 }}>{selectedMeerkat.nombre[0]}</div>
                  ) : (
                    <div style={{ width: 70, height: 70, borderRadius: 18, marginBottom: 16, background: `${roleColor}18`, border: `1px solid ${roleColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                      <span style={{ fontSize: 26, color: roleColor, fontWeight: 900 }}>C</span>
                    </div>
                  )}
                </div>

                {/* Name + status badge */}
                <div className="text-center px-5 pt-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="font-bold text-white" style={{ fontSize: 15 }}>
                    {agentName || selectedMeerkat?.nombre || 'Tu empleado'}
                  </p>
                  {selectedMeerkat && selectedMeerkat.id !== 'custom' && (
                    <p className="text-xs mt-0.5" style={{ color: lightenColor(roleColor, 0.45) }}>{selectedMeerkat.rol}</p>
                  )}
                  <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full"
                    style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.22)' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.7)', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#4ade80' }}>{selectedMeerkat?.genero === 'F' ? 'Lista' : 'Listo'} para incorporarse</span>
                  </div>
                </div>

                {/* Expediente fields */}
                <div style={{ padding: '14px 18px 18px' }}>
                  {[
                    { label: 'Cargo',          value: selectedMeerkat?.id !== 'custom' ? (selectedMeerkat?.rol ?? 'Personalizado') : 'Personalizado' },
                    { label: 'Jornada',        value: isCoordinator ? `${selectedNoxTier.label} tareas` : `${selectedTier.label} · ${jornada === 'tareas' ? 'solo tareas' : jornada === 'minutos' ? 'solo minutos' : 'combinada'}` },
                    { label: 'Organización',   value: businessName || '—' },
                    { label: 'Inicio',         value: 'Hoy' },
                    { label: 'Estado',         value: 'Activo al completar' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.33)', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', textAlign: 'right' }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Price summary */}
                <div style={{ margin: '0 14px 14px', borderRadius: 12, background: `${roleColor}14`, border: `1px solid ${roleColor}28`, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                      Instalación <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>(único)</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)', tabularNums: true } as React.CSSProperties}>{priceFmt(selectedAgentPlan.setupFee)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 10, borderBottom: `1px solid ${roleColor}28` }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                      Mensualidad <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>({isCoordinator ? selectedNoxTier.label : selectedTier.label})</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{priceFmt(monthlyPrice)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10 }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Total hoy c/IVA</p>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>Después: {priceFmt(Math.round(monthlyPrice * 1.16))}/mes</p>
                    </div>
                    <span style={{ fontSize: 22, fontWeight: 800, color: roleColor, letterSpacing: '-0.02em' }}>
                      {priceFmt(Math.round((selectedAgentPlan.setupFee + monthlyPrice) * 1.16))}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)' }}>
                <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#f59e0b' }}>Centinelia Empresarial</span>
                  </div>
                  <p className="text-xl font-bold text-white">Cotización personalizada</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    Según tu industria, sistema actual e integraciones requeridas
                  </p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Al enviar tu solicitud nuestro equipo revisará tus necesidades y te contactará en menos de 24 horas con una propuesta detallada y precio final.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    {/* ── DESKTOP EMPLOYEE DETAIL OVERLAY ─────────────────────────────────── */}
    {step === 1 && selectedMeerkat && overlayOpen && (
      <div
        className="hidden sm:block fixed inset-0 z-50"
        style={{ background: 'linear-gradient(140deg, #2A0E6B 0%, #150835 100%)' }}
      >
        {/* Top bar — floats over columns */}
        <div
          className="absolute top-0 left-0 right-0 flex items-start z-10"
          style={{ padding: '14px 32px' }}
        >
          {/* Spacer matching the lila column — button appears right at the color change */}
          <div style={{ width: 'calc(38% + 12px)', flexShrink: 0 }} />
          <button
            type="button"
            onClick={() => setOverlayOpen(false)}
            className="flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
            style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 26 }}
          >
            <ChevronLeft size={15} /> Cambiar empleado
          </button>

          <div className="flex-1" />

          <Image
            src="/logo-icon.png"
            alt="Centinelia"
            width={72}
            height={72}
            style={{ width: 72, height: 72, objectFit: 'contain' }}
          />
        </div>

        {/* Three columns — full overlay height */}
        <div className="absolute inset-0 flex overflow-hidden">

          {/* Col 1 — Image */}
          <div className="relative flex-none" style={{
            width: '38%', background: '#F4F0FF',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black 62%, rgba(0,0,0,0.92) 74%, rgba(0,0,0,0.65) 84%, rgba(0,0,0,0.2) 94%, transparent 100%)',
            maskImage:       'linear-gradient(to right, black 0%, black 62%, rgba(0,0,0,0.92) 74%, rgba(0,0,0,0.65) 84%, rgba(0,0,0,0.2) 94%, transparent 100%)',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse at 55% 88%, ${selectedMeerkat.color}28 0%, transparent 55%)`,
            }} />
            {selectedMeerkat.imagen ? (
              <Image
                src={selectedMeerkat.imagen}
                alt={selectedMeerkat.nombre}
                fill
                sizes="38vw"
                style={{
                  objectFit: 'contain',
                  objectPosition: 'bottom center',
                }}
                priority
              />
            ) : (
              <div className="flex items-end justify-center h-full pb-16">
                <div style={{
                  width: 120, height: 120, borderRadius: 32,
                  background: `${selectedMeerkat.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 52, fontWeight: 900, color: selectedMeerkat.color,
                }}>
                  {selectedMeerkat.nombre[0]}
                </div>
              </div>
            )}
          </div>

          {/* Col 2 — Personality */}
          <div
            className="flex-none flex flex-col overflow-y-auto"
            style={{ width: '31%', padding: '84px 44px 52px' }}
          >
            <p style={{
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: selectedMeerkat.color, marginBottom: 14,
            }}>
              {selectedMeerkat.rol || 'Personalizado'}
            </p>
            <h2 style={{
              fontSize: 'clamp(3rem, 4.2vw, 5.5rem)',
              fontWeight: 800, color: '#fff',
              lineHeight: 0.92, marginBottom: 24,
              letterSpacing: '-0.03em',
            }}>
              {selectedMeerkat.nombre}
            </h2>

            {selectedMeerkat.id !== 'custom' && selectedMeerkat.tagline && (
              <>
                <p style={{
                  fontStyle: 'italic', fontSize: '1rem',
                  color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, marginBottom: 18,
                }}>
                  "{selectedMeerkat.tagline}"
                </p>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, marginBottom: 38,
                }}>
                  {selectedMeerkat.personalidad}
                </p>
              </>
            )}

            {selectedMeerkat.id === 'custom' && (
              <>
                <p style={{
                  fontStyle: 'italic', fontSize: '1rem',
                  color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, marginBottom: 18,
                }}>
                  "Sin moldes. Sin restricciones."
                </p>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, marginBottom: 38,
                }}>
                  Diseña al empleado exactamente como lo necesitas: nombre, voz, rol, personalidad, capacidades y guion de conversación. Todo lo defines desde el portal, sin depender de un perfil preestablecido.
                </p>
              </>
            )}

            {selectedMeerkat.id !== 'custom' && ROLE_PREVIEW[selectedMeerkat.id as keyof typeof ROLE_PREVIEW] && (() => {
              const preview = ROLE_PREVIEW[selectedMeerkat.id as keyof typeof ROLE_PREVIEW]!;
              return (
                <div>
                  <p style={{
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.5)', marginBottom: 14,
                  }}>
                    {preview.subtitle}
                  </p>
                  <div className="flex flex-col gap-3">
                    {preview.bullets.map(b => (
                      <div key={b} className="flex items-center gap-2.5">
                        <Check size={12} style={{ color: selectedMeerkat.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          </div>

          {/* Col 3 — Price + Features + CTA */}
          <div
            className="flex-none flex flex-col overflow-y-auto"
            style={{ width: '31%', borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '84px 44px 52px' }}
          >
            <div className="flex-1">
              <p style={{
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: selectedMeerkat.id === 'custom' ? '#9ca3af' : '#9B6DFF', marginBottom: 14,
              }}>
                {selectedMeerkat.id === 'custom' ? 'Empleado Personalizado' : 'Empleado Centinelia'}
              </p>
              <div className="flex items-baseline gap-2 mb-1">
                <span style={{ fontSize: '2.6rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.025em' }}>
                  $14,990
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>MXN + IVA</span>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>
                Pago único de instalación · sin contrato mínimo
              </p>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 22, marginBottom: 32 }}>
                <p style={{
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.5)', marginBottom: 14,
                }}>
                  {selectedMeerkat.id === 'custom' ? 'Configuras desde tu portal' : 'Incluye'}
                </p>
                <div className="flex flex-col gap-3">
                  {(selectedMeerkat.id === 'custom'
                    ? CUSTOM_PORTAL_FEATURES
                    : AGENT_PLANS[0].features.map(f => f.label === 'Voz y nombre personalizables' ? { label: 'Nombre personalizable', desc: 'Ponle el nombre que quieras a tu Centinelia desde el portal.' } : f)
                  ).map(f => (
                    <div key={f.label} className="flex items-start gap-2.5">
                      <Check size={12} style={{ color: selectedMeerkat.id === 'custom' ? '#6b7280' : '#6C3BFF', flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3 }}>
                          {f.label}
                        </p>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.52)', lineHeight: 1.5, marginTop: 1 }}>
                          {f.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, marginBottom: 14 }}>
              <p style={{
                fontSize: '0.9rem', fontWeight: 700, color: 'rgba(255,255,255,0.72)',
                letterSpacing: '-0.01em', textAlign: 'center',
              }}>
                ¿Hacemos equipo?
              </p>
            </div>

            <button
              onClick={handleNext}
              className="w-full py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.01] flex-shrink-0"
              style={{ background: selectedMeerkat.id === 'custom' ? 'linear-gradient(135deg, #6b7280, #9ca3af)' : `linear-gradient(135deg, ${selectedMeerkat.color}, #9B6DFF)` }}
            >
              {selectedMeerkat.id === 'custom' ? 'Continuar' : `Continuar con ${selectedMeerkat.nombre}`} <ChevronRight size={15} />
            </button>
          </div>

        </div>
      </div>
    )}

    {/* ── Chat widget mobile — Step 3 ────────────────────────────────────────── */}
    {step === 3 && selectedMeerkat && (
      <div className="sm:hidden" style={{ position: 'fixed', bottom: 24, right: 16, zIndex: 50 }}>
        {mobileBubble && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 10px)',
            right: 0,
            width: 210,
            background: roleColor,
            border: `1px solid ${roleColor}`,
            borderRadius: '14px 14px 4px 14px',
            padding: '10px 14px',
            fontSize: 12.5, lineHeight: 1.55,
            color: getContrastColor(roleColor),
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: `0 4px 20px ${roleColor}60`,
          }}>
            {mobileBubble}
          </div>
        )}
        <div style={{
          width: 56, height: 56, borderRadius: '50%', overflow: 'hidden',
          background: '#F4F0FF', border: `2px solid ${roleColor}`,
          position: 'relative',
          boxShadow: `0 4px 16px ${roleColor}50`,
        }}>
          <Image
            src={selectedMeerkat.imagen!}
            alt={selectedMeerkat.nombre} fill sizes="56px"
            style={{ objectFit: 'cover', objectPosition: 'center 3%' }} />
        </div>
      </div>
    )}

    {/* ── Chat widget desktop — Step 3 ─────────────────────────────────────────── */}
    {step === 3 && selectedMeerkat && (
      <div className="hidden sm:block" style={{
        position: 'fixed', bottom: 24, right: 24,
        width: 272, zIndex: 50,
        borderRadius: 20,
        background: 'rgba(15,7,40,0.88)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 14px',
          background: '#3D1F8A',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 40, height: 46, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
            background: '#F4F0FF', border: `1.5px solid ${roleColor}50`,
            position: 'relative',
          }}>
            {selectedMeerkat.imagen ? (
              <Image
                src={selectedMeerkat.imagen}
                alt={selectedMeerkat.nombre}
                fill
                sizes="40px"
                style={{ objectFit: 'contain', objectPosition: 'bottom center' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, color: roleColor,
              }}>
                {selectedMeerkat.nombre[0]}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {agentName.trim() || selectedMeerkat.nombre}
            </p>
            <p style={{ fontSize: 10, color: roleColor, marginTop: 1, fontWeight: 600 }}>
              {selectedMeerkat.rol || 'Personalizado'}
            </p>
          </div>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 6px rgba(34,197,94,0.7)',
            flexShrink: 0,
          }} />
        </div>

        {/* Messages */}
        <div style={{
          padding: '12px 12px 14px',
          display: 'flex', flexDirection: 'column', gap: 6,
          maxHeight: 220, overflowY: 'auto',
          background: '#F4F0FF',
        }}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={{
              background: '#ffffff',
              borderRadius: '4px 14px 14px 14px',
              padding: '8px 12px',
              fontSize: 12, lineHeight: 1.55,
              color: '#2D1B69',
              maxWidth: '92%',
              boxShadow: '0 1px 3px rgba(108,59,255,0.08)',
            }}>
              {msg}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>
    )}

    </div>
  );
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroInner />
    </Suspense>
  );
}
