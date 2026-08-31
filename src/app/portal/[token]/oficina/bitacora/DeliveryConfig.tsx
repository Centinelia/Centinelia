'use client';

import { useState } from 'react';
import { Mail, Plus, X, Save } from 'lucide-react';

interface Config {
  enabled:                       boolean;
  day_of_week:                   number;
  hour:                          number;
  recipients:                    string[];
  include_monthly_last_saturday: boolean;
}

interface Props {
  token:   string;
  agentId: string;
  initial: Config;
}

const DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function DeliveryConfig({ token, agentId, initial }: Props) {
  const [cfg,      setCfg]      = useState<Config>(initial);
  const [newEmail, setNewEmail] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  function addRecipient() {
    const e = newEmail.trim().toLowerCase();
    if (!isValidEmail(e)) { setError('Correo no válido'); return; }
    if (cfg.recipients.includes(e)) { setError('Ese correo ya está en la lista'); return; }
    setCfg({ ...cfg, recipients: [...cfg.recipients, e] });
    setNewEmail('');
    setError(null);
    setSaved(false);
  }

  function removeRecipient(email: string) {
    setCfg({ ...cfg, recipients: cfg.recipients.filter(e => e !== email) });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/delivery-config?agent_id=${agentId}`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(cfg),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'No se pudo guardar');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-xl p-4 md:p-5"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Mail size={16} style={{ color: '#6C3BFF' }} />
        <h2 className="text-sm font-bold" style={{ color: '#1A0A3B' }}>
          Envío automático por correo
        </h2>
      </div>
      <p className="text-xs mb-4" style={{ color: '#6B6480' }}>
        Manda la bitácora de la semana por correo automáticamente. Al final del mes también incluye el reporte mensual acumulado.
      </p>

      {/* Enabled toggle */}
      <div className="flex items-center justify-between py-2 mb-2">
        <label className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>
          Activar envío automático
        </label>
        <button
          type="button"
          onClick={() => { setCfg({ ...cfg, enabled: !cfg.enabled }); setSaved(false); }}
          className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
          style={{ background: cfg.enabled ? '#6C3BFF' : '#E8E3F5', border: 'none', cursor: 'pointer' }}
        >
          <span
            className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
            style={{ transform: cfg.enabled ? 'translateX(20px)' : 'translateX(4px)' }}
          />
        </button>
      </div>

      {cfg.enabled && (
        <>
          {/* Day + hour */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[11px] font-semibold block mb-1" style={{ color: '#6B6480' }}>Día de la semana</label>
              <select
                value={cfg.day_of_week}
                onChange={e => { setCfg({ ...cfg, day_of_week: Number(e.target.value) }); setSaved(false); }}
                className="w-full text-xs px-2 py-1.5 rounded outline-none"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
              >
                {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold block mb-1" style={{ color: '#6B6480' }}>Hora (MX)</label>
              <select
                value={cfg.hour}
                onChange={e => { setCfg({ ...cfg, hour: Number(e.target.value) }); setSaved(false); }}
                className="w-full text-xs px-2 py-1.5 rounded outline-none"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                ))}
              </select>
            </div>
          </div>

          {/* Include monthly */}
          <div className="flex items-center justify-between py-2 mb-3">
            <label className="text-xs" style={{ color: '#1A0A3B' }}>
              Incluir reporte mensual el último {(DAYS.find(d => d.value === cfg.day_of_week)?.label ?? 'sábado').toLowerCase()} del mes
            </label>
            <button
              type="button"
              onClick={() => { setCfg({ ...cfg, include_monthly_last_saturday: !cfg.include_monthly_last_saturday }); setSaved(false); }}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ background: cfg.include_monthly_last_saturday ? '#6C3BFF' : '#E8E3F5', border: 'none', cursor: 'pointer' }}
            >
              <span
                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                style={{ transform: cfg.include_monthly_last_saturday ? 'translateX(20px)' : 'translateX(4px)' }}
              />
            </button>
          </div>

          {/* Recipients */}
          <div className="mb-3">
            <label className="text-[11px] font-semibold block mb-1" style={{ color: '#6B6480' }}>
              Destinatarios
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {cfg.recipients.length === 0 && (
                <span className="text-[11px] italic" style={{ color: '#9B8FB5' }}>Sin destinatarios configurados</span>
              )}
              {cfg.recipients.map(e => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded"
                  style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}
                >
                  {e}
                  <button
                    type="button"
                    onClick={() => removeRecipient(e)}
                    className="ml-1 hover:opacity-60"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="correo@dominio.com"
                value={newEmail}
                onChange={e => { setNewEmail(e.target.value); setError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                className="flex-1 text-xs px-2 py-1.5 rounded outline-none"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
              />
              <button
                type="button"
                onClick={addRecipient}
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded transition-opacity hover:opacity-80"
                style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF', border: 'none', cursor: 'pointer' }}
              >
                <Plus size={12} /> Agregar
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div
          className="text-[11px] px-2 py-1 rounded mb-2"
          style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626' }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: '#6C3BFF', color: '#ffffff', border: 'none', cursor: 'pointer' }}
      >
        <Save size={12} />
        {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
