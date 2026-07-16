'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check, ChevronRight, ChevronLeft, ChevronDown, Loader, X,
  Phone, Building2, User, Utensils, Stethoscope,
  Smartphone, ShoppingBag, Landmark, GraduationCap, type LucideProps,
} from 'lucide-react';
import Image from 'next/image';
import { MEERKAT_ROLES, MEERKAT_MAP, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';
import { FEATURE_LABELS } from '@/types/agent';

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
    description: 'Todo lo que tu negocio necesita para automatizar la atención telefónica.',
    features: [
      { label: 'Atención telefónica 24/7', desc: 'Contesta a cualquier hora con el nombre e información de tu negocio.' },
      { label: 'Captura de leads y agendamiento', desc: 'Obtiene datos del prospecto y confirma o modifica citas durante la llamada.' },
      { label: 'Transferencia inteligente y escalación', desc: 'Transfiere al staff o dirige a WhatsApp cuando el cliente lo necesita.' },
      { label: 'Hasta 3 llamadas simultáneas', desc: 'Tu agente atiende hasta 3 llamadas al mismo tiempo sin dar señal de ocupado.' },
      { label: 'Llamadas salientes y devolución automática', desc: 'Llama a contactos para confirmar citas y devuelve llamadas perdidas.' },
      { label: 'Toma de pedidos', desc: 'Recibe pedidos completos durante la llamada y los manda a tu WhatsApp.' },
      { label: 'Memoria de cliente', desc: 'Recuerda quién ha llamado antes, qué pidió y sus preferencias.' },
      { label: 'Multiidioma (ES + EN)', desc: 'Detecta el idioma del cliente y responde en español o inglés.' },
      { label: 'Voz y nombre personalizables', desc: 'Elige nombre, voz y diseña lógica conversacional a medida de tu operación.' },
      { label: 'Reseñas Google automáticas', desc: 'Tras cada llamada exitosa manda el link de tu reseña Google por WhatsApp.' },
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
  { id: 'starter', label: 'Esencial',    minutes: 300,  aiOps: 100, price: 2997 },
  { id: 'growth',  label: 'Profesional', minutes: 600,  aiOps: 200, price: 5994, popular: true },
  { id: 'scale',   label: 'Avanzado',    minutes: 1200, aiOps: 300, price: 11988 },
];

// Ops-only tiers for Nox (no minutes cost)
type NoxTierDef = { id: FormTier; label: string; aiOps: number; price: number; popular?: boolean };
const NOX_TIERS: NoxTierDef[] = [
  { id: 'starter', label: 'Coordinador', aiOps:  500, price: 1997 },
  { id: 'growth',  label: 'Director',    aiOps: 1200, price: 3994, popular: true },
  { id: 'scale',   label: 'Ejecutivo',   aiOps: 3000, price: 7994 },
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
  { label: 'Transferencias y escalación',    desc: 'Define a quién y cuándo transferir llamadas o escalar a WhatsApp.' },
  { label: 'Instrucciones personalizadas',   desc: 'Dale un guion, tono de voz y estilo de conversación propio.' },
  { label: 'Llamadas salientes',             desc: 'Activa marcación automática para confirmaciones o seguimiento.' },
];


const priceFmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r + (255 - r) * amount)}, ${Math.round(g + (255 - g) * amount)}, ${Math.round(b + (255 - b) * amount)})`;
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
              ...(roleId === 'nia' && { transform: 'scale(1.18)', transformOrigin: 'bottom center' }),
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
  const [plan, setPlan] = useState<FormPlan>(initPlan);
  const [tier, setTier] = useState<FormTier>(initTier);

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
  const [whatsapp,        setWhatsapp]        = useState('');

  const selectedMeerkat    = meerkatRoleId ? MEERKAT_MAP[meerkatRoleId] : null;
  const selectedAgentPlan  = AGENT_PLANS.find(p => p.id === plan)!;
  const isCoordinator      = !!((selectedMeerkat?.features as Record<string, unknown>)?.is_coordinator);
  const selectedTier       = TIERS.find(t => t.id === tier) ?? TIERS[1];
  const selectedNoxTier    = NOX_TIERS.find(t => t.id === tier) ?? NOX_TIERS[1];
  const monthlyPrice       = plan !== 'empresarial' ? (isCoordinator ? selectedNoxTier.price : selectedTier.price) : 0;
  const roleColor          = selectedMeerkat?.color ?? selectedAgentPlan.color;

  const STEP_LABELS = ['Empleado', isCoordinator ? 'Ops' : 'Minutos', 'Organización', 'Tus datos'];

  const [empresarialOpen, setEmpresarialOpen] = useState(false);
  const [overlayOpen,     setOverlayOpen]     = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step === 1) {
        if (overlayOpen) setOverlayOpen(false);
        else if (meerkatRoleId) setMeerkatRoleId(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [step, meerkatRoleId, overlayOpen]);

  const handleSelectMeerkat = (roleId: MeerkatRoleId) => {
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
      if (!businessName.trim())  { setError('Escribe el nombre de tu negocio'); return; }
      if (!businessDesc.trim())  { setError('Escribe una descripción del negocio'); return; }
      if (!businessPhone.trim()) { setError('Escribe el teléfono del negocio'); return; }
      setStep(4);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!clientFirstName.trim())                           { setError('Escribe tu nombre'); return; }
    if (!clientLastName.trim())                            { setError('Escribe tu apellido'); return; }
    if (!clientEmail.trim() || !clientEmail.includes('@')) { setError('Escribe un correo electrónico válido'); return; }
    if (!whatsapp.trim())                                  { setError('Escribe tu número de WhatsApp'); return; }

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
          area_code:              cityLada || undefined,
          country:                country,
          agent_name:             agentName.trim() || null,
          client_name:            `${clientFirstName.trim()} ${clientLastName.trim()}`,
          client_email:           clientEmail.trim(),
          transfer_whatsapp:      whatsapp.trim(),
          meerkat_role_id:        meerkatRoleId ?? undefined,
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
            {['Revisión de necesidades de integración', 'Propuesta personalizada vía WhatsApp / correo', 'Llamada de onboarding con el equipo'].map((s, i) => (
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
        <div className="flex items-center justify-center gap-0 mb-6 sm:mb-10">
          {STEP_LABELS.map((label, i) => {
            const n      = (i + 1) as 1 | 2 | 3 | 4;
            const done   = step > n;
            const active = step === n;
            const canNav = done;
            return (
              <div key={label} className="flex items-center">
                <button
                  type="button"
                  onClick={() => { if (canNav) { setError(''); if (n === 1) setOverlayOpen(false); setStep(n); } }}
                  className="flex flex-col items-center"
                  style={{ cursor: canNav ? 'pointer' : 'default', background: 'none', border: 'none', padding: 0 }}
                >
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all"
                    style={{
                      background: done ? '#6C3BFF' : active ? 'rgba(108,59,255,0.3)' : 'rgba(255,255,255,0.05)',
                      border:     `2px solid ${done || active ? '#6C3BFF' : 'rgba(255,255,255,0.1)'}`,
                      color:      done || active ? '#fff' : 'rgba(255,255,255,0.3)',
                    }}>
                    {done ? <Check size={11} /> : n}
                  </div>
                  <span className="text-[9px] sm:text-xs mt-1 sm:mt-1.5 font-medium"
                    style={{
                      color:              active ? '#9B6DFF' : done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                      textDecoration:     canNav ? 'underline' : 'none',
                      textUnderlineOffset:2,
                    }}>
                    {label}
                  </span>
                </button>
                {i < 3 && (
                  <div className="w-4 sm:w-14 h-px mx-0.5 sm:mx-1 mb-4"
                    style={{ background: step > n + 1 ? '#6C3BFF' : 'rgba(255,255,255,0.08)' }} />
                )}
              </div>
            );
          })}
        </div>

        {canceled && (
          <div className="mb-6 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
            El pago fue cancelado. Puedes intentarlo de nuevo cuando quieras.
          </div>
        )}

        {/* ── STEP 1: Elige tu empleado ────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Tu equipo Centinelia</h1>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Cada uno tiene un rol especializado. Puedes contratar más adelante a los que necesites.
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
                      onClick={() => handleSelectMeerkat(dirId)}
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
                      <div style={{ width: '100%', aspectRatio: '1', position: 'relative', overflow: 'hidden', background: '#FFFFFF' }}>
                        <img
                          src={dir.imagen!}
                          alt={dir.nombre}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom center', padding: '6px 6px 0' }}
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
                          onClick={() => handleSelectMeerkat(role.id)}
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
                                  </>
                                );
                              })()}
                              {/* Mobile: go straight to next step */}
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
                    Para empresas con múltiples sucursales, franquicias o que requieren integraciones con su propio sistema (POS, CRM, ERP). Cada sucursal puede tener su propio empleado con portal independiente.
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
                ? `Elige las ops de ${selectedMeerkat!.nombre}`
                : selectedMeerkat && selectedMeerkat.id !== 'custom'
                  ? `Elige los minutos de ${selectedMeerkat.nombre}`
                  : 'Elige tus minutos al mes'
              }
            </h1>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isCoordinator
                ? `${selectedMeerkat?.nombre ?? 'El director'} no hace llamadas: su costo es solo de operaciones IA. Puedes cambiarlo desde el portal en cualquier momento.`
                : 'La mensualidad depende de los minutos que necesites. Puedes cambiarlo en cualquier momento desde el portal.'
              }
            </p>

            {/* Tier selector badge */}
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)' }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#9B6DFF' }} />
              <p className="text-xs font-semibold" style={{ color: '#C4A8FF' }}>
                CARGO MENSUAL RECURRENTE
              </p>
            </div>

            {/* Standard tiers */}
            {!isCoordinator && (
              <div className="grid grid-cols-3 gap-3 mb-6" style={{ paddingTop: 20 }}>
                {TIERS.map(t => {
                  const sel = tier === t.id;
                  return (
                    <div key={t.id} onClick={() => setTier(t.id)}
                      className="rounded-xl cursor-pointer transition-all flex flex-col"
                      style={{ position: 'relative', background: sel ? 'rgba(108,59,255,0.14)' : 'rgba(255,255,255,0.03)', border: `2px solid ${sel ? '#6C3BFF' : 'rgba(255,255,255,0.07)'}` }}>
                      {t.popular && (
                        <div style={{
                          position: 'absolute', top: -20, right: 14,
                          background: '#6C3BFF',
                          borderRadius: '6px 6px 0 0',
                          padding: '3px 10px 5px',
                          fontSize: 9, fontWeight: 700,
                          color: '#fff', letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          Más usado
                        </div>
                      )}
                      <div className="flex flex-col items-center text-center flex-1">
                        <div className="w-full px-4 pt-5 pb-4" style={{ flex: 1 }}>
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mx-auto mb-3 transition-all"
                            style={{ borderColor: sel ? '#6C3BFF' : 'rgba(255,255,255,0.2)', background: sel ? '#6C3BFF' : 'transparent' }}>
                            {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <p className="font-semibold text-white text-sm mb-2">{t.label}</p>
                          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{t.minutes} min/mes</p>
                          <p className="text-xs" style={{ color: sel ? '#9B6DFF' : 'rgba(255,255,255,0.35)' }}>{t.aiOps} ops IA/mes</p>
                        </div>
                        <div className="w-full" style={{ borderTop: `1px solid ${sel ? 'rgba(108,59,255,0.4)' : 'rgba(255,255,255,0.07)'}` }}>
                          <p className="font-bold tabular-nums py-4" style={{ fontSize: 18, color: sel ? '#9B6DFF' : '#fff' }}>
                            {priceFmt(t.price)}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}>/mes</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Nox ops-only tiers */}
            {isCoordinator && (
              <div className="grid grid-cols-3 gap-3 mb-6" style={{ paddingTop: 20 }}>
                {NOX_TIERS.map(t => {
                  const sel = tier === t.id;
                  return (
                    <div key={t.id} onClick={() => setTier(t.id)}
                      className="rounded-xl cursor-pointer transition-all flex flex-col"
                      style={{ position: 'relative', background: sel ? `${roleColor}18` : 'rgba(255,255,255,0.03)', border: `2px solid ${sel ? roleColor : 'rgba(255,255,255,0.07)'}` }}>
                      {t.popular && (
                        <div style={{
                          position: 'absolute', top: -20, right: 14,
                          background: roleColor,
                          borderRadius: '6px 6px 0 0',
                          padding: '3px 10px 5px',
                          fontSize: 9, fontWeight: 700,
                          color: '#fff', letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          Más usado
                        </div>
                      )}
                      <div className="flex flex-col items-center text-center flex-1">
                        <div className="w-full px-4 pt-5 pb-4" style={{ flex: 1 }}>
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mx-auto mb-3 transition-all"
                            style={{ borderColor: sel ? roleColor : 'rgba(255,255,255,0.2)', background: sel ? roleColor : 'transparent' }}>
                            {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <p className="font-semibold text-white text-sm mb-2">{t.label}</p>
                          <p className="text-xs" style={{ color: sel ? lightenColor(roleColor, 0.45) : 'rgba(255,255,255,0.35)' }}>{t.aiOps} ops IA/mes</p>
                        </div>
                        <div className="w-full" style={{ borderTop: `1px solid ${sel ? `${roleColor}60` : 'rgba(255,255,255,0.07)'}` }}>
                          <p className="font-bold tabular-nums py-4" style={{ fontSize: 18, color: sel ? lightenColor(roleColor, 0.45) : '#fff' }}>
                            {priceFmt(t.price)}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}>/mes</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs mb-6 text-center" style={{ color: 'rgba(255,255,255,0.28)' }}>
              {isCoordinator
                ? `${selectedMeerkat?.nombre ?? 'El director'} coordina sin llamadas. Las operaciones extra tienen costo adicional.`
                : <>Minutos extra: $12.99 MXN / min<br />+35 ops IA por cada 100 min adicionales</>

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
                Continuar · {isCoordinator ? selectedNoxTier.label : selectedTier.label} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Business info ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Tu organización</h1>
            <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isCoordinator
                ? `${selectedMeerkat?.nombre ?? 'El director'} usará esta información para coordinar y reportar al equipo.`
                : 'Tu empleado usará esta información para atender tus llamadas.'
              }
            </p>

            <div className="flex flex-col gap-5">
              <div>
                <label style={labelStyle}>Nombre de la organización *</label>
                <div className="relative">
                  <Building2 size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Ej. Clínica San Rafael, UAdeNL, Municipio de Monterrey…" style={{ ...inputStyle, paddingLeft: 40 }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Sector o industria *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                  {GIROS.map(g => (
                    <button key={g.id} type="button" onClick={() => setGiro(g.id)}
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
                <button type="button" onClick={() => setGiro(GIRO_GENERAL.id)}
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
                <label style={labelStyle}>
                  Describe tu organización brevemente *
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(tu empleado lo usa para responder preguntas)</span>
                </label>
                <textarea
                  value={businessDesc}
                  onChange={e => setBusinessDesc(e.target.value)}
                  placeholder="Ej. Somos una clínica dental en Monterrey con 15 años de experiencia. Ofrecemos limpiezas, ortodoncia y blanqueamiento. Abiertos lunes a sábado de 9am a 7pm."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* Country + area code — not needed for coordinator agents */}
              {!isCoordinator && (
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
                        onClick={() => handleCountryChange(c.id)}
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
                  Teléfono de la organización *
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>
                    {isCoordinator ? '(para contacto y reportes)' : '(tu empleado lo menciona en llamadas)'}
                  </span>
                </label>
                <div className="relative">
                  <Phone size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="Ej. 81 1234 5678" style={{ ...inputStyle, paddingLeft: 40 }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Nombre de {selectedMeerkat && selectedMeerkat.id !== 'custom' ? `tu ${selectedMeerkat.rol || 'empleado'}` : 'tu empleado'}
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(puedes personalizarlo)</span>
                </label>
                <input
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
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
              <h1 className="text-xl font-bold text-white mb-1">Tus datos</h1>
              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Para crear tu acceso al portal y enviarte los resúmenes de llamadas.
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
                <div>
                  <label style={labelStyle}>
                    WhatsApp *
                    <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>(resúmenes en tiempo real)</span>
                  </label>
                  <div className="relative">
                    <Phone size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                    <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+52 81 1234 5678" style={{ ...inputStyle, paddingLeft: 40 }} />
                  </div>
                </div>
              </div>

              {error && (
                <p className="mt-3 text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  {error}
                </p>
              )}

              <div className="flex gap-3 mt-5">
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
                      : <>Ir al pago seguro <ChevronRight size={16} /></>
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

            {/* RIGHT — Summary card */}
            {plan !== 'empresarial' ? (
              <div className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${roleColor}38`, background: `${roleColor}08` }}>

                {/* Meerkat hero */}
                <div className="relative flex justify-center items-end" style={{ minHeight: 140 }}>
                  <div className="absolute inset-0" style={{
                    background: `radial-gradient(ellipse at 50% 90%, ${roleColor}35 0%, transparent 70%)`,
                  }} />
                  {selectedMeerkat && selectedMeerkat.id !== 'custom' ? (
                    selectedMeerkat.imagen
                      ? <img src={selectedMeerkat.imagen} alt={selectedMeerkat.nombre}
                          style={{ height: 140, objectFit: 'contain', objectPosition: 'bottom', position: 'relative', zIndex: 1 }} />
                      : <div style={{
                          width: 80, height: 80, borderRadius: 20, marginBottom: 16,
                          background: `${roleColor}25`, border: `1px solid ${roleColor}40`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 30, fontWeight: 900, color: roleColor, position: 'relative', zIndex: 1,
                        }}>{selectedMeerkat.nombre[0]}</div>
                  ) : (
                    <div style={{
                      width: 80, height: 80, borderRadius: 20, marginBottom: 16,
                      background: `${roleColor}18`, border: `1px solid ${roleColor}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative', zIndex: 1,
                    }}>
                      <span style={{ fontSize: 28, color: roleColor, fontWeight: 900 }}>C</span>
                    </div>
                  )}
                </div>

                {/* Identity */}
                <div className="text-center px-5 pt-2 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="font-bold text-white text-sm">{agentName || selectedMeerkat?.nombre || 'Tu empleado'}</p>
                  {selectedMeerkat && selectedMeerkat.id !== 'custom' && (
                    <p className="text-xs mt-0.5" style={{ color: lightenColor(roleColor, 0.45) }}>{selectedMeerkat.rol}</p>
                  )}
                  <div className="flex flex-col items-center gap-1.5 mt-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${roleColor}22`, color: roleColor, border: `1px solid ${roleColor}33` }}>
                      {selectedAgentPlan.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {isCoordinator
                        ? `${selectedNoxTier.aiOps} ops IA/mes`
                        : `${selectedTier.minutes} min · ${selectedTier.aiOps} ops IA/mes`
                      }
                    </span>
                  </div>
                </div>

                {/* Line items */}
                <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      Instalación <span style={{ color: 'rgba(255,255,255,0.25)' }}>(único)</span>
                    </span>
                    <span className="text-xs font-medium text-white tabular-nums">{priceFmt(selectedAgentPlan.setupFee)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      Mensualidad <span style={{ color: 'rgba(255,255,255,0.25)' }}>({isCoordinator ? selectedNoxTier.label : selectedTier.label})</span>
                    </span>
                    <span className="text-xs font-medium text-white tabular-nums">{priceFmt(monthlyPrice)}</span>
                  </div>
                </div>

                {/* Totals */}
                <div className="mx-3 my-3 px-4 py-3 rounded-xl"
                  style={{ background: `${roleColor}16`, border: `1px solid ${roleColor}28` }}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Subtotal</span>
                    <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {priceFmt(selectedAgentPlan.setupFee + monthlyPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between mb-2.5">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>IVA (16%)</span>
                    <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {priceFmt(Math.round((selectedAgentPlan.setupFee + monthlyPrice) * 0.16))}
                    </span>
                  </div>
                  <div className="flex justify-between items-end pt-2.5"
                    style={{ borderTop: `1px solid ${roleColor}35` }}>
                    <div>
                      <p className="text-xs font-semibold text-white">Total hoy</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Después: {priceFmt(Math.round(monthlyPrice * 1.16))}/mes
                      </p>
                    </div>
                    <span className="text-2xl font-bold tabular-nums" style={{ color: roleColor }}>
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
          <div className="relative flex-none" style={{ width: '38%', background: '#F4F0FF' }}>
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
                style={{ objectFit: 'contain', objectPosition: 'bottom center' }}
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
            style={{ width: '31%', borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '84px 44px 52px' }}
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

            {/* ¿Hacemos equipo? — bottom of personality column */}
            <div style={{ marginTop: 'auto', paddingTop: 48, textAlign: 'center' }}>
              <p style={{
                fontSize: 'clamp(1.4rem, 1.9vw, 2rem)',
                fontWeight: 800, color: '#fff',
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>
                ¿Hacemos equipo?
              </p>
            </div>
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
                  {(selectedMeerkat.id === 'custom' ? CUSTOM_PORTAL_FEATURES : AGENT_PLANS[0].features).map(f => (
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
