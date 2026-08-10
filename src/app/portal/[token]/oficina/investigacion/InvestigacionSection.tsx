'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, ExternalLink, Zap, Users, TrendingUp, BookOpen, Newspaper, RefreshCw, Globe, CheckCircle, Phone } from 'lucide-react';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';
import MeerkatPicker from '../../empleados/MeerkatPicker';

interface Researcher {
  id:              string;
  agent_name:      string | null;
  business_name:   string;
  meerkat_role_id: string | null;
}

interface ResearchMeerkat {
  id:     string;
  nombre: string;
  color:  string;
  imagen: string | null;
}

type ResearchType = 'leads' | 'competidores' | 'mercado' | 'regulaciones' | 'noticias' | 'general';

interface Result {
  title:       string;
  url:         string;
  description: string;
  domain:      string;
}

const TYPES: { key: ResearchType; label: string; icon: React.ElementType; desc: string; placeholder: string }[] = [
  {
    key:         'leads',
    label:       'Leads',
    icon:        Users,
    desc:        'Encuentra empresas o personas con alta probabilidad de convertirse en clientes.',
    placeholder: 'Ej: empresas que necesitan contabilidad, responsables de restaurante en Monterrey…',
  },
  {
    key:         'competidores',
    label:       'Competidores',
    icon:        RefreshCw,
    desc:        'Analiza cómo venden, qué ofrecen y cómo puedes diferenciarte.',
    placeholder: 'Ej: agencias de marketing digital, despachos contables en CDMX…',
  },
  {
    key:         'mercado',
    label:       'Mercado',
    icon:        TrendingUp,
    desc:        'Descubre tendencias, tamaño de mercado y oportunidades del sector.',
    placeholder: 'Ej: clínicas dentales en México, mercado de logística refrigerada…',
  },
  {
    key:         'regulaciones',
    label:       'Regulaciones',
    icon:        BookOpen,
    desc:        'Encuentra permisos, leyes y requisitos para operar o expandirte.',
    placeholder: 'Ej: abrir una farmacia, importar alimentos, operar una guardería…',
  },
  {
    key:         'noticias',
    label:       'Noticias',
    icon:        Newspaper,
    desc:        'Monitorea novedades, cambios recientes y actividad del sector.',
    placeholder: 'Ej: bienes raíces Monterrey, sector automotriz México…',
  },
  {
    key:         'general',
    label:       'General',
    icon:        Globe,
    desc:        'Cualquier tema que quieras que tu empleado investigue en internet.',
    placeholder: 'Ej: proveedores de empaques biodegradables, precio del acero hoy…',
  },
];

const LOADING_MESSAGES = [
  'Investigando en internet...',
  'Leyendo fuentes relevantes...',
  'Analizando información encontrada...',
  'Identificando datos clave...',
  'Preparando los hallazgos...',
];

export default function InvestigacionSection({ token, researchers = [], defaultResearcherId = null, researchMeerkats = [], plan = 'pro', defaultTier = 'starter' }: {
  token:               string;
  researchers?:        Researcher[];
  defaultResearcherId?: string | null;
  researchMeerkats?:   ResearchMeerkat[];
  plan?:               string;
  defaultTier?:        string;
}) {
  const [topic,       setTopic]       = useState('');
  const [location,    setLocation]    = useState('');
  const [keywords,    setKeywords]    = useState('');
  const [type,        setType]        = useState<ResearchType>('leads');
  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState<Result[] | null>(null);
  const [error,       setError]       = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [lastTopic,   setLastTopic]   = useState('');
  const [history,     setHistory]     = useState<Array<{ topic: string; type: ResearchType; results: Result[]; researcherId: string | null }>>([]);
  const [researcherId, setResearcherId] = useState<string | null>(defaultResearcherId);

  const selectedType       = TYPES.find(t => t.key === type)!;
  const selectedResearcher = researchers.find(r => r.id === researcherId) ?? null;
  const employeeName       = selectedResearcher?.agent_name?.trim() || 'Tu empleado';
  const meerkat            = selectedResearcher?.meerkat_role_id
    ? MEERKAT_MAP[selectedResearcher.meerkat_role_id as keyof typeof MEERKAT_MAP]
    : null;
  const acColor            = meerkat?.color ?? '#6C3BFF';

  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    const id = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 1600);
    return () => clearInterval(id);
  }, [loading]);

  async function search() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError('');
    setResults(null);
    setLastTopic(topic.trim());

    try {
      const res = await fetch(`/api/portal/${token}/research`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          topic:    topic.trim(),
          location: location.trim(),
          type,
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
          agent_id: researcherId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al investigar'); return; }
      const newResults = data.results ?? [];
      setResults(newResults);
      if (newResults.length > 0) {
        setHistory(prev => [
          { topic: topic.trim(), type, results: newResults, researcherId },
          ...prev.filter(h => h.topic !== topic.trim()),
        ].slice(0, 3));
      }
    } catch {
      setError('No se pudo conectar. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  // Empty state cuando NADIE de los empleados contratados es un rol que sabe
  // investigar en internet. Estilo banner como el de Naia (onboarding) o Nia
  // (encuestas) — imágenes + upsell con MeerkatPicker.
  if (researchers.length === 0) {
    const primary = researchMeerkats[0] ?? null;
    const others  = researchMeerkats.slice(1);
    const namesList = researchMeerkats.map(m => m.nombre).join(', ');

    return (
      <div className="flex overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(168,85,247,0.06) 60%, #ffffff 100%)',
          border: '1px solid rgba(59,130,246,0.30)',
          boxShadow: '0 4px 20px rgba(59,130,246,0.08)',
        }}>
        {/* Stack de imágenes de los empleados que pueden investigar */}
        <div className="relative shrink-0 self-end flex items-end" style={{ width: primary ? 156 : 0, height: 144 }}>
          {primary?.imagen && (
            <img
              src={primary.imagen}
              alt={primary.nombre}
              style={{ width: 128, height: 128, objectFit: 'contain', objectPosition: 'bottom center', position: 'absolute', bottom: 0, left: 20, zIndex: 2 }}
            />
          )}
          {others[0]?.imagen && (
            <img
              src={others[0].imagen}
              alt={others[0].nombre}
              style={{ width: 96, height: 96, objectFit: 'contain', objectPosition: 'bottom center', position: 'absolute', bottom: 0, left: 0, opacity: 0.75, zIndex: 1 }}
            />
          )}
          {others[1]?.imagen && (
            <img
              src={others[1].imagen}
              alt={others[1].nombre}
              style={{ width: 96, height: 96, objectFit: 'contain', objectPosition: 'bottom center', position: 'absolute', bottom: 0, right: -12, opacity: 0.6, zIndex: 0 }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 py-5 pr-5 pl-3 flex flex-col justify-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#3B82F6', letterSpacing: '0.08em' }}>
            Investigación
          </p>
          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
            {researchMeerkats.length > 1
              ? `Contrata a ${researchMeerkats.map(m => m.nombre).join(', ').replace(/, ([^,]*)$/, ' o $1')}`
              : primary
                ? `Contrata a ${primary.nombre}`
                : 'Contrata un empleado que investigue'}
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
            Ningún empleado de tu equipo tiene el perfil para investigar en internet. {namesList
              ? `${namesList} sí traen esta habilidad y pueden buscar competidores, prospectos, mercados y regulaciones.`
              : 'Contrata un empleado con perfil de investigación.'}
          </p>
          {primary && (
            <div className="mt-1">
              <MeerkatPicker
                token={token}
                plan={plan as 'pro'}
                defaultTier={defaultTier as 'starter' | 'growth' | 'scale'}
                preselect={primary.id as 'noah' | 'nova' | 'niva'}
                triggerLabel={`Contratar a ${primary.nombre}`}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {meerkat?.imagen ? (
            <img
              src={meerkat.imagen}
              alt={meerkat.nombre}
              style={{ width: 56, height: 56, objectFit: 'contain', objectPosition: 'bottom center', flexShrink: 0, alignSelf: 'flex-end' }}
            />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${acColor}18`, border: `1px solid ${acColor}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Globe size={18} style={{ color: acColor }} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Investigación
            </h2>
            <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
              {employeeName} investiga en internet: competidores, prospectos, regulaciones y más.
            </p>
          </div>
        </div>
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
          title="La investigación en internet no descuenta tareas de tu plan."
        >
          <Zap size={10} style={{ color: '#6C3BFF' }} />
          <span className="text-[11px] font-medium" style={{ color: '#6B6480' }}>
            No consume tareas
          </span>
        </span>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 flex flex-col gap-5" style={{ borderTop: '1px solid #F0EDF9', paddingTop: 16 }}>

        {/* Step 1: Researcher picker — solo si hay más de un empleado */}
        {researchers.length > 1 && (
          <div className="flex flex-col gap-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
              1 · ¿Quién la lleva a cabo?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {researchers.map(r => {
                const rMeerkat = r.meerkat_role_id ? MEERKAT_MAP[r.meerkat_role_id as keyof typeof MEERKAT_MAP] : null;
                const rColor   = rMeerkat?.color ?? '#6C3BFF';
                const rName    = r.agent_name?.trim() || r.business_name || 'Empleado';
                const active   = researcherId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setResearcherId(r.id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold pl-1 pr-2.5 h-7 rounded-full transition-opacity hover:opacity-90"
                    style={{
                      background: active ? `${rColor}18` : '#FAFAFB',
                      color:      active ? rColor        : '#6B6480',
                      border:     active ? `1px solid ${rColor}55` : '1px solid #E8E3F5',
                      cursor: 'pointer',
                    }}
                  >
                    {rMeerkat?.imagen && (
                      <span style={{ width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', display: 'inline-block', flexShrink: 0, background: '#ffffff' }}>
                        <img
                          src={rMeerkat.imagen}
                          alt={rName}
                          style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                            objectPosition: rMeerkat.avatarPosition ?? 'center 3%',
                            transform: rMeerkat.avatarScale && rMeerkat.avatarScale !== 1 ? `scale(${rMeerkat.avatarScale})` : 'none',
                            transformOrigin: rMeerkat.avatarPosition ?? 'center 3%',
                          }}
                        />
                      </span>
                    )}
                    {rName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Type — si solo hay un empleado, sigue siendo el paso 1 */}
        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
            {researchers.length > 1 ? '2' : '1'} · ¿Qué quieres investigar?
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TYPES.map(t => {
              const Icon = t.icon;
              const sel  = type === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setType(t.key); setTopic(''); }}
                  className="flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all"
                  style={{
                    background: sel ? 'rgba(108,59,255,0.08)' : '#FAFAFB',
                    border:     sel ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: sel ? 'rgba(108,59,255,0.15)' : '#ffffff' }}
                    >
                      <Icon size={13} style={{ color: sel ? '#6C3BFF' : '#9B8FB5' }} />
                    </div>
                    <span className="text-[13px] font-semibold" style={{ color: sel ? '#6C3BFF' : '#1A0A3B' }}>
                      {t.label}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug pl-8"
                    style={{ color: sel ? '#6C3BFF' : '#9B8FB5' }}>
                    {t.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3 (o 2 si solo hay 1 empleado): Query */}
        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
            {researchers.length > 1 ? '3' : '2'} · Da instrucciones a tu empleado
          </p>
          <div
            className="flex flex-col gap-2 p-3 rounded-xl"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
          >
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); search(); } }}
              placeholder={selectedType.placeholder}
              rows={2}
              className="text-[13px] outline-none resize-none leading-relaxed rounded-lg px-3 py-2"
              style={{
                background: '#ffffff',
                border:     '1px solid #E8E3F5',
                color:      '#1A0A3B',
              }}
            />
            <div className="flex gap-2 flex-wrap">
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Zona o ciudad (opcional)"
                className="flex-1 min-w-[140px] text-[13px] outline-none rounded-lg px-3 py-2"
                style={{
                  background: '#ffffff',
                  border:     '1px solid #E8E3F5',
                  color:      '#1A0A3B',
                }}
              />
              <input
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                placeholder="Palabras extra separadas por coma"
                className="flex-1 min-w-[140px] text-[13px] outline-none rounded-lg px-3 py-2"
                style={{
                  background: '#ffffff',
                  border:     '1px solid #E8E3F5',
                  color:      '#1A0A3B',
                }}
              />
            </div>
          </div>
        </div>

        {/* Search button */}
        <button
          onClick={search}
          disabled={!topic.trim() || loading}
          className="flex items-center justify-center gap-2 h-11 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background: '#6C3BFF',
            color:      '#fff',
            boxShadow:  '0 1px 2px rgba(108,59,255,0.24)',
          }}
        >
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Investigando…</>
            : <><Search size={15} /> Iniciar investigación</>
          }
        </button>

        {/* Search history */}
        {history.length > 0 && !loading && results === null && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
              Búsquedas recientes
            </p>
            <div className="flex flex-col rounded-xl overflow-hidden"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
              {history.map((h, i) => {
                const hType = TYPES.find(t => t.key === h.type);
                const HIcon = hType?.icon ?? Globe;
                const isLast = i === history.length - 1;
                return (
                  <button
                    key={i}
                    onClick={() => { setType(h.type); setTopic(h.topic); setResults(h.results); setLastTopic(h.topic); }}
                    className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAFAFB]"
                    style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                      <HIcon size={13} style={{ color: '#6B6480' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: '#1A0A3B' }}>{h.topic}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: '#9B8FB5' }}>{hType?.label} · {h.results.length} fuentes</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col gap-3 p-4 rounded-xl"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.1)' }}>
                <Loader2 size={18} className="animate-spin" style={{ color: '#6C3BFF' }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                  {employeeName} está investigando
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#6C3BFF' }}>
                  {LOADING_MESSAGES[loadingStep]}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5 pl-12">
              {LOADING_MESSAGES.map((_, i) => (
                <div key={i}
                  className="h-1 rounded-full flex-1 transition-all duration-700"
                  style={{ background: i <= loadingStep ? '#6C3BFF' : '#E8E3F5' }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-[13px] px-4 py-3 rounded-lg"
            style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
            {error}
          </p>
        )}

        {/* Results */}
        {results !== null && (
          <div className="flex flex-col gap-4">

            {results.length === 0 ? (
              <p className="text-[13px] px-4 py-3 rounded-lg"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                Sin resultados. Intenta con otras palabras o amplía la zona.
              </p>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={15} style={{ color: '#22c55e' }} />
                    <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                      Investigación terminada
                    </p>
                  </div>
                  <p className="text-[11px] mt-1 ml-6" style={{ color: '#6B6480' }}>
                    {results.length} fuente{results.length !== 1 ? 's' : ''} · {selectedType.label}
                    {lastTopic && <span style={{ color: '#9B8FB5' }}> · "{lastTopic}"</span>}
                  </p>
                </div>

                {/* Summary */}
                <div className="p-4 rounded-xl flex flex-col gap-3"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
                    Hallazgos principales
                  </p>
                  <div>
                    <p className="text-[12px] mb-1.5" style={{ color: '#6B6480' }}>
                      Fuentes más frecuentes:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Map(results.map(r => [r.domain, r])).values()].slice(0, 6).map(r => (
                        <span key={r.domain}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6B6480' }}>
                          {r.domain}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[12px] mb-1.5" style={{ color: '#6B6480' }}>
                      Resultados destacados:
                    </p>
                    <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {results.slice(0, 4).map((r, i) => (
                        <li key={i} className="text-[12px] leading-snug" style={{ color: '#1A0A3B' }}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#6C3BFF', textDecoration: 'none' }}>
                            {r.title.length > 80 ? r.title.slice(0, 80) + '…' : r.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`/portal/${token}/oficina/llamadas`}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70 no-underline"
                    style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}
                  >
                    <Phone size={12} /> Crear llamadas salientes
                  </a>
                </div>

                {/* Sources: apiladas en surface único con dividers */}
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
                    Fuentes consultadas
                  </p>
                  <div className="flex flex-col rounded-xl overflow-hidden"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
                    {results.map((r, i) => {
                      const isLast = i === results.length - 1;
                      return (
                        <a
                          key={i}
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col gap-1.5 px-4 py-3 transition-colors no-underline group hover:bg-[#FAFAFB]"
                          style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[13px] font-semibold leading-snug group-hover:underline" style={{ color: '#1A0A3B' }}>
                              {r.title}
                            </p>
                            <ExternalLink size={13} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity"
                              style={{ color: '#9B8FB5' }} />
                          </div>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full self-start"
                            style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}
                          >
                            {r.domain}
                          </span>
                          {r.description && (
                            <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: '#6B6480' }}>
                              {r.description}
                            </p>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
