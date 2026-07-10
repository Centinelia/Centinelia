'use client';

import { useState } from 'react';
import { Check, Loader2, Brain, BookOpen } from 'lucide-react';

const SOFT = 5_000;
const HARD = 10_000;

function CharBar({ value }: { value: string }) {
  const n     = value.length;
  const pct   = Math.min((n / HARD) * 100, 100);
  const color = n <= SOFT ? '#22c55e' : n <= HARD ? '#f59e0b' : '#ef4444';
  const hint  = n <= SOFT ? 'Ideal' : n <= HARD ? 'Largo pero aceptable' : 'Muy extenso';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color, fontWeight: 500 }}>{n.toLocaleString('es-MX')} / {HARD.toLocaleString('es-MX')} caracteres</span>
        <span style={{ color: 'var(--c-text-4)' }}>{hint}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: 'var(--c-border)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function SaveButton({ saving, saved, onSave, accent }: { saving: boolean; saved: boolean; onSave: () => void; accent: string }) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
      style={{ background: saved ? '#22c55e' : accent, color: '#fff' }}
    >
      {saving ? <><Loader2 size={12} className="animate-spin" />Guardando…</> : saved ? <><Check size={12} />Guardado</> : 'Guardar'}
    </button>
  );
}

export default function AgentKnowledgeBaseEditor({
  token,
  initialRole,
  initialRoleKb,
  initialLearnings,
}: {
  token:            string;
  initialRole:      string;
  initialRoleKb:    string;
  initialLearnings: string;
}) {
  const [role,          setRole]          = useState(initialRole);
  const [roleKb,        setRoleKb]        = useState(initialRoleKb);
  const [learnings,     setLearnings]     = useState(initialLearnings);
  const [savingRoleName, setSavingRoleName] = useState(false);
  const [savedRoleName,  setSavedRoleName]  = useState(false);
  const [savingRole,    setSavingRole]    = useState(false);
  const [savedRole,     setSavedRole]     = useState(false);
  const [savingLearn,   setSavingLearn]   = useState(false);
  const [savedLearn,    setSavedLearn]    = useState(false);

  const save = async (field: 'role' | 'role_knowledge_base' | 'role_learnings', val: string, setSaving: (b: boolean) => void, setSaved: (b: boolean) => void) => {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [field]: val }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Rol del agente */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
          Rol del agente
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={role}
            onChange={e => { setRole(e.target.value); setSavedRoleName(false); }}
            placeholder="Ej. Agente de operaciones, Asistente ejecutivo..."
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
          />
          <button
            onClick={() => save('role', role, setSavingRoleName, setSavedRoleName)}
            disabled={savingRoleName}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 shrink-0"
            style={{ background: savedRoleName ? '#22c55e' : 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: savedRoleName ? '#fff' : '#9B6DFF' }}
          >
            {savingRoleName ? <Loader2 size={12} className="animate-spin" /> : savedRoleName ? <><Check size={12} />Guardado</> : 'Guardar'}
          </button>
        </div>
      </div>

      {/* KB sections only when role is set */}
      {role.trim() && <>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--c-border)' }} />

      {/* Section 1: Instrucciones del rol */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen size={13} style={{ color: '#f59e0b' }} />
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f59e0b' }}>
            Instrucciones del rol
          </p>
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
            {role}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Procedimientos, reglas, límites de aprobación y contactos clave que el agente usa en su rol de <strong style={{ color: '#f59e0b' }}>{role}</strong>.
        </p>
        <textarea
          value={roleKb}
          onChange={e => { setRoleKb(e.target.value); setSavedRole(false); }}
          rows={10}
          placeholder={`PROCEDIMIENTO:\n1. Revisar el documento recibido.\n2. Comparar contra los criterios aprobados.\n3. Si hay discrepancia mayor al 5%, escalar por email.\n\nCONTACTOS CLAVE:\n- Aprobador final: gerencia@empresa.com\n\nLÍMITES:\n- Facturas hasta $10,000: aprobación automática.\n- Facturas mayores: requieren confirmación del dueño.`}
          className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y"
          style={{ background: 'var(--c-input-bg)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--c-text)', minHeight: 180 }}
        />
        <CharBar value={roleKb} />
        <SaveButton saving={savingRole} saved={savedRole} accent="#f59e0b" onSave={() => save('role_knowledge_base', roleKb, setSavingRole, setSavedRole)} />
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--c-border)' }} />

      {/* Section 2: Aprendizajes activos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Brain size={13} style={{ color: '#9B6DFF' }} />
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B6DFF' }}>
            Aprendizajes activos
          </p>
        </div>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Todo lo que el agente ha aprendido en campo y fue aprobado en Oficina. Puedes editar, reorganizar o eliminar entradas directamente aquí.
        </p>
        <textarea
          value={learnings}
          onChange={e => { setLearnings(e.target.value); setSavedLearn(false); }}
          rows={8}
          placeholder="Los aprendizajes aprobados desde Oficina aparecerán aquí automáticamente..."
          className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y"
          style={{ background: 'var(--c-input-bg)', border: '1px solid rgba(108,59,255,0.25)', color: 'var(--c-text)', minHeight: 140 }}
        />
        <CharBar value={learnings} />
        <SaveButton saving={savingLearn} saved={savedLearn} accent="#6C3BFF" onSave={() => save('role_learnings', learnings, setSavingLearn, setSavedLearn)} />
      </div>

      </>}
    </div>
  );
}
