'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, AlertCircle, Clock, Info, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Brief {
  id:           string;
  brief_md:     string;
  buckets_json: { accion: string[]; prep: string[]; fyi: string[] };
  ran_at:       string;
  trigger:      'cron' | 'reactive';
}

export function BriefDelDiaCard() {
  const { token }             = useParams<{ token: string }>();
  const [brief, setBrief]     = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded]   = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function fetchLatest() {
    setLoading(true);
    const res = await fetch(`/api/portal/${token}/brief-runs/latest`);
    if (res.ok) setBrief(await res.json());
    else setBrief(null);
    setLoading(false);
  }

  useEffect(() => { fetchLatest(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;

  const ageLabel = brief ? formatAge(Date.now() - new Date(brief.ran_at).getTime()) : '';

  return (
    <section className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Brief del día</h2>
          {brief && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Actualizado {ageLabel}
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="transition-opacity hover:opacity-70"
          aria-label={expanded ? 'Colapsar' : 'Expandir'}
          style={{ color: 'var(--c-text-3)' }}
        >
          {expanded
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />}
        </button>
      </header>

      {expanded && (
        !brief ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
              Aún no hay brief preparado para hoy.
            </p>
            <button
              disabled={preparing}
              onClick={async () => {
                setError(null);
                setPreparing(true);
                try {
                  const res = await fetch(`/api/portal/${token}/nox/prepare-brief`, { method: 'POST' });
                  if (!res.ok) {
                    let msg = 'No se pudo preparar el brief. Intenta de nuevo en unos momentos.';
                    try {
                      const body = await res.json();
                      if (body?.error) msg = body.error;
                    } catch { /* ignore parse errors */ }
                    setError(msg);
                  } else {
                    await fetchLatest();
                  }
                } catch {
                  setError('No se pudo preparar el brief. Intenta de nuevo en unos momentos.');
                } finally {
                  setPreparing(false);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: 'var(--c-accent, #6C3BFF)', color: '#fff' }}
            >
              <RefreshCw className={`w-4 h-4 ${preparing ? 'animate-spin' : ''}`} />
              {preparing ? 'Preparando...' : 'Preparar ahora'}
            </button>
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              Cuesta 5 tareas de tu plan.
            </p>
            {error && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: '#ef4444' }}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <BucketBlock
              icon={<AlertTriangle className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />}
              title="Requiere acción"
              items={brief.buckets_json.accion}
            />
            <BucketBlock
              icon={<Clock className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />}
              title="Necesita preparación"
              items={brief.buckets_json.prep}
            />
            <BucketBlock
              icon={<Info className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />}
              title="Al tanto"
              items={brief.buckets_json.fyi}
            />
            <div className="flex flex-col items-end gap-1.5 pt-1">
              <button
                disabled={preparing}
                onClick={async () => {
                  setError(null);
                  setPreparing(true);
                  try {
                    const res = await fetch(`/api/portal/${token}/nox/prepare-brief`, { method: 'POST' });
                    if (!res.ok) {
                      let msg = 'No se pudo preparar el brief. Intenta de nuevo en unos momentos.';
                      try {
                        const body = await res.json();
                        if (body?.error) msg = body.error;
                      } catch { /* ignore parse errors */ }
                      setError(msg);
                    } else {
                      await fetchLatest();
                    }
                  } catch {
                    setError('No se pudo preparar el brief. Intenta de nuevo en unos momentos.');
                  } finally {
                    setPreparing(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ color: 'var(--c-text-3)' }}
              >
                <RefreshCw className={`w-3 h-3 ${preparing ? 'animate-spin' : ''}`} />
                {preparing ? 'Actualizando...' : 'Actualizar (5 tareas)'}
              </button>
              {error && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: '#ef4444' }}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );
}

function BucketBlock({
  icon,
  title,
  items,
}: {
  icon:  React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <h3 className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs pl-5" style={{ color: 'var(--c-text-3)', fontStyle: 'italic' }}>Sin pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-1 pl-5">
          {items.map((item, i) => (
            <li key={i} className="text-xs list-disc" style={{ color: 'var(--c-text)' }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60));
  if (minutes < 2)  return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
