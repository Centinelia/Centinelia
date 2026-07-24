'use client';

import { useState } from 'react';
import { TrendingUp, AlertCircle, CheckCircle, Lightbulb, Copy, Check, BarChart2 } from 'lucide-react';

interface Synthesis {
  total:       number;
  patterns:    string[];
  gaps:        string[];
  wins:        string[];
  suggestions: string[];
}

interface Props {
  token: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 flex-shrink-0 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors"
      style={{
        background: copied ? 'rgba(34,197,94,0.1)' : 'var(--c-surface)',
        border:     `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'var(--c-border)'}`,
        color:      copied ? '#22c55e' : 'var(--c-text-3)',
        cursor:     'pointer',
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function Section({
  icon: Icon,
  title,
  items,
  color,
  bg,
  copyable = false,
}: {
  icon:      React.ElementType;
  title:     string;
  items:     string[];
  color:     string;
  bg:        string;
  copyable?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Icon size={13} color={color} />
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          {title}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-lg px-3 py-2.5 flex items-start justify-between gap-2"
            style={{ background: bg, border: `1px solid ${color}22` }}
          >
            <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--c-text-2)' }}>
              {item}
            </p>
            {copyable && <CopyButton text={item} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HistoricalSynthesisSection({ token }: Props) {
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<Synthesis | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res  = await fetch(`/api/portal/${token}/historical-synthesis`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Ocurrió un error al analizar el historial.');
      } else {
        setResult(data as Synthesis);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
        Analiza las últimas 60 días de llamadas para detectar patrones, brechas en el manual y lo que tu empleado hace bien. Las sugerencias están listas para copiar.
      </p>

      {!result && (
        <button
          onClick={analyze}
          disabled={loading}
          className="self-start flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl transition-opacity disabled:opacity-60"
          style={{
            background: loading ? 'var(--c-surface-2)' : 'rgba(108,59,255,0.12)',
            border:     '1px solid rgba(108,59,255,0.3)',
            color:      '#6C3BFF',
            cursor:     loading ? 'default' : 'pointer',
          }}
        >
          <BarChart2 size={14} />
          {loading ? 'Analizando historial…' : 'Analizar historial de llamadas'}
        </button>
      )}

      {error && (
        <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
            Basado en {result.total} llamadas de los últimos 60 días
          </p>

          <Section
            icon={TrendingUp}
            title="Patrones frecuentes"
            items={result.patterns}
            color="#6C3BFF"
            bg="rgba(108,59,255,0.06)"
          />

          <Section
            icon={AlertCircle}
            title="Brechas en el manual"
            items={result.gaps}
            color="#f59e0b"
            bg="rgba(245,158,11,0.06)"
          />

          <Section
            icon={CheckCircle}
            title="Lo que funciona"
            items={result.wins}
            color="#22c55e"
            bg="rgba(34,197,94,0.06)"
          />

          <Section
            icon={Lightbulb}
            title="Sugerencias para el manual"
            items={result.suggestions}
            color="#3b82f6"
            bg="rgba(59,130,246,0.06)"
            copyable
          />

          <button
            onClick={analyze}
            disabled={loading}
            className="self-start text-[11px] font-medium px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
            style={{
              background: 'var(--c-surface-2)',
              border:     '1px solid var(--c-border)',
              color:      'var(--c-text-3)',
              cursor:     'pointer',
            }}
          >
            Volver a analizar (6 tareas)
          </button>
        </div>
      )}

      {!result && !loading && (
        <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
          Consume 6 tareas · se necesitan al menos 5 llamadas en los últimos 60 días
        </p>
      )}
    </div>
  );
}
