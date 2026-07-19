'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Brain, BookOpen, ChevronDown, Sparkles } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';

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

const ROLE_COLORS = [
  '#6C3BFF', '#3b82f6', '#22c55e', '#f59e0b',
  '#ef4444', '#a855f7', '#06b6d4', '#ec4899',
];

export default function AgentKnowledgeBaseEditor({
  token,
  initialRole,
  initialRoleColor,
  initialRoleKb,
  initialLearnings,
  websiteSynced  = false,
  hasBusinessKb  = false,
  colorLocked    = false,
}: {
  token:             string;
  initialRole:       string;
  initialRoleColor:  string;
  initialRoleKb:     string;
  initialLearnings:  string;
  websiteSynced?:    boolean;
  hasBusinessKb?:    boolean;
  colorLocked?:      boolean;
}) {
  const router = useRouter();
  const [role,          setRole]          = useState(initialRole);
  const [roleColor,     setRoleColor]     = useState(initialRoleColor || '#6C3BFF');
  const [roleKb,        setRoleKb]        = useState(initialRoleKb);
  const [learnings,     setLearnings]     = useState(initialLearnings);
  const [colorOpen,      setColorOpen]      = useState(false);
  const [savingRoleName, setSavingRoleName] = useState(false);
  const [savedRoleName,  setSavedRoleName]  = useState(false);
  const [savingRole,    setSavingRole]    = useState(false);
  const [savedRole,     setSavedRole]     = useState(false);
  const [savingLearn,   setSavingLearn]   = useState(false);
  const [savedLearn,    setSavedLearn]    = useState(false);
  const [generatingRole,    setGeneratingRole]    = useState(false);
  const [genRoleError,      setGenRoleError]      = useState<string | null>(null);
  const [isRoleValidation,  setIsRoleValidation]  = useState(false);
  const [dirtyRoleName,     setDirtyRoleName]     = useState(false);
  const [dirtyRoleKb,       setDirtyRoleKb]       = useState(false);
  const [dirtyLearnings,    setDirtyLearnings]    = useState(false);

  useDirtyWarning('agent-kb', dirtyRoleName || dirtyRoleKb || dirtyLearnings);

  const save = async (field: 'role_knowledge_base' | 'role_learnings', val: string, setSaving: (b: boolean) => void, setSaved: (b: boolean) => void, setDirty: (b: boolean) => void) => {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [field]: val }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500); }
  };

  const saveRoleName = async () => {
    setSavingRoleName(true);
    setSavedRoleName(false);
    const res = await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role, role_color: roleColor }),
    });
    setSavingRoleName(false);
    if (res.ok) { setSavedRoleName(true); setDirtyRoleName(false); setTimeout(() => setSavedRoleName(false), 2500); }
  };

  const handleGenerateRole = async () => {
    if (generatingRole) return;

    // Validate required fields before consuming ops
    const missing: string[] = [];
    if (!role.trim())   missing.push('· Nombre del puesto → escríbelo en el campo "Puesto del empleado" arriba.');
    if (!hasBusinessKb) missing.push('· Manual de la organización → ve a Organización → Manual de la organización y complétalo primero.');
    if (missing.length) {
      setIsRoleValidation(true);
      setGenRoleError('Necesitas completar esto antes de generar:\n\n' + missing.join('\n'));
      return;
    }

    const hasExisting = roleKb.trim().length > 50;
    const confirmMsg  = hasExisting
      ? 'Esto usará 3 tareas y reemplazará las instrucciones actuales. ¿Deseas continuar?'
      : 'Esto usará 3 tareas. ¿Deseas continuar?';
    if (!window.confirm(confirmMsg)) return;

    setGeneratingRole(true);
    setIsRoleValidation(false);
    setGenRoleError(null);
    setRoleKb('');
    setSavedRole(false);
    setDirtyRoleKb(true);
    try {
      const res = await fetch(`/api/portal/${token}/generate-kb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'role', role }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setIsRoleValidation(false);
        setGenRoleError(error ?? 'Error al generar');
        return;
      }
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let generated = '';
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { text, error } = JSON.parse(payload);
            if (error) { setGenRoleError(error); return; }
            if (text) { generated += text; setRoleKb(prev => prev + text); }
          } catch { /* ignore */ }
        }
      }
      if (generated) await save('role_knowledge_base', generated, setSavingRole, setSavedRole, setDirtyRoleKb);
    } catch {
      setGenRoleError('No se pudo conectar. Verifica tu conexión.');
    } finally {
      setGeneratingRole(false);
    }
  };

  const pickColor = async (c: string) => {
    setRoleColor(c);
    setSavedRoleName(false);
    await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role_color: c }),
    });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Puesto del empleado */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
          Puesto del empleado
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={role}
            onChange={e => { setRole(e.target.value); setSavedRoleName(false); setDirtyRoleName(true); }}
            placeholder="Ej. Coordinadora de ventas, Asistente ejecutivo..."
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
          />
          <button
            onClick={saveRoleName}
            disabled={savingRoleName}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 shrink-0"
            style={{ background: savedRoleName ? '#22c55e' : 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: savedRoleName ? '#fff' : '#9B6DFF' }}
          >
            {savingRoleName ? <Loader2 size={12} className="animate-spin" /> : savedRoleName ? <><Check size={12} />Guardado</> : 'Guardar'}
          </button>
        </div>

        {/* Color del rol */}
        <div className="pt-1">
          {colorLocked ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-4)' }}>
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: roleColor }} />
              <span>Color: <span style={{ color: roleColor }}>{role.trim() || 'Vista previa'}</span></span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setColorOpen(p => !p)}
                className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--c-text-4)' }}
              >
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: roleColor }} />
                <span>Color: <span style={{ color: roleColor }}>{role.trim() || 'Vista previa'}</span></span>
                <ChevronDown size={12} style={{ color: 'var(--c-text-4)', transform: colorOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {colorOpen && (
                <div className="flex items-center gap-1.5 mt-2">
                  {ROLE_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => pickColor(c)}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex items-center justify-center flex-shrink-0"
                      style={{ background: c, outline: roleColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                      aria-label={c}
                    >
                      {roleColor === c && <Check size={10} color="#fff" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* KB sections only when role is set */}
      {role.trim() && <>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--c-border)' }} />

      {/* Section 1: Instrucciones del puesto */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen size={13} style={{ color: roleColor }} />
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: roleColor }}>
            Instrucciones del puesto
          </p>
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: `${roleColor}1f`, color: roleColor, border: `1px solid ${roleColor}40` }}>
            {role}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Procedimientos, reglas, límites de aprobación y contactos clave que tu empleado usa en su puesto de <strong style={{ color: roleColor }}>{role}</strong>.
        </p>
        <textarea
          value={roleKb}
          onChange={e => { setRoleKb(e.target.value); setSavedRole(false); setDirtyRoleKb(true); }}
          rows={10}
          placeholder={`PROCEDIMIENTO:\n1. Revisar el documento recibido.\n2. Comparar contra los criterios aprobados.\n3. Si hay discrepancia mayor al 5%, escalar por email.\n\nCONTACTOS CLAVE:\n- Aprobador final: gerencia@empresa.com\n\nLÍMITES:\n- Facturas hasta $10,000: aprobación automática.\n- Facturas mayores: requieren confirmación del dueño.`}
          className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y"
          style={{ background: 'var(--c-input-bg)', border: `1px solid ${roleColor}4d`, color: 'var(--c-text)', minHeight: 180 }}
        />
        <CharBar value={roleKb} />
        <div className="flex items-center gap-2 flex-wrap">
          <SaveButton saving={savingRole} saved={savedRole} accent={roleColor} onSave={() => save('role_knowledge_base', roleKb, setSavingRole, setSavedRole, setDirtyRoleKb)} />
          <button
            onClick={handleGenerateRole}
            disabled={generatingRole || savingRole}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }}
          >
            {generatingRole
              ? <><Loader2 size={12} className="animate-spin" />Generando…</>
              : <><Sparkles size={12} />Redactar automáticamente <span style={{ opacity: 0.6 }}>· 3 tareas</span></>}
          </button>
        </div>
        {genRoleError && (
          <p
            className="text-xs rounded-lg px-3 py-2"
            style={{
              whiteSpace: 'pre-line',
              color:      isRoleValidation ? '#92400e' : '#ef4444',
              background: isRoleValidation ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.06)',
              border:     `1px solid ${isRoleValidation ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.2)'}`,
            }}
          >
            {genRoleError}
          </p>
        )}
        {!websiteSynced && !generatingRole && role.trim() && (
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
            Consejo: sincroniza tu sitio web en <strong>Negocio → Sitio web</strong> para mejores resultados. Si no tienes sitio, la KB del negocio es suficiente.
          </p>
        )}
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
          Todo lo que tu empleado ha aprendido en campo y fue aprobado en Oficina. Puedes editar, reorganizar o eliminar entradas directamente aquí.
        </p>
        <textarea
          value={learnings}
          onChange={e => { setLearnings(e.target.value); setSavedLearn(false); setDirtyLearnings(true); }}
          rows={8}
          placeholder="Los aprendizajes aprobados desde Oficina aparecerán aquí automáticamente..."
          className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y"
          style={{ background: 'var(--c-input-bg)', border: '1px solid rgba(108,59,255,0.25)', color: 'var(--c-text)', minHeight: 140 }}
        />
        <CharBar value={learnings} />
        <SaveButton saving={savingLearn} saved={savedLearn} accent="#6C3BFF" onSave={() => save('role_learnings', learnings, setSavingLearn, setSavedLearn, setDirtyLearnings)} />
      </div>

      </>}
    </div>
  );
}
