'use client';

/**
 * AgentMissionsSection — lista de tareas programadas de un empleado.
 *
 * - Carga tareas vía GET /api/portal/[token]/agent-missions?agent_id=...
 * - Botón "Nueva tarea" abre el wizard de 4 pasos (MAPS).
 * - Permite editar, desactivar y ejecutar tareas existentes.
 * - Tareas inactivas se muestran en un <details> colapsado (hide over disable).
 * - Tooltip educativo de primera visita (localStorage).
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, ListTodo, Info, X } from 'lucide-react';
import AgentMissionsWizard, { type MissionFormData } from './AgentMissionsWizard';
import AgentMissionsCard,   { type AgentTask }       from './AgentMissionsCard';

interface Props {
  agentId:   string;
  agentName: string;
  token:     string;
}

const TOOLTIP_KEY = 'centinelia_missions_tooltip_seen';

export default function AgentMissionsSection({ agentId, agentName, token }: Props) {
  const [tasks,      setTasks]      = useState<AgentTask[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const [showWizard, setShowWizard] = useState(false);
  const [editTask,   setEditTask]   = useState<AgentTask | null>(null);
  const [isSaving,   setIsSaving]   = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);

  const [executingId,   setExecutingId]   = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const [showTooltip, setShowTooltip] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/portal/${token}/agent-missions?agent_id=${agentId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar las tareas');
      setTasks(json.tasks ?? json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las tareas');
    } finally {
      setLoading(false);
    }
  }, [token, agentId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Tooltip primera visita
  useEffect(() => {
    try {
      const seen = localStorage.getItem(TOOLTIP_KEY);
      if (!seen) setShowTooltip(true);
    } catch { /* SSR / incognito */ }
  }, []);

  function dismissTooltip() {
    setShowTooltip(false);
    try { localStorage.setItem(TOOLTIP_KEY, '1'); } catch { /* ok */ }
  }

  // ── Mutaciones ────────────────────────────────────────────────────────────

  async function handleSave(data: MissionFormData) {
    setIsSaving(true);
    setSaveError(null);
    try {
      if (editTask) {
        // Editar tarea existente
        const res = await fetch(`/api/portal/${token}/agent-missions/${editTask.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            mission:        data.mission,
            trigger_type:   data.trigger_type,
            trigger_config: data.trigger_config,
            parameters:     data.parameters,
            deliverable:    data.deliverable,
            slug:           data.slug,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Error al actualizar la tarea');
      } else {
        // Crear tarea nueva
        const res = await fetch(`/api/portal/${token}/agent-missions`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            ownerAgentId:  agentId,
            mission:       data.mission,
            trigger_type:  data.trigger_type,
            trigger_config: data.trigger_config,
            parameters:    data.parameters,
            deliverable:   data.deliverable,
            slug:          data.slug,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Error al crear la tarea');
      }
      setShowWizard(false);
      setEditTask(null);
      await fetchTasks();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Ocurrió un error. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(taskId: string) {
    setDeactivatingId(taskId);
    try {
      const res  = await fetch(`/api/portal/${token}/agent-missions/${taskId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al desactivar');
      await fetchTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al desactivar');
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleExecute(taskId: string) {
    setExecutingId(taskId);
    try {
      const res  = await fetch(`/api/portal/${token}/agent-missions/${taskId}/execute`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al ejecutar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al ejecutar la tarea');
    } finally {
      setExecutingId(null);
    }
  }

  // ── Separar activas / inactivas ───────────────────────────────────────────

  const active   = tasks.filter(t => t.active);
  const inactive = tasks.filter(t => !t.active);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div id="tareas-del-empleado" className="flex flex-col gap-4" style={{ scrollMarginTop: 80 }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo size={18} style={{ color: '#6C3BFF' }} />
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Tareas de {agentName}
            </h2>
          </div>
          <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
            Acciones que {agentName} ejecuta de forma autónoma según una agenda o una señal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditTask(null); setSaveError(null); setShowWizard(true); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
          style={{ background: '#6C3BFF', color: '#ffffff', flexShrink: 0 }}
        >
          <Plus size={15} />
          Nueva tarea
        </button>
      </div>

      {/* Tooltip educativo de primera visita */}
      {showTooltip && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl relative"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          <Info size={16} style={{ color: '#6C3BFF', flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm leading-relaxed flex-1" style={{ color: '#4A3B6B' }}>
            Las tareas son acciones que tu empleado puede ejecutar de forma autónoma: cobrar morosos
            cada lunes, enviar resúmenes semanales, responder a frases específicas de clientes y más.
            Configura cuándo, cómo y qué debe entregar.
          </p>
          <button
            type="button"
            onClick={dismissTooltip}
            className="p-1 rounded-lg hover:opacity-60"
            style={{ color: '#9B8FB5', flexShrink: 0 }}
            aria-label="Cerrar sugerencia"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error de carga */}
      {error && !loading && (
        <div
          className="text-sm px-4 py-3 rounded-xl"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin" style={{ color: '#9B8FB5' }} />
        </div>
      )}

      {/* Lista vacía */}
      {!loading && active.length === 0 && inactive.length === 0 && (
        <div
          data-testid="empty-missions"
          className="flex flex-col items-center gap-3 py-12 rounded-xl"
          style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5' }}
        >
          <ListTodo size={32} style={{ color: '#D1C4E9' }} />
          <p className="text-sm font-medium" style={{ color: '#9B8FB5' }}>
            {agentName} todavía no tiene tareas programadas.
          </p>
          <button
            type="button"
            onClick={() => { setEditTask(null); setSaveError(null); setShowWizard(true); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
          >
            + Crear primera tarea
          </button>
        </div>
      )}

      {/* Tareas activas */}
      {!loading && active.length > 0 && (
        <div data-testid="missions-list" className="flex flex-col gap-3">
          {active.map(t => (
            <AgentMissionsCard
              key={t.id}
              task={t}
              onEdit={task => { setEditTask(task); setSaveError(null); setShowWizard(true); }}
              onDeactivate={handleDeactivate}
              onExecute={handleExecute}
              isExecuting={executingId   === t.id}
              isDeactivating={deactivatingId === t.id}
            />
          ))}
        </div>
      )}

      {/* Tareas inactivas */}
      {!loading && inactive.length > 0 && (
        <details className="mt-1">
          <summary
            className="text-xs font-semibold cursor-pointer select-none px-1 py-0.5"
            style={{ color: '#9B8FB5', WebkitAppearance: 'none' } as React.CSSProperties}
          >
            {inactive.length} {inactive.length === 1 ? 'tarea inactiva' : 'tareas inactivas'}
          </summary>
          <div className="flex flex-col gap-2 mt-2 opacity-60">
            {inactive.map(t => (
              <AgentMissionsCard
                key={t.id}
                task={t}
                onEdit={task => { setEditTask(task); setSaveError(null); setShowWizard(true); }}
                onDeactivate={handleDeactivate}
                onExecute={handleExecute}
              />
            ))}
          </div>
        </details>
      )}

      {/* Wizard modal */}
      {showWizard && (
        <AgentMissionsWizard
          agentId={agentId}
          agentName={agentName}
          token={token}
          onSave={handleSave}
          onCancel={() => { setShowWizard(false); setEditTask(null); setSaveError(null); }}
          isSaving={isSaving}
          error={saveError}
          editTask={editTask}
        />
      )}
    </div>
  );
}
