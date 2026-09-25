'use client';

import { Edit2, Trash2, EyeOff } from 'lucide-react';

export interface AgentRule {
  id:          string;
  regla:       string;
  detalles:    string | null;
  applies_to:  string[];
  active:      boolean;
  created_at:  string;
}

interface Props {
  rule:          AgentRule;
  agentNamesMap: Record<string, string>; // role -> display name
  onEdit:        () => void;
  onDeactivate:  () => void;
  onDelete:      () => void;
  isDeactivating?: boolean;
  isDeleting?:   boolean;
}

export default function AgentRulesCard({
  rule,
  agentNamesMap,
  onEdit,
  onDeactivate,
  onDelete,
  isDeactivating,
  isDeleting,
}: Props) {
  const appliesLabel = rule.applies_to.length === 0
    ? 'Todos los empleados'
    : null;

  return (
    <div
      className="flex flex-col gap-2.5 p-4 rounded-xl transition-opacity"
      style={{
        background: rule.active ? '#ffffff' : '#FAFAFB',
        border:     rule.active ? '1px solid #E8E3F5' : '1px solid #F0EDF9',
        opacity:    rule.active ? 1 : 0.65,
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug" style={{ color: rule.active ? '#1A0A3B' : '#6B6480' }}>
            {rule.regla}
          </p>
          {rule.detalles && (
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6B6480' }}>
              {rule.detalles}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {rule.active && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.18)' }}
              title="Editar regla"
            >
              <Edit2 size={11} />
              Editar
            </button>
          )}
          {rule.active && (
            <button
              type="button"
              onClick={onDeactivate}
              disabled={isDeactivating}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5', opacity: isDeactivating ? 0.5 : 1 }}
              title="Desactivar regla"
            >
              <EyeOff size={11} />
              {isDeactivating ? '...' : 'Desactivar'}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.18)', opacity: isDeleting ? 0.5 : 1 }}
            title="Eliminar regla"
          >
            <Trash2 size={11} />
            {isDeleting ? '...' : 'Eliminar'}
          </button>
        </div>
      </div>

      {/* Chips de alcance */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {appliesLabel ? (
          <span
            className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.15)' }}
          >
            {appliesLabel}
          </span>
        ) : (
          rule.applies_to.map(role => (
            <span
              key={role}
              className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: '#F0EDF9', color: '#4A3B6B', border: '1px solid #E8E3F5' }}
            >
              {agentNamesMap[role] || role}
            </span>
          ))
        )}
        {!rule.active && (
          <span
            className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            Inactiva
          </span>
        )}
      </div>
    </div>
  );
}
