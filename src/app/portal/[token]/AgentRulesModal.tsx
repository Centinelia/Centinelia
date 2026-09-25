'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Check, Users, User } from 'lucide-react';

export interface RuleFormData {
  regla:      string;
  detalles:   string;
  applies_to: string[];
}

interface Agent {
  id:         string;
  agent_name: string | null;
  role:       string;
  active:     boolean;
}

interface Props {
  token:         string;
  initial?:      RuleFormData & { id?: string };
  onSave:        (data: RuleFormData) => void;
  onCancel:      () => void;
  isSaving?:     boolean;
  error?:        string | null;
}

export default function AgentRulesModal({ token, initial, onSave, onCancel, isSaving, error }: Props) {
  const [regla,      setRegla]      = useState(initial?.regla      ?? '');
  const [detalles,   setDetalles]   = useState(initial?.detalles   ?? '');
  const [appliesToAll, setAppliesToAll] = useState((initial?.applies_to ?? []).length === 0);
  const [appliesTo,  setAppliesTo]  = useState<string[]>(initial?.applies_to ?? []);
  const [agents,     setAgents]     = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    if (appliesToAll) return;
    setLoadingAgents(true);
    fetch(`/api/portal/${token}/agentes`)
      .then(r => r.json())
      .then(d => setAgents((d.agents ?? d.voice_agents ?? []).filter((a: Agent) => a.active)))
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
  }, [appliesToAll, token]);

  function toggleAgent(role: string) {
    setAppliesTo(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      regla:      regla.trim(),
      detalles:   detalles.trim(),
      applies_to: appliesToAll ? [] : appliesTo,
    });
  }

  const isEdit = !!initial?.id;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ background: 'rgba(15,5,34,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl flex flex-col"
        style={{
          background:  '#ffffff',
          border:      '1px solid #E8E3F5',
          boxShadow:   '0 24px 60px rgba(26,10,59,0.20)',
          maxHeight:   '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F0EDF9' }}>
          <h3 className="text-base font-semibold" style={{ color: '#1A0A3B' }}>
            {isEdit ? 'Editar regla' : 'Nueva regla del negocio'}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-60"
            style={{ color: '#6B6480' }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5 overflow-y-auto flex-1">
          {/* Regla */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>
                Regla <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: regla.length > 450 ? '#ef4444' : '#9B8FB5' }}
              >
                {regla.length}/500
              </span>
            </div>
            <textarea
              required
              rows={3}
              maxLength={500}
              value={regla}
              onChange={e => setRegla(e.target.value)}
              placeholder="Ej. Nunca ofrecemos descuentos sin aprobación del dueño."
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                background:   '#FAFAFB',
                border:       '1px solid #E8E3F5',
                color:        '#1A0A3B',
                outline:      'none',
                fontFamily:   'inherit',
              }}
            />
            <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
              Describe una norma de operación clara y específica.
            </p>
          </div>

          {/* Detalles */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>
                Detalles adicionales <span style={{ color: '#9B8FB5' }}>(opcional)</span>
              </label>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: detalles.length > 1800 ? '#ef4444' : '#9B8FB5' }}
              >
                {detalles.length}/2000
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={2000}
              value={detalles}
              onChange={e => setDetalles(e.target.value)}
              placeholder="Contexto adicional, excepciones o ejemplos de aplicación..."
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                background:  '#FAFAFB',
                border:      '1px solid #E8E3F5',
                color:       '#1A0A3B',
                outline:     'none',
                fontFamily:  'inherit',
              }}
            />
          </div>

          {/* Alcance */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>
              Esta regla aplica a
            </p>
            <div className="flex flex-col gap-2">
              <label
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                style={{
                  background: appliesToAll ? 'rgba(108,59,255,0.06)' : '#FAFAFB',
                  border:     appliesToAll ? '2px solid rgba(108,59,255,0.35)' : '1px solid #E8E3F5',
                }}
              >
                <input
                  type="radio"
                  checked={appliesToAll}
                  onChange={() => { setAppliesToAll(true); setAppliesTo([]); }}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: appliesToAll ? '#6C3BFF' : 'transparent',
                    border:     appliesToAll ? '2px solid #6C3BFF' : '2px solid #D1D5DB',
                  }}
                >
                  {appliesToAll && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Users size={14} style={{ color: appliesToAll ? '#6C3BFF' : '#9B8FB5', flexShrink: 0 }} />
                  <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>
                    Todos los empleados digitales
                  </span>
                </div>
              </label>

              <label
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                style={{
                  background: !appliesToAll ? 'rgba(108,59,255,0.06)' : '#FAFAFB',
                  border:     !appliesToAll ? '2px solid rgba(108,59,255,0.35)' : '1px solid #E8E3F5',
                }}
              >
                <input
                  type="radio"
                  checked={!appliesToAll}
                  onChange={() => setAppliesToAll(false)}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: !appliesToAll ? '#6C3BFF' : 'transparent',
                    border:     !appliesToAll ? '2px solid #6C3BFF' : '2px solid #D1D5DB',
                  }}
                >
                  {!appliesToAll && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <User size={14} style={{ color: !appliesToAll ? '#6C3BFF' : '#9B8FB5', flexShrink: 0 }} />
                  <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>
                    Empleados específicos
                  </span>
                </div>
              </label>
            </div>

            {/* Multi-select de agentes */}
            {!appliesToAll && (
              <div className="flex flex-col gap-2 pl-1">
                {loadingAgents ? (
                  <div className="flex items-center gap-2 py-3" style={{ color: '#9B8FB5' }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Cargando empleados...</span>
                  </div>
                ) : agents.length === 0 ? (
                  <p className="text-xs py-2" style={{ color: '#9B8FB5' }}>
                    No hay empleados activos en esta cuenta.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {agents.map(a => {
                      const role     = a.role;
                      const selected = appliesTo.includes(role);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAgent(role)}
                          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={{
                            background: selected ? '#6C3BFF' : '#FFFFFF',
                            color:      selected ? '#FFFFFF' : '#6B6480',
                            border:     selected ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                            boxShadow:  selected ? '0 1px 3px rgba(108,59,255,0.3)' : 'none',
                          }}
                        >
                          {a.agent_name?.trim() || role}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!appliesToAll && appliesTo.length === 0 && agents.length > 0 && (
                  <p className="text-[11px]" style={{ color: '#f59e0b' }}>
                    Selecciona al menos un empleado, o elige "Todos".
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              className="text-sm px-3 py-2 rounded-lg"
              style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
            >
              {error}
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              disabled={isSaving || !regla.trim() || (!appliesToAll && appliesTo.length === 0)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-opacity"
              style={{
                background: '#6C3BFF',
                color:      '#ffffff',
                opacity:    isSaving || !regla.trim() || (!appliesToAll && appliesTo.length === 0) ? 0.5 : 1,
                boxShadow:  '0 1px 2px rgba(108,59,255,0.24)',
              }}
            >
              {isSaving
                ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                : <><Check size={14} /> {isEdit ? 'Guardar cambios' : 'Crear regla'}</>
              }
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
