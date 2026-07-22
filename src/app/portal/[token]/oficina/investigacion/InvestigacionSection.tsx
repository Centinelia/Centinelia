'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, ExternalLink, Zap, Users, TrendingUp, BookOpen, Newspaper, RefreshCw, Globe, CheckCircle, Phone, FileText } from 'lucide-react';

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
    placeholder: 'Ej: empresas que necesitan contabilidad, dueños de restaurante en Monterrey…',
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

export default function InvestigacionSection({ token, agentName }: { token: string; agentName?: string }) {
  const [topic,       setTopic]       = useState('');
  const [location,    setLocation]    = useState('');
  const [keywords,    setKeywords]    = useState('');
  const [type,        setType]        = useState<ResearchType>('leads');
  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState<Result[] | null>(null);
  const [error,       setError]       = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [lastTopic,   setLastTopic]   = useState('');

  const selectedType = TYPES.find(t => t.key === type)!;
  const employeeName = agentName ?? 'Tu empleado';

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
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al investigar'); return; }
      setResults(data.results ?? []);
    } catch {
      setError('No se pudo conectar. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Page header */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>Investigación</p>
        <h1 className="text-xl font-bold mt-1.5 leading-snug" style={{ color: 'var(--c-text)' }}>Investigación</h1>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Pide a tu empleado que investigue antes de tomar una decisión. Puede analizar competidores, encontrar prospectos, revisar regulaciones, estudiar el mercado o investigar cualquier tema en internet.
        </p>
      </div>

      {/* Step 1 — Type */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>
          1 · ¿Qué quieres investigar?
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
                  background: sel ? 'rgba(108,59,255,0.12)' : 'var(--c-surface)',
                  border:     sel ? '1px solid rgba(108,59,255,0.45)' : '1px solid var(--c-border)',
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: sel ? 'rgba(108,59,255,0.2)' : 'var(--c-bg)' }}
                  >
                    <Icon size={13} style={{ color: sel ? '#9B6DFF' : 'var(--c-text-3)' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: sel ? '#9B6DFF' : 'var(--c-text)' }}>
                    {t.label}
                  </span>
                </div>
                <p className="text-[11px] leading-snug pl-8"
                  style={{ color: sel ? 'rgba(155,109,255,0.8)' : 'var(--c-text-3)' }}>
                  {t.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — Query */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>
          2 · Da instrucciones a tu empleado
        </p>
        <div
          className="flex flex-col gap-3 p-4 rounded-2xl"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); search(); } }}
            placeholder={selectedType.placeholder}
            rows={2}
            className="text-sm outline-none resize-none leading-relaxed"
            style={{
              background:   'var(--c-bg)',
              border:       '1px solid var(--c-input-border)',
              borderRadius: 12,
              padding:      '10px 14px',
              color:        'var(--c-text)',
            }}
          />
          <div className="flex gap-2">
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Zona o ciudad (opcional)"
              className="flex-1 text-sm outline-none"
              style={{
                background:   'var(--c-bg)',
                border:       '1px solid var(--c-input-border)',
                borderRadius: 10,
                padding:      '8px 12px',
                color:        'var(--c-text)',
              }}
            />
            <input
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="Palabras extra separadas por coma"
              className="flex-1 text-sm outline-none"
              style={{
                background:   'var(--c-bg)',
                border:       '1px solid var(--c-input-border)',
                borderRadius: 10,
                padding:      '8px 12px',
                color:        'var(--c-text)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Search button */}
      <button
        onClick={search}
        disabled={!topic.trim() || loading}
        className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: topic.trim() && !loading ? 'linear-gradient(135deg,#6C3BFF,#9B6DFF)' : 'rgba(108,59,255,0.15)',
          color:      topic.trim() && !loading ? '#fff' : '#9B6DFF',
          border:     '1px solid rgba(108,59,255,0.3)',
          opacity:    !topic.trim() || loading ? 0.7 : 1,
          boxShadow:  topic.trim() && !loading ? '0 4px 20px rgba(108,59,255,0.3)' : 'none',
        }}
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" /> Investigando…</>
          : <><Search size={15} /> Iniciar investigación</>
        }
      </button>

      {/* Ops info chip — tooltip on hover */}
      <div className="flex items-center justify-center -mt-3">
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-default"
          style={{
            background: 'rgba(108,59,255,0.06)',
            border:     '1px solid rgba(108,59,255,0.15)',
          }}
          title="La investigación en internet no descuenta tareas de tu plan. Es una función gratuita."
        >
          <Zap size={10} style={{ color: '#9B6DFF' }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>
            No consume tareas
          </span>
        </span>
      </div>

      {/* Loading animation panel */}
      {loading && (
        <div className="flex flex-col gap-3 p-5 rounded-2xl"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.15)' }}>
              <Loader2 size={18} className="animate-spin" style={{ color: '#9B6DFF' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                {employeeName} está investigando
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#9B6DFF' }}>
                {LOADING_MESSAGES[loadingStep]}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 pl-12">
            {LOADING_MESSAGES.map((_, i) => (
              <div key={i}
                className="h-1 rounded-full flex-1 transition-all duration-700"
                style={{ background: i <= loadingStep ? '#6C3BFF' : 'rgba(108,59,255,0.15)' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </p>
      )}

      {/* Results */}
      {results !== null && (
        <div className="flex flex-col gap-5">

          {results.length === 0 ? (
            <p className="text-sm px-4 py-3 rounded-xl"
              style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
              Sin resultados — intenta con otras palabras o amplía la zona.
            </p>
          ) : (
            <>
              {/* Investigation complete header */}
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={15} style={{ color: '#22c55e' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    Investigación terminada
                  </p>
                </div>
                <p className="text-xs mt-1 ml-6" style={{ color: 'var(--c-text-3)' }}>
                  {results.length} fuente{results.length !== 1 ? 's' : ''} encontrada{results.length !== 1 ? 's' : ''} · {selectedType.label}
                  {lastTopic && <span style={{ color: 'var(--c-text-4)' }}> · "{lastTopic}"</span>}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <a
                  href={`/portal/${token}/oficina/llamadas`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 no-underline"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
                >
                  <Phone size={12} /> Crear llamadas salientes
                </a>
                <button
                  disabled
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-4)', cursor: 'not-allowed', opacity: 0.5 }}
                >
                  <FileText size={12} /> Guardar como documento
                </button>
              </div>

              {/* Sources */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>
                  Fuentes consultadas
                </p>
                {results.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-1.5 p-4 rounded-xl transition-all no-underline group"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold leading-snug group-hover:underline" style={{ color: 'var(--c-text)' }}>
                        {r.title}
                      </p>
                      <ExternalLink size={13} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity"
                        style={{ color: 'var(--c-text-3)' }} />
                    </div>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full self-start"
                      style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF' }}
                    >
                      {r.domain}
                    </span>
                    {r.description && (
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--c-text-3)' }}>
                        {r.description}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
