'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldCheck, Loader2, X } from 'lucide-react';
import AgentRulesCard, { type AgentRule }  from './AgentRulesCard';
import AgentRulesModal, { type RuleFormData } from './AgentRulesModal';

const LS_TOOLTIP_KEY = 'centinelia_rules_tooltip_seen';

interface Props {
  token: string;
}

export default function AgentRulesSection({ token }: Props) {
  const [rules,       setRules]       = useState<AgentRule[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [showModal,   setShowModal]   = useState(false);
  const [editTarget,  setEditTarget]  = useState<AgentRule | null>(null);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [isSaving,    setIsSaving]    = useState(false);
  const [mutating,    setMutating]    = useState<Record<string, 'deactivating' | 'deleting' | null>>({});
  const [showTooltip, setShowTooltip] = useState(false);

  // Mapa role -> display name para chips
  const [agentNamesMap, setAgentNamesMap] = useState<Record<string, string>>({});

  // Tooltip educativo: primera vez
  useEffect(() => {
    try {
      const seen = localStorage.getItem(LS_TOOLTIP_KEY);
      if (!seen) setShowTooltip(true);
    } catch { /* SSR */ }
  }, []);

  const dismissTooltip = () => {
    setShowTooltip(false);
    try { localStorage.setItem(LS_TOOLTIP_KEY, '1'); } catch { /* ok */ }
  };

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/portal/${token}/agent-rules`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reglas');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Cargar nombres de agentes para los chips
  const loadAgentNames = useCallback(async () => {
    try {
      const res  = await fetch(`/api/portal/${token}/agentes`);
      if (!res.ok) return;
      const data = await res.json();
      const agents = data.agents ?? data.voice_agents ?? [];
      const map: Record<string, string> = {};
      for (const a of agents) {
        if (a.role) map[a.role] = a.agent_name?.trim() || a.role;
      }
      setAgentNamesMap(map);
    } catch { /* silencioso */ }
  }, [token]);

  useEffect(() => {
    loadRules();
    loadAgentNames();
  }, [loadRules, loadAgentNames]);

  function openCreate() {
    setEditTarget(null);
    setSaveError(null);
    setShowModal(true);
  }

  function openEdit(rule: AgentRule) {
    setEditTarget(rule);
    setSaveError(null);
    setShowModal(true);
  }

  async function handleSave(data: RuleFormData) {
    setIsSaving(true);
    setSaveError(null);
    try {
      const isEdit = !!editTarget?.id;
      const url    = isEdit
        ? `/api/portal/${token}/agent-rules/${editTarget!.id}`
        : `/api/portal/${token}/agent-rules`;
      const res = await fetch(url, {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setShowModal(false);
      setEditTarget(null);
      await loadRules();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar la regla');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(rule: AgentRule) {
    setMutating(p => ({ ...p, [rule.id]: 'deactivating' }));
    try {
      await fetch(`/api/portal/${token}/agent-rules/${rule.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: false }),
      });
      await loadRules();
    } catch { /* silencioso */ }
    setMutating(p => { const n = { ...p }; delete n[rule.id]; return n; });
  }

  async function handleDelete(rule: AgentRule) {
    if (!confirm(`¿Eliminar la regla "${rule.regla}"? Esta acción no se puede deshacer.`)) return;
    setMutating(p => ({ ...p, [rule.id]: 'deleting' }));
    try {
      await fetch(`/api/portal/${token}/agent-rules/${rule.id}`, { method: 'DELETE' });
      await loadRules();
    } catch { /* silencioso */ }
    setMutating(p => { const n = { ...p }; delete n[rule.id]; return n; });
  }

  const activeRules   = rules.filter(r => r.active);
  const inactiveRules = rules.filter(r => !r.active);

  return (
    <div id="reglas-del-negocio" className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2" style={{ color: '#1A0A3B' }}>
          <ShieldCheck size={18} />
          <h3 className="font-semibold">Reglas del negocio</h3>
          {activeRules.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8E3F5', color: '#6C3BFF' }}>
              {activeRules.length} {activeRules.length === 1 ? 'activa' : 'activas'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#ffffff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
        >
          <Plus size={13} />
          Nueva regla
        </button>
      </div>

      {/* Descripción */}
      <p className="text-sm" style={{ color: '#4A3B6B' }}>
        Las reglas definen cómo opera tu negocio siempre. Todos tus empleados digitales las siguen en cada conversación, sin importar el canal.
      </p>

      {/* Tooltip educativo (primera visita) */}
      {showTooltip && (
        <div
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold mb-1" style={{ color: '#6C3BFF' }}>
              ¿Qué es una regla?
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#4A3B6B' }}>
              Una regla es cómo opera tu negocio siempre. Todos tus empleados digitales las siguen en cada conversación, correo y llamada. Son distintas de las tareas, que son acciones concretas que el empleado realiza en ciertos momentos.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissTooltip}
            className="p-1 rounded flex-shrink-0 transition-opacity hover:opacity-60"
            style={{ color: '#9B8FB5' }}
            aria-label="Cerrar sugerencia"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error de carga */}
      {error && (
        <div className="text-sm px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <X size={14} />
          <span>{error}</span>
          <button type="button" onClick={loadRules} className="ml-auto underline text-xs">Reintentar</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2" style={{ color: '#4A3B6B' }}>
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Cargando reglas...</span>
        </div>
      )}

      {/* Lista de reglas activas */}
      {!loading && activeRules.length === 0 && (
        <div
          className="text-sm py-6 text-center rounded-lg"
          style={{ color: '#4A3B6B', background: '#FFFFFF', border: '1px dashed #E8E3F5' }}
          data-testid="empty-rules"
        >
          Aún no tienes reglas. Agrega la primera para que tus empleados sepan cómo operar.
        </div>
      )}

      {!loading && activeRules.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="rules-list">
          {activeRules.map(rule => (
            <AgentRulesCard
              key={rule.id}
              rule={rule}
              agentNamesMap={agentNamesMap}
              onEdit={() => openEdit(rule)}
              onDeactivate={() => handleDeactivate(rule)}
              onDelete={() => handleDelete(rule)}
              isDeactivating={mutating[rule.id] === 'deactivating'}
              isDeleting={mutating[rule.id] === 'deleting'}
            />
          ))}
        </div>
      )}

      {/* Reglas inactivas (colapsadas) */}
      {!loading && inactiveRules.length > 0 && (
        <details className="group">
          <summary
            className="text-xs cursor-pointer select-none py-1"
            style={{ color: '#9B8FB5' }}
          >
            {inactiveRules.length} {inactiveRules.length === 1 ? 'regla desactivada' : 'reglas desactivadas'}
          </summary>
          <div className="flex flex-col gap-2 mt-2">
            {inactiveRules.map(rule => (
              <AgentRulesCard
                key={rule.id}
                rule={rule}
                agentNamesMap={agentNamesMap}
                onEdit={() => openEdit(rule)}
                onDeactivate={() => handleDeactivate(rule)}
                onDelete={() => handleDelete(rule)}
                isDeactivating={mutating[rule.id] === 'deactivating'}
                isDeleting={mutating[rule.id] === 'deleting'}
              />
            ))}
          </div>
        </details>
      )}

      {/* Modal */}
      {showModal && (
        <AgentRulesModal
          token={token}
          initial={editTarget
            ? {
                id:         editTarget.id,
                regla:      editTarget.regla,
                detalles:   editTarget.detalles ?? '',
                applies_to: editTarget.applies_to,
              }
            : undefined
          }
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditTarget(null); setSaveError(null); }}
          isSaving={isSaving}
          error={saveError}
        />
      )}
    </div>
  );
}
