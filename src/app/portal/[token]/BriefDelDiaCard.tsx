'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, AlertCircle, Clock, Info, RefreshCw, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

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
  const [emptyMsg, setEmptyMsg]   = useState<string | null>(null);

  async function fetchLatest() {
    setLoading(true);
    const res = await fetch(`/api/portal/${token}/brief-runs/latest`);
    if (res.ok) setBrief(await res.json());
    else setBrief(null);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchLatest(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;

  const ageLabel = brief ? formatAge(Date.now() - new Date(brief.ran_at).getTime()) : '';

  async function prepareNow() {
    setError(null);
    setEmptyMsg(null);
    setPreparing(true);
    try {
      const res = await fetch(`/api/portal/${token}/nox/prepare-brief`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'No se pudo preparar el brief. Intenta de nuevo en unos momentos.');
      } else if (body?.empty) {
        // No había nada que reportar — no se consumieron tareas
        setEmptyMsg(body.message ?? 'Sin pendientes que reportar por ahora.');
      } else {
        await fetchLatest();
      }
    } catch {
      setError('No se pudo preparar el brief. Intenta de nuevo en unos momentos.');
    } finally {
      setPreparing(false);
    }
  }

  const totalItems = brief
    ? brief.buckets_json.accion.length + brief.buckets_json.prep.length + brief.buckets_json.fyi.length
    : 0;

  return (
    <section className="flex flex-col gap-3">
      {/* Header — sub-sección dentro del card padre "Tu equipo hoy" */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.20)' }}>
            <Sparkles size={13} style={{ color: '#6C3BFF' }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-[13px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                Brief del día
              </h3>
              {brief && totalItems > 0 && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>
                  {totalItems}
                </span>
              )}
              <InfoTooltip text={"Resumen que tu equipo prepara para arrancar el día.\n\nAgrupa lo que requiere acción, lo que necesita preparación y lo que solo debes saber, basado en tus correos, tareas pendientes y actividad de los empleados.\n\nSe actualiza automático cada mañana. Cada actualización (automática o manual) consume 5 tareas de la jornada."} />
            </div>
            {brief && (
              <p className="text-[11px] mt-0.5" style={{ color: '#9B8FB5' }}>
                Actualizado {ageLabel}
              </p>
            )}
          </div>
        </div>
        {brief && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 rounded-md transition-opacity hover:opacity-70"
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
            style={{ color: '#9B8FB5', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Body */}
      {expanded && (
        !brief ? (
          <div className="flex flex-col items-start gap-2 p-3 rounded-lg"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            <p className="text-[12px]" style={{ color: '#6B6480' }}>
              Aún no hay brief para hoy. Tu equipo puede prepararlo ahora si lo necesitas.
            </p>
            <button
              disabled={preparing}
              onClick={prepareNow}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)', cursor: preparing ? 'wait' : 'pointer' }}
            >
              <RefreshCw size={12} className={preparing ? 'animate-spin' : ''} />
              {preparing ? 'Preparando…' : 'Preparar ahora'}
            </button>
            <p className="text-[10px]" style={{ color: '#9B8FB5' }}>
              Consume 5 tareas de tu jornada.
            </p>
            {error && (
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#ef4444' }}>
                <AlertCircle size={12} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {emptyMsg && (
              <div className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-md"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#16A34A' }}>
                <Info size={12} className="shrink-0" />
                <span>{emptyMsg}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <BucketBlock
              icon={<AlertTriangle size={13} style={{ color: '#ef4444' }} />}
              title="Requiere acción"
              items={brief.buckets_json.accion}
              accent="#ef4444"
            />
            <BucketBlock
              icon={<Clock size={13} style={{ color: '#f59e0b' }} />}
              title="Necesita preparación"
              items={brief.buckets_json.prep}
              accent="#f59e0b"
            />
            <BucketBlock
              icon={<Info size={13} style={{ color: '#6B6480' }} />}
              title="Al tanto"
              items={brief.buckets_json.fyi}
              accent="#6B6480"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              {error && (
                <div className="flex items-center gap-1.5 text-[11px] mr-auto" style={{ color: '#ef4444' }}>
                  <AlertCircle size={12} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {emptyMsg && (
                <div className="flex items-center gap-1.5 text-[11px] mr-auto" style={{ color: '#16A34A' }}>
                  <Info size={12} className="shrink-0" />
                  <span>{emptyMsg}</span>
                </div>
              )}
              <button
                disabled={preparing}
                onClick={prepareNow}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 h-7 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480', cursor: preparing ? 'wait' : 'pointer' }}
              >
                <RefreshCw size={11} className={preparing ? 'animate-spin' : ''} />
                {preparing ? 'Actualizando…' : 'Actualizar (5 tareas)'}
              </button>
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
  accent,
}: {
  icon:   React.ReactNode;
  title:  string;
  items:  string[];
  accent: string;
}) {
  const isEmpty = items.length === 0;
  return (
    <div className="rounded-lg p-3"
      style={{
        background: isEmpty ? '#FAFAFB' : `${accent}08`,
        border:     isEmpty ? '1px solid #E8E3F5' : `1px solid ${accent}22`,
      }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <h4 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isEmpty ? '#9B8FB5' : accent }}>
          {title}
        </h4>
        {!isEmpty && (
          <span className="text-[10px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
            {items.length}
          </span>
        )}
      </div>
      {isEmpty ? (
        <p className="text-[11px] pl-5" style={{ color: '#9B8FB5', fontStyle: 'italic' }}>Sin pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-1 pl-5">
          {items.map((item, i) => (
            <li key={i} className="text-[12px] list-disc leading-relaxed" style={{ color: '#1A0A3B' }}>
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
