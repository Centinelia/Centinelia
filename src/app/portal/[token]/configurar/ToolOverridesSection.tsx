'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { toast } from 'sonner';

interface AvailableTool {
  name:               string;
  label:              string;
  description:        string;
  source:             'universal' | 'preset' | 'extra' | 'pack';
  state:              'on' | 'off';
  inPreset:           boolean;
  disabledByOverride: boolean;
  enabledByOverride:  boolean;
}

interface ToolGroup {
  id:          string;
  label:       string;
  description: string | null;
  tools:       AvailableTool[];
}

interface Overrides {
  disabled: string[];
  enabled:  string[];
}

interface ApiResponse {
  overrides: Overrides;
  groups:    ToolGroup[];
}

interface Props {
  token:      string;
  agentId:    string;
  agentName:  string;
  roleColor:  string;
}

function Toggle({ on, onChange, disabled, ariaLabel }: {
  on:        boolean;
  onChange:  (v: boolean) => void;
  disabled:  boolean;
  ariaLabel: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width:         44,
        height:        24,
        borderRadius:  12,
        border:        'none',
        cursor:        disabled ? 'default' : 'pointer',
        background:    on ? '#6C3BFF' : '#FAFAFB',
        outline:       on ? '2px solid rgba(108,59,255,0.3)' : '1px solid #E8E3F5',
        outlineOffset: 0,
        position:      'relative',
        transition:    'background 0.2s, outline 0.2s',
        flexShrink:    0,
      }}
    >
      <span style={{
        position:     'absolute',
        top:          3,
        left:         on ? 23 : 3,
        width:        18,
        height:       18,
        borderRadius: '50%',
        background:   '#fff',
        transition:   'left 0.18s',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

export default function ToolOverridesSection({ token, agentId, agentName, roleColor }: Props) {
  const [data,    setData]    = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/agentes/${agentId}/available-tools`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as ApiResponse;
      setData(json);
      const initialOpen: Record<string, boolean> = {};
      for (const g of json.groups) initialOpen[g.id] = false;
      setOpenGroups(initialOpen);
    } catch {
      toast.error('No se pudieron cargar las herramientas.');
    } finally {
      setLoading(false);
    }
  }, [token, agentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const toggleGroup = (id: string) => setOpenGroups(s => ({ ...s, [id]: !s[id] }));

  const patchOverrides = async (next: Overrides) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/agentes/${agentId}/tool-overrides`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      toast.error('No se pudo guardar. Recargando estado.');
      await load();
      throw new Error('patch failed');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (tool: AvailableTool, next: boolean) => {
    if (!data || saving) return;
    const overrides = data.overrides;
    const nextOv: Overrides = {
      disabled: [...overrides.disabled],
      enabled:  [...overrides.enabled],
    };

    if (!next) {
      if (tool.enabledByOverride) {
        nextOv.enabled = nextOv.enabled.filter(n => n !== tool.name);
      } else if (tool.inPreset) {
        if (!nextOv.disabled.includes(tool.name)) nextOv.disabled.push(tool.name);
      }
    } else {
      if (tool.disabledByOverride) {
        nextOv.disabled = nextOv.disabled.filter(n => n !== tool.name);
      } else if (!tool.inPreset) {
        if (!nextOv.enabled.includes(tool.name)) nextOv.enabled.push(tool.name);
      }
    }

    const nextGroups: ToolGroup[] = data.groups.map(g => ({
      ...g,
      tools: g.tools.map(t => {
        if (t.name !== tool.name) return t;
        const nowDisabled = nextOv.disabled.includes(t.name);
        const nowEnabled  = nextOv.enabled.includes(t.name);
        const nextState: 'on' | 'off' = (t.inPreset || nowEnabled) && !nowDisabled ? 'on' : 'off';
        return { ...t, state: nextState, disabledByOverride: nowDisabled, enabledByOverride: nowEnabled };
      }),
    }));
    setData({ overrides: nextOv, groups: nextGroups });

    try { await patchOverrides(nextOv); } catch { /* load() ya restauró */ }
  };

  return (
    <section className="scroll-mt-6">
      <div className="mb-4 flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${roleColor}14`, color: roleColor }}
        >
          <Wrench size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text)' }}>
            Herramientas de {agentName}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Ajusta caso por caso cuáles herramientas puede usar. Por default aplica el preset del rol; aquí quitas lo que no quieras o agregas extras disponibles.
          </p>
        </div>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Cargando…</p>
      )}

      {!loading && data && (
        <div className="flex flex-col gap-2">
          {data.groups.map(group => {
            const open    = !!openGroups[group.id];
            const onCount = group.tools.filter(t => t.state === 'on').length;

            return (
              <div
                key={group.id}
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left transition-opacity hover:opacity-80"
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                      {group.label}
                    </div>
                    {group.description && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                        {group.description}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: `${roleColor}14`, color: roleColor }}
                  >
                    {onCount} activas / {group.tools.length}
                  </span>
                </button>

                {open && (
                  <div style={{ borderTop: '1px solid var(--c-border-2)' }}>
                    {group.tools.length === 0 ? (
                      <p className="px-4 py-3 text-xs" style={{ color: 'var(--c-text-3)' }}>
                        Sin herramientas en este grupo.
                      </p>
                    ) : group.tools.map(tool => (
                      <ToolRow
                        key={tool.name}
                        tool={tool}
                        onToggle={(next) => onToggle(tool, next)}
                        disabled={saving}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ToolRow({
  tool, onToggle, disabled,
}: {
  tool:     AvailableTool;
  onToggle: (next: boolean) => void;
  disabled: boolean;
}) {
  const on = tool.state === 'on';
  return (
    <div
      className="px-4 py-3 flex items-start gap-3"
      style={{ borderBottom: '1px solid var(--c-border-2)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            {tool.label}
          </span>
          {tool.disabledByOverride && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}
            >
              Apagada por ti
            </span>
          )}
          {tool.enabledByOverride && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}
            >
              Agregada por ti
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
          {tool.description}
        </p>
      </div>
      <Toggle
        on={on}
        onChange={onToggle}
        disabled={disabled}
        ariaLabel={`${on ? 'Desactivar' : 'Activar'} ${tool.label}`}
      />
    </div>
  );
}
