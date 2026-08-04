'use client';

// IMPORTANTE: el default de esta sección es enabled: false.
// Nunca activar el brief automático sin acción explícita del dueño.
// (feedback_no_unilateral_toggles — 2026-08-01)

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props { agentId: string }

interface BriefConfig {
  enabled:  boolean;
  hour:     number;
  channels: { email: boolean; whatsapp: boolean; portal: boolean };
}

// Default deliberadamente desactivado — no cambiar sin instrucción del dueño
const DEFAULT: BriefConfig = {
  enabled:  false,
  hour:     7,
  channels: { email: true, whatsapp: false, portal: true },
};

export function BriefDelDiaSection({ agentId }: Props) {
  const { token } = useParams<{ token: string }>();
  const [config,  setConfig]  = useState<BriefConfig>(DEFAULT);
  const [loaded,  setLoaded]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token || !agentId) return;
    fetch(`/api/portal/${token}/brief-config?agent_id=${agentId}`)
      .then(r => r.json())
      .then(res => {
        if (res.config) setConfig(res.config);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [token, agentId]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/brief-config?agent_id=${agentId}`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ config }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? 'No se pudo guardar.');
      } else {
        setSaved(true);
      }
    } catch {
      setError('No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  const hourLabel = (h: number) => h.toString().padStart(2, '0') + ':00';

  return (
    <div className="flex flex-col gap-4">

      {/* Toggle principal */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={e => {
            setConfig({ ...config, enabled: e.target.checked });
            setSaved(false);
          }}
          className="w-4 h-4 rounded accent-[#6C3BFF] cursor-pointer"
        />
        <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
          Activar brief diario automático
        </span>
      </label>

      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
        Cada brief consume 5 tareas de tu plan. Si se activa automático, se ejecuta una vez al día a la hora que elijas.
      </p>

      {/* Configuración adicional — solo visible cuando está activado */}
      {config.enabled && (
        <div className="flex flex-col gap-4 pl-7">

          {/* Hora de entrega */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--c-text-3)' }}>
              Hora de entrega
            </p>
            <Select
              value={String(config.hour)}
              onValueChange={val => {
                setConfig({ ...config, hour: Number(val) });
                setSaved(false);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue>{hourLabel(config.hour)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Canales de entrega */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--c-text-3)' }}>
              Canales de entrega
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  { key: 'email',     label: 'Correo' },
                  { key: 'whatsapp',  label: 'WhatsApp' },
                  { key: 'portal',    label: 'Portal (card en Inicio)' },
                ] as const
              ).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.channels[key]}
                    onChange={e => {
                      setConfig({
                        ...config,
                        channels: { ...config.channels, [key]: e.target.checked },
                      });
                      setSaved(false);
                    }}
                    className="w-4 h-4 rounded accent-[#6C3BFF] cursor-pointer"
                  />
                  <span className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feedback + botón guardar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>

        {saved && !saving && (
          <span className="text-xs font-medium" style={{ color: '#22c55e' }}>
            Configuración guardada.
          </span>
        )}

        {error && !saving && (
          <span className="text-xs font-medium" style={{ color: '#ef4444' }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
