'use client';

import { useState, useEffect } from 'react';
import { Mail, FolderOpen, PhoneOutgoing, Calendar, Users2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

const CAPABILITIES_CONFIG = [
  {
    capability:  'email',
    label:       'Correo electrónico',
    description: 'Tu empleado puede enviar correos en nombre de la organización.',
    icon:        Mail,
    active:      true,
  },
  {
    capability:  'files',
    label:       'Archivos',
    description: 'Tu empleado puede buscar, leer y guardar archivos en Drive o OneDrive.',
    icon:        FolderOpen,
    active:      true,
  },
  {
    capability:  'phone',
    label:       'Llamadas salientes',
    description: 'Tu empleado puede iniciar llamadas telefónicas salientes.',
    icon:        PhoneOutgoing,
    active:      true,
  },
  {
    capability:  'calendar',
    label:       'Calendario',
    description: 'Tu empleado puede crear y gestionar eventos en tu calendario.',
    icon:        Calendar,
    active:      true,
  },
  {
    capability:  'crm',
    label:       'CRM',
    description: 'Tu empleado puede leer y escribir registros en tu CRM.',
    icon:        Users2,
    active:      true,
  },
];

const CAPABILITY_LABELS: Record<string, string> = {
  email:    'Correo',
  files:    'Archivos',
  phone:    'Teléfono',
  calendar: 'Calendario',
  crm:      'CRM',
};

const STATUS_CFG: Record<string, { label: string; color: string; Icon: typeof CheckCircle }> = {
  completed:        { label: 'Completado',  color: '#22c55e', Icon: CheckCircle  },
  blocked:          { label: 'Bloqueado',   color: '#ef4444', Icon: XCircle      },
  pending_approval: { label: 'Pendiente',   color: '#f59e0b', Icon: AlertCircle  },
  failed:           { label: 'Fallido',     color: '#ef4444', Icon: XCircle      },
};

interface Policy {
  capability:         string;
  enabled:            boolean;
  requires_approval:  boolean;
  preferred_provider: string | null;
}

interface AuditEntry {
  id:         string;
  capability: string;
  action:     string;
  status:     string;
  created_at: string;
}

function fmtRelative(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export default function PoliciesSection({ token }: { token: string }) {
  const [policies, setPolicies]   = useState<Policy[]>([]);
  const [audit,    setAudit]      = useState<AuditEntry[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}/policies`)
      .then(r => r.json())
      .then(d => {
        setPolicies(d.policies ?? []);
        setAudit(d.audit ?? []);
        setLoading(false);
      });
  }, [token]);

  const getPolicy = (cap: string): Policy =>
    policies.find(p => p.capability === cap) ?? {
      capability: cap, enabled: true, requires_approval: false, preferred_provider: null,
    };

  const toggleEnabled = async (capability: string, value: boolean) => {
    setSaving(capability);
    setPolicies(prev => {
      const exists = prev.find(p => p.capability === capability);
      if (exists) return prev.map(p => p.capability === capability ? { ...p, enabled: value } : p);
      return [...prev, { capability, enabled: value, requires_approval: false, preferred_provider: null }];
    });
    await fetch(`/api/portal/${token}/policies`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ capability, enabled: value }),
    });
    setSaving(null);
  };

  return (
    <div id="politicas">
      {/* Capability toggles */}
      <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-1.5 mb-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Políticas de acceso
          </h2>
          <InfoTooltip text="Controla qué puede hacer tu empleado. Los cambios toman efecto de inmediato." />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1,2,3].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--c-surface-2)' }} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {CAPABILITIES_CONFIG.map(cfg => {
              const policy      = getPolicy(cfg.capability);
              const Icon        = cfg.icon;
              const comingSoon  = !cfg.active;
              const isSaving    = saving === cfg.capability;

              return (
                <div
                  key={cfg.capability}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{
                    background: 'var(--c-surface-2)',
                    border:     `1px solid var(--c-border${policy.enabled && !comingSoon ? '-2' : ''})`,
                    opacity:    comingSoon ? 0.45 : 1,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: policy.enabled && !comingSoon ? 'rgba(108,59,255,0.12)' : 'var(--c-border)',
                      color:      policy.enabled && !comingSoon ? '#9B6DFF' : 'var(--c-text-3)',
                    }}
                  >
                    <Icon size={14} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                        {cfg.label}
                      </span>
                      {comingSoon && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: 'var(--c-border)', color: 'var(--c-text-3)' }}
                        >
                          Próximamente
                        </span>
                      )}
                      {!comingSoon && !policy.enabled && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        >
                          Deshabilitado
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                      {cfg.description}
                    </p>
                  </div>

                  {!comingSoon && (
                    <button
                      disabled={isSaving}
                      onClick={() => toggleEnabled(cfg.capability, !policy.enabled)}
                      aria-label={policy.enabled ? 'Deshabilitar' : 'Habilitar'}
                      style={{
                        position:   'relative',
                        width:       40,
                        height:      22,
                        borderRadius: 9999,
                        background:  policy.enabled ? '#6C3BFF' : 'var(--c-border)',
                        opacity:     isSaving ? 0.5 : 1,
                        flexShrink:  0,
                        border:      'none',
                        cursor:      isSaving ? 'wait' : 'pointer',
                        transition:  'background 0.2s, opacity 0.2s',
                      }}
                    >
                      <span
                        style={{
                          position:     'absolute',
                          top:           3,
                          left:          policy.enabled ? 21 : 3,
                          width:         16,
                          height:        16,
                          borderRadius: '50%',
                          background:    '#fff',
                          transition:    'left 0.18s',
                        }}
                      />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audit log */}
      {!loading && audit.length > 0 && (
        <div className="rounded-xl p-5 mt-3" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Registro de actividad
          </h2>
          <div className="flex flex-col">
            {audit.map((entry, idx) => {
              const cfg = STATUS_CFG[entry.status] ?? STATUS_CFG.completed;
              const StatusIcon = cfg.Icon;
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderBottom: idx < audit.length - 1 ? '1px solid var(--c-divider)' : 'none' }}
                >
                  <StatusIcon size={13} style={{ color: cfg.color, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                      {CAPABILITY_LABELS[entry.capability] ?? entry.capability}
                    </span>
                    <span className="text-xs ml-1.5" style={{ color: 'var(--c-text-3)' }}>
                      {entry.action.split('.').at(-1)?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ background: `${cfg.color}18`, color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                  <span className="text-xs flex-shrink-0 hidden sm:flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
                    <Clock size={10} />
                    {fmtRelative(entry.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
