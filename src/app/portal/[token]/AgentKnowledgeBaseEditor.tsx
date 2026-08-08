'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Check, Loader2, Brain, BookOpen, ChevronDown, Sparkles, Columns3, Award } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';
import KBTournamentModal from './KBTournamentModal';

const SOFT = 5_000;
const HARD = 10_000;

function CharBar({ value }: { value: string }) {
  const n     = value.length;
  const pct   = Math.min((n / HARD) * 100, 100);
  const color = n <= SOFT ? '#22c55e' : n <= HARD ? '#f59e0b' : '#ef4444';
  const hint  = n <= SOFT ? 'Ideal' : n <= HARD ? 'Largo pero aceptable' : 'Muy extenso';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="tabular-nums" style={{ color, fontWeight: 600 }}>{n.toLocaleString('es-MX')} / {HARD.toLocaleString('es-MX')} caracteres</span>
        <span style={{ color: '#9B8FB5' }}>{hint}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#F0EDF9' }}>
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
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
      style={{
        background: saved ? '#22c55e' : accent,
        color: '#fff',
        boxShadow: saved ? 'none' : `0 1px 2px ${accent}3d`,
      }}
    >
      {saving ? <><Loader2 size={13} className="animate-spin" />Guardando</> : saved ? <><Check size={13} />Guardado</> : 'Guardar'}
    </button>
  );
}

const LOCKED_COLORS = new Set(
  MEERKAT_ROLES.filter(r => r.id !== 'custom').map(r => r.color.toLowerCase())
);

const COLOR_POOL = [
  '#a855f7', '#d946ef', '#10b981', '#0ea5e9',
  '#84cc16', '#f43f5e', '#64748b', '#fb923c',
];

const ROLE_COLORS = COLOR_POOL.filter(c => !LOCKED_COLORS.has(c));

export default function AgentKnowledgeBaseEditor({
  token,
  initialRole,
  initialRoleColor,
  initialRoleKb,
  initialLearnings,
  websiteSynced  = false,
  hasBusinessKb  = false,
  colorLocked    = false,
  roleLocked     = false,
}: {
  token:             string;
  initialRole:       string;
  initialRoleColor:  string;
  initialRoleKb:     string;
  initialLearnings:  string;
  websiteSynced?:    boolean;
  hasBusinessKb?:    boolean;
  colorLocked?:      boolean;
  /** Meerkats predeterminados: el puesto es fijo (Nia=recepcionista, Noah=ventas, etc.). */
  roleLocked?:       boolean;
}) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const learningRunning = searchParams?.get('learning') === 'running';
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
  const [tournamentOpen,    setTournamentOpen]    = useState(false);
  const [filteringRole,     setFilteringRole]     = useState(false);
  const [filterReasonRole,  setFilterReasonRole]  = useState<string | null>(null);

  useDirtyWarning('agent-kb', dirtyRoleName || dirtyRoleKb || dirtyLearnings);

  // Cuando el server re-renderiza con nuevos initialLearnings (después de que
  // el usuario disparó 'Aprender de mis correos'), sincronizar el state local.
  // Solo si no hay edits en curso, para no sobreescribir cambios del usuario.
  useEffect(() => {
    if (dirtyLearnings) return;
    if (initialLearnings !== learnings) setLearnings(initialLearnings);
    // Si veníamos con ?learning=running y ya llegaron los nuevos aprendizajes,
    // quitar el flag de la URL para que un refresh de página no muestre el
    // banner otra vez.
    if (learningRunning && initialLearnings !== learnings) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('learning');
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}${window.location.hash}`, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLearnings]);

  const save = async (field: 'role_knowledge_base' | 'role_learnings', val: string, setSaving: (b: boolean) => void, setSaved: (b: boolean) => void, setDirty: (b: boolean) => void) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [field]: val }),
      });
      if (res.ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500); }
    } finally { setSaving(false); }
  };

  const saveRoleName = async () => {
    setSavingRoleName(true);
    setSavedRoleName(false);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role, role_color: roleColor }),
      });
      if (res.ok) { setSavedRoleName(true); setDirtyRoleName(false); setTimeout(() => setSavedRoleName(false), 2500); }
    } finally { setSavingRoleName(false); }
  };

  const handleGenerateRoleFiltered = async () => {
    if (filteringRole || generatingRole) return;
    const missing: string[] = [];
    if (!role.trim())   missing.push('· Nombre del puesto → escríbelo en el campo "Puesto del empleado" arriba.');
    if (!hasBusinessKb) missing.push('· Manual de la organización → ve a Organización → Manual de la organización y complétalo primero.');
    if (missing.length) {
      setIsRoleValidation(true);
      setGenRoleError('Necesitas completar esto antes de generar:\n\n' + missing.join('\n'));
      return;
    }
    const hasExisting = roleKb.trim().length > 50;
    const confirmMsg = hasExisting
      ? 'Esto usará 3 tareas, generará 3 variantes y elegirá la mejor automáticamente. Reemplazará las instrucciones actuales. ¿Deseas continuar?'
      : 'Esto usará 3 tareas, generará 3 variantes y elegirá la mejor automáticamente. ¿Deseas continuar?';
    if (!window.confirm(confirmMsg)) return;

    setFilteringRole(true);
    setIsRoleValidation(false);
    setGenRoleError(null);
    setFilterReasonRole(null);
    try {
      const res = await fetch(`/api/portal/${token}/generate-kb-tournament`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'role', role, filter: true }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setGenRoleError(error ?? 'Error al generar');
        return;
      }
      const { winner, reason } = await res.json() as { winner: { text: string; label: string }; reason: string };
      if (!winner?.text) { setGenRoleError('No se pudo elegir una variante'); return; }
      setRoleKb(winner.text);
      setDirtyRoleKb(true);
      setFilterReasonRole(`Elegida: ${winner.label}. ${reason}`);
      await save('role_knowledge_base', winner.text, setSavingRole, setSavedRole, setDirtyRoleKb);
    } catch {
      setGenRoleError('No se pudo conectar. Verifica tu conexión.');
    } finally {
      setFilteringRole(false);
    }
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
        <label className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          Puesto del empleado
        </label>
        {roleLocked ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: roleColor }} />
            <span className="font-semibold">{role}</span>
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider" style={{ color: '#9B8FB5' }}>
              Predeterminado
            </span>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={role}
              onChange={e => { setRole(e.target.value); setSavedRoleName(false); setDirtyRoleName(true); }}
              placeholder="Ej. Coordinadora de ventas, Asistente ejecutivo..."
              className="flex-1 rounded-lg px-3 py-2.5 text-[13px] outline-none"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            />
            <button
              onClick={saveRoleName}
              disabled={savingRoleName}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50 shrink-0"
              style={{
                background: savedRoleName ? '#22c55e' : '#6C3BFF',
                color: '#fff',
                boxShadow: savedRoleName ? 'none' : '0 1px 2px rgba(108,59,255,0.24)',
              }}
            >
              {savingRoleName ? <Loader2 size={13} className="animate-spin" /> : savedRoleName ? <><Check size={13} />Guardado</> : 'Guardar'}
            </button>
          </div>
        )}

        {/* Color del rol */}
        <div className="pt-1">
          {colorLocked ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#9B8FB5' }}>
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: roleColor }} />
              <span>Color: <span style={{ color: roleColor }}>{role.trim() || 'Vista previa'}</span></span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setColorOpen(p => !p)}
                className="flex items-center gap-2 text-xs"
                style={{ color: '#9B8FB5' }}
              >
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: roleColor }} />
                <span>Color: <span style={{ color: roleColor }}>{role.trim() || 'Vista previa'}</span></span>
                <ChevronDown size={12} style={{ color: '#9B8FB5', transform: colorOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
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
      <div style={{ borderTop: '1px solid #F0EDF9' }} />

      {/* Section 1: Instrucciones del puesto */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen size={14} style={{ color: roleColor }} />
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: roleColor }}>
            Instrucciones del puesto
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: `${roleColor}14`, color: roleColor, border: `1px solid ${roleColor}33` }}>
            {role}
          </span>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
          Procedimientos, reglas, límites de aprobación y contactos clave que tu empleado usa en su puesto de <strong style={{ color: roleColor }}>{role}</strong>.
        </p>
        <textarea
          value={roleKb}
          onChange={e => { setRoleKb(e.target.value); setSavedRole(false); setDirtyRoleKb(true); }}
          rows={10}
          placeholder={`PROCEDIMIENTO:\n1. Revisar el documento recibido.\n2. Comparar contra los criterios aprobados.\n3. Si hay discrepancia mayor al 5%, escalar por email.\n\nCONTACTOS CLAVE:\n- Aprobador final: gerencia@empresa.com\n\nLÍMITES:\n- Facturas hasta $10,000: aprobación automática.\n- Facturas mayores: requieren confirmación del responsable.`}
          className="w-full rounded-lg px-3.5 py-3 text-[13px] leading-relaxed outline-none resize-y"
          style={{ background: '#ffffff', border: `1px solid ${roleColor}33`, color: '#1A0A3B', minHeight: 200 }}
        />
        <CharBar value={roleKb} />
        <div className="flex items-center gap-2 flex-wrap">
          <SaveButton saving={savingRole} saved={savedRole} accent={roleColor} onSave={() => save('role_knowledge_base', roleKb, setSavingRole, setSavedRole, setDirtyRoleKb)} />
          <button
            onClick={handleGenerateRole}
            disabled={generatingRole || savingRole}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
          >
            {generatingRole
              ? <><Loader2 size={12} className="animate-spin" />Generando</>
              : <><Sparkles size={12} style={{ color: '#6C3BFF' }} />Redactar automáticamente <span style={{ opacity: 0.6 }}>· 3 tareas</span></>}
          </button>
          <button
            onClick={() => {
              const missing: string[] = [];
              if (!role.trim())   missing.push('· Nombre del puesto → escríbelo en el campo "Puesto del empleado" arriba.');
              if (!hasBusinessKb) missing.push('· Manual de la organización → ve a Organización → Manual de la organización y complétalo primero.');
              if (missing.length) {
                setIsRoleValidation(true);
                setGenRoleError('Necesitas completar esto antes de generar:\n\n' + missing.join('\n'));
                return;
              }
              const hasExisting = roleKb.trim().length > 50;
              const confirmMsg = hasExisting
                ? 'Esto usará 3 tareas y, al elegir una variante, reemplazará las instrucciones actuales. ¿Deseas continuar?'
                : 'Esto usará 3 tareas para generar 3 estilos. ¿Deseas continuar?';
              if (!window.confirm(confirmMsg)) return;
              setIsRoleValidation(false);
              setGenRoleError(null);
              setTournamentOpen(true);
            }}
            disabled={generatingRole || savingRole}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
          >
            <Columns3 size={12} style={{ color: '#6C3BFF' }} />Comparar 3 estilos <span style={{ opacity: 0.6 }}>· 3 tareas</span>
          </button>
          <button
            onClick={handleGenerateRoleFiltered}
            disabled={generatingRole || savingRole || filteringRole}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
          >
            {filteringRole
              ? <><Loader2 size={12} className="animate-spin" />Evaluando 3 versiones</>
              : <><Award size={12} style={{ color: '#6C3BFF' }} />Con evaluación de calidad <span style={{ opacity: 0.6 }}>· 3 tareas</span></>}
          </button>
        </div>
        {filterReasonRole && !filteringRole && (
          <p className="text-xs rounded-lg px-3 py-2"
             style={{ color: '#9B6DFF', background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
            {filterReasonRole}
          </p>
        )}
        <KBTournamentModal
          token={token}
          type="role"
          role={role}
          open={tournamentOpen}
          onClose={() => setTournamentOpen(false)}
          onSelect={async (chosen) => {
            setRoleKb(chosen);
            setDirtyRoleKb(true);
            setSavedRole(false);
            await save('role_knowledge_base', chosen, setSavingRole, setSavedRole, setDirtyRoleKb);
          }}
        />
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
          <p className="text-xs" style={{ color: '#9B8FB5' }}>
            Consejo: sincroniza tu sitio web en <strong>Negocio → Sitio web</strong> para mejores resultados. Si no tienes sitio, el manual de la organización es suficiente.
          </p>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #F0EDF9' }} />

      {/* Section 2: Aprendizajes activos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Brain size={14} style={{ color: '#6C3BFF' }} />
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#6C3BFF' }}>
            Aprendizajes activos
          </p>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
          Todo lo que tu empleado ha aprendido en campo y fue aprobado en Oficina. Puedes editar, reorganizar o eliminar entradas directamente aquí.
        </p>
        {learningRunning && (
          <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.24)' }}>
            <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: '#6C3BFF' }} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] font-semibold" style={{ color: '#6C3BFF' }}>
                Analizando correos del negocio
              </span>
              <span className="text-[11px]" style={{ color: '#6B6480' }}>
                Cuando termine, los nuevos aprendizajes aparecerán abajo automáticamente.
              </span>
            </div>
          </div>
        )}
        <textarea
          value={learnings}
          onChange={e => { setLearnings(e.target.value); setSavedLearn(false); setDirtyLearnings(true); }}
          rows={8}
          placeholder="Los aprendizajes aprobados desde Oficina aparecerán aquí automáticamente..."
          className="w-full rounded-lg px-3.5 py-3 text-[13px] leading-relaxed outline-none resize-y"
          style={{ background: '#ffffff', border: '1px solid rgba(108,59,255,0.18)', color: '#1A0A3B', minHeight: 160 }}
        />
        <CharBar value={learnings} />
        <SaveButton saving={savingLearn} saved={savedLearn} accent="#6C3BFF" onSave={() => save('role_learnings', learnings, setSavingLearn, setSavedLearn, setDirtyLearnings)} />
      </div>

      </>}
    </div>
  );
}
