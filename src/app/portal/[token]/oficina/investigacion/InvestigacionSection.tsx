'use client';

import { useState } from 'react';
import { Search, Loader2, ExternalLink, Zap, Users, TrendingUp, BookOpen, Newspaper, RefreshCw, Info, Globe } from 'lucide-react';

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
    desc:        'Personas o empresas con una necesidad específica',
    placeholder: 'Ej: personas que quieren vender su casa, empresas que buscan contador…',
  },
  {
    key:         'competidores',
    label:       'Competidores',
    icon:        RefreshCw,
    desc:        'Negocios del mismo giro en tu zona',
    placeholder: 'Ej: despachos contables, agencias de marketing digital…',
  },
  {
    key:         'mercado',
    label:       'Mercado',
    icon:        TrendingUp,
    desc:        'Tendencias, tamaño y oportunidades del sector',
    placeholder: 'Ej: clínicas dentales en México, mercado de logística refrigerada…',
  },
  {
    key:         'regulaciones',
    label:       'Regulaciones',
    icon:        BookOpen,
    desc:        'Permisos, leyes y requisitos para operar',
    placeholder: 'Ej: abrir una farmacia, importar alimentos, operar una guardería…',
  },
  {
    key:         'noticias',
    label:       'Noticias',
    icon:        Newspaper,
    desc:        'Novedades y actividad reciente del sector',
    placeholder: 'Ej: bienes raíces Monterrey, sector automotriz México…',
  },
  {
    key:         'general',
    label:       'General',
    icon:        Globe,
    desc:        'Cualquier búsqueda que no encaje en las anteriores',
    placeholder: 'Ej: proveedores de empaques biodegradables, precio del acero hoy…',
  },
];

export default function InvestigacionSection({ token }: { token: string }) {
  const [topic,       setTopic]       = useState('');
  const [location,    setLocation]    = useState('');
  const [keywords,    setKeywords]    = useState('');
  const [type,        setType]        = useState<ResearchType>('leads');
  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState<Result[] | null>(null);
  const [error,       setError]       = useState('');
  const [showOpsInfo, setShowOpsInfo] = useState(false);

  const selectedType = TYPES.find(t => t.key === type)!;

  async function search() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError('');
    setResults(null);

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
      if (!res.ok) { setError(data.error ?? 'Error al buscar'); return; }
      setResults(data.results ?? []);
    } catch {
      setError('No se pudo conectar. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Investigación</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Busca en internet sin gastar ops. Úsalo para preparar a tu agente antes de actuar.
          </p>
        </div>
        <button
          onClick={() => setShowOpsInfo(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs flex-shrink-0 transition-colors"
          style={{
            background: showOpsInfo ? 'rgba(108,59,255,0.12)' : 'var(--c-surface)',
            border:     '1px solid var(--c-border)',
            color:      showOpsInfo ? '#9B6DFF' : 'var(--c-text-3)',
          }}
        >
          <Info size={12} />
          ¿Cuántas ops gasta?
        </button>
      </div>

      {/* Ops info panel — collapsible */}
      {showOpsInfo && (
        <div
          className="p-4 rounded-xl text-xs flex flex-col gap-2"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          <p className="font-semibold" style={{ color: '#9B6DFF' }}>Costo en operaciones IA</p>
          <div className="flex flex-col gap-1.5" style={{ color: 'var(--c-text-2)', lineHeight: 1.6 }}>
            <p><span className="font-semibold" style={{ color: 'var(--c-text)' }}>Buscar desde aquí: 0 ops.</span> Va directo a internet, sin IA de por medio.</p>
            <p><span className="font-semibold" style={{ color: 'var(--c-text)' }}>Pedirle la búsqueda al agente en el chat: 5 ops</span> — Claude procesa la instrucción y los resultados.</p>
            <p><span className="font-semibold" style={{ color: 'var(--c-text)' }}>Buscar aquí + pedirle al agente que llame o escriba con esa info: 5 ops</span> — solo cobra la acción.</p>
            <p><span className="font-semibold" style={{ color: 'var(--c-text)' }}>Pedirle al agente que busque y actúe en un solo mensaje: 5–10 ops</span> según si lo resuelve en uno o dos turnos.</p>
          </div>
        </div>
      )}

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
                <p className="text-[11px] leading-snug pl-8" style={{ color: 'var(--c-text-3)' }}>
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
          2 · Describe lo que buscas
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
          opacity:    !topic.trim() || loading ? 0.6 : 1,
          boxShadow:  topic.trim() && !loading ? '0 4px 20px rgba(108,59,255,0.3)' : 'none',
        }}
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" /> Buscando en internet…</>
          : <><Search size={15} /> Buscar</>
        }
      </button>

      {/* Ops reminder under button */}
      <div className="flex items-center justify-center gap-1 -mt-4">
        <Zap size={10} style={{ color: '#9B6DFF' }} />
        <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
          Esta búsqueda no consume ops
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </p>
      )}

      {/* Results */}
      {results !== null && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>
            {results.length > 0
              ? `${results.length} resultado${results.length !== 1 ? 's' : ''} · ${selectedType.label}`
              : 'Sin resultados — intenta con otras palabras o amplía la zona'}
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
                <ExternalLink size={13} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity" style={{ color: 'var(--c-text-3)' }} />
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
      )}

    </div>
  );
}
