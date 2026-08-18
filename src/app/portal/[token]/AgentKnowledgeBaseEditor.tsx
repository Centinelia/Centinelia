'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Check, Loader2, Brain, BookOpen, ChevronDown, Columns3, Award, Lock, ArrowRight } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';
import KBTournamentModal from './KBTournamentModal';
import KBGenerateConfirmModal, { type KBGenerateVariant } from './KBGenerateConfirmModal';

const SOFT = 5_000;
const HARD = 10_000;

function CharBar({ value }: { value: string }) {
  const n     = value.length;
  const pct   = Math.min((n / HARD) * 100, 100);
  const color = n <= SOFT ? '#22c55e' : n <= HARD ? '#f59e0b' : '#ef4444';
  const hint  = n <= SOFT ? 'Ideal' : n <= HARD ? 'Largo pero aceptable' : 'Muy extenso';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12px]">
        <span className="tabular-nums" style={{ color, fontWeight: 600 }}>{n.toLocaleString('es-MX')} / {HARD.toLocaleString('es-MX')} caracteres</span>
        <span style={{ color: '#9B8FB5' }}>{hint}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: '#F0EDF9' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function SavePill({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
        style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
        <Loader2 size={11} className="animate-spin" /> Guardando
      </span>
    );
  }
  if (saved) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
        <Check size={11} strokeWidth={2.5} /> Guardado
      </span>
    );
  }
  return null;
}

function SaveButton({ saving, saved, onSave, accent, dirty }: { saving: boolean; saved: boolean; onSave: () => void; accent: string; dirty: boolean }) {
  const bg = saved ? '#22c55e' : dirty ? accent : '#E8E3F5';
  const color = saved || dirty ? '#fff' : '#9B8FB5';
  const shadow = saved || !dirty ? 'none' : `0 4px 12px ${accent}40`;
  return (
    <button
      onClick={onSave}
      disabled={saving || !dirty}
      className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed"
      style={{ background: bg, color, boxShadow: shadow }}
    >
      {saving ? <><Loader2 size={14} className="animate-spin" />Guardando</> : saved ? <><Check size={14} strokeWidth={2.5} />Guardado</> : 'Guardar cambios'}
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
  agentId,
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
  agentId?:          string;
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
  const [genRoleError,      setGenRoleError]      = useState<string | null>(null);
  const [isRoleValidation,  setIsRoleValidation]  = useState(false);
  const [dirtyRoleName,     setDirtyRoleName]     = useState(false);
  const [dirtyRoleKb,       setDirtyRoleKb]       = useState(false);
  const [dirtyLearnings,    setDirtyLearnings]    = useState(false);
  const [tournamentOpen,    setTournamentOpen]    = useState(false);
  const [filteringRole,     setFilteringRole]     = useState(false);
  const [filterReasonRole,  setFilterReasonRole]  = useState<string | null>(null);
  const [confirmVariant,    setConfirmVariant]    = useState<KBGenerateVariant | null>(null);

  useDirtyWarning('agent-kb', dirtyRoleName || dirtyRoleKb || dirtyLearnings);

  useEffect(() => {
    if (dirtyLearnings) return;
    if (initialLearnings !== learnings) setLearnings(initialLearnings);
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
        body:    JSON.stringify({ ...(agentId ? { agentId } : {}), [field]: val }),
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
        body:    JSON.stringify({ ...(agentId ? { agentId } : {}), role, role_color: roleColor }),
      });
      if (res.ok) { setSavedRoleName(true); setDirtyRoleName(false); setTimeout(() => setSavedRoleName(false), 2500); }
    } finally { setSavingRoleName(false); }
  };

  const handleGenerateRoleFiltered = async () => {
    if (filteringRole) return;
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

  const pickColor = async (c: string) => {
    setRoleColor(c);
    setSavedRoleName(false);
    await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...(agentId ? { agentId } : {}), role_color: c }),
    });
    router.refresh();
  };

  const genDisabled = savingRole || filteringRole;
  const roleHasExisting = roleKb.trim().length > 50;

  const requestGenerate = (variant: KBGenerateVariant) => {
    const missing: string[] = [];
    if (!role.trim())   missing.push('· Nombre del puesto: escríbelo en el campo "Puesto del empleado" arriba.');
    if (!hasBusinessKb) missing.push('· Manual de la organización: ve a Organización, Manual de la organización, y complétalo primero.');
    if (missing.length) {
      setIsRoleValidation(true);
      setGenRoleError('Necesitas completar esto antes de generar:\n\n' + missing.join('\n'));
      return;
    }
    setIsRoleValidation(false);
    setGenRoleError(null);
    setConfirmVariant(variant);
  };

  const handleConfirm = async () => {
    const v = confirmVariant;
    setConfirmVariant(null);
    if (v === 'compare') setTournamentOpen(true);
    else if (v === 'auto') await handleGenerateRoleFiltered();
  };

  return (
    <div className="flex flex-col gap-7">

      {/* Hero: Puesto del empleado */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${roleColor}14`, border: `1px solid ${roleColor}33` }}
          >
            <BookOpen size={24} style={{ color: roleColor }} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
              Puesto del empleado
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
              Define el rol y el color que identifica a este empleado en toda la plataforma.
            </p>
          </div>
        </div>

        {roleLocked ? (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3.5"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: roleColor }} />
            <span className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>{role}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              <Lock size={10} strokeWidth={2.5} /> Predeterminado
            </span>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={role}
              onChange={e => { setRole(e.target.value); setSavedRoleName(false); setDirtyRoleName(true); }}
              placeholder="Ej. Coordinadora de ventas, Asistente ejecutivo..."
              className="flex-1 rounded-xl px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-[#6C3BFF]"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            />
            <button
              onClick={saveRoleName}
              disabled={savingRoleName || !dirtyRoleName}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[14px] font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed shrink-0"
              style={{
                background: savedRoleName ? '#22c55e' : dirtyRoleName ? '#6C3BFF' : '#E8E3F5',
                color: dirtyRoleName || savedRoleName ? '#fff' : '#9B8FB5',
                boxShadow: savedRoleName || !dirtyRoleName ? 'none' : '0 4px 12px rgba(108,59,255,0.4)',
              }}
            >
              {savingRoleName ? <Loader2 size={14} className="animate-spin" /> : savedRoleName ? <><Check size={14} strokeWidth={2.5} />Guardado</> : 'Guardar'}
            </button>
          </div>
        )}

        {/* Color del rol */}
        <div>
          {colorLocked ? (
            <div className="inline-flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-full"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
              <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: roleColor }} />
              <span>Color de identidad: <span className="font-semibold" style={{ color: roleColor }}>{role.trim() || 'Vista previa'}</span></span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setColorOpen(p => !p)}
                className="inline-flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-full transition-colors hover:bg-[#FAFAFB]"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6B6480' }}
              >
                <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: roleColor }} />
                <span>Color: <span className="font-semibold" style={{ color: roleColor }}>{role.trim() || 'Vista previa'}</span></span>
                <ChevronDown size={12} style={{ color: '#9B8FB5', transform: colorOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {colorOpen && (
                <div className="flex items-center gap-2 mt-3 p-3 rounded-xl"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                  {ROLE_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => pickColor(c)}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center flex-shrink-0"
                      style={{ background: c, outline: roleColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                      aria-label={c}
                    >
                      {roleColor === c && <Check size={14} color="#fff" strokeWidth={3} />}
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

      <div style={{ borderTop: '1px solid #F0EDF9' }} />

      {/* Section 1: Instrucciones del puesto */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${roleColor}14`, border: `1px solid ${roleColor}33` }}
          >
            <BookOpen size={20} style={{ color: roleColor }} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                Instrucciones del puesto
              </p>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: `${roleColor}14`, color: roleColor, border: `1px solid ${roleColor}33` }}>
                {role}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
              Procedimientos, reglas, límites de aprobación y contactos clave que <strong style={{ color: roleColor }}>{role}</strong> usa día a día.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['Procedimientos paso a paso', 'Límites de aprobación', 'Contactos clave', 'Reglas de escalación'].map(chip => (
            <span key={chip} className="text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              {chip}
            </span>
          ))}
        </div>

        <textarea
          value={roleKb}
          onChange={e => { setRoleKb(e.target.value); setSavedRole(false); setDirtyRoleKb(true); }}
          rows={10}
          placeholder={`PROCEDIMIENTO:\n1. Revisar el documento recibido.\n2. Comparar contra los criterios aprobados.\n3. Si hay discrepancia mayor al 5%, escalar por email.\n\nCONTACTOS CLAVE:\n- Aprobador final: gerencia@empresa.com\n\nLÍMITES:\n- Facturas hasta $10,000: aprobación automática.\n- Facturas mayores: requieren confirmación del responsable.`}
          className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-colors"
          style={{
            padding:    '14px 16px',
            background: '#ffffff',
            border:     `1px solid ${roleColor}40`,
            color:      '#1A0A3B',
            fontFamily: 'inherit',
            minHeight:  260,
          }}
        />
        <CharBar value={roleKb} />

        <div className="flex items-center gap-2 flex-wrap">
          <SaveButton saving={savingRole} saved={savedRole} dirty={dirtyRoleKb} accent={roleColor} onSave={() => save('role_knowledge_base', roleKb, setSavingRole, setSavedRole, setDirtyRoleKb)} />
          <SavePill saving={savingRole && !dirtyRoleKb} saved={savedRole} />
        </div>

        <div className="flex flex-col gap-2 rounded-2xl p-5"
          style={{
            background: `linear-gradient(135deg, ${roleColor}1F 0%, ${roleColor}0F 40%, #ffffff 100%)`,
            border: `1px solid ${roleColor}3D`,
            boxShadow: `0 4px 20px ${roleColor}14`,
          }}>
          <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
            Redactar con IA
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
            Generamos 3 versiones de las instrucciones y tú decides cómo elegir. Ambas opciones cuestan lo mismo.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={() => requestGenerate('compare')}
              disabled={genDisabled}
              className="group flex flex-col gap-2 text-left rounded-2xl p-4 transition-all hover:shadow-[0_4px_16px_rgba(108,59,255,0.12)] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${roleColor}14`, border: `1px solid ${roleColor}33` }}>
                  <Columns3 size={16} style={{ color: roleColor }} />
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}>3 tareas</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                  Comparar 3 estilos y elegir yo
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                  Ves las 3 variantes lado a lado (Directo, Cálido, Estructurado) y eliges la que mejor te queda.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold pt-1 transition-transform group-hover:translate-x-0.5" style={{ color: roleColor }}>
                Comparar variantes <ArrowRight size={12} strokeWidth={2.5} />
              </span>
            </button>

            <button
              onClick={() => requestGenerate('auto')}
              disabled={genDisabled}
              className="group flex flex-col gap-2 text-left rounded-2xl p-4 pt-5 transition-all hover:shadow-[0_4px_16px_rgba(108,59,255,0.16)] disabled:opacity-50 disabled:cursor-not-allowed relative"
              style={{ background: '#ffffff', border: `1px solid ${roleColor}55` }}
            >
              <span className="absolute -top-2.5 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider z-10"
                style={{
                  background: roleColor,
                  color: '#fff',
                  letterSpacing: '0.05em',
                  boxShadow: `0 4px 10px ${roleColor}55`,
                }}>
                Recomendado
              </span>
              <span className="absolute top-4 right-4 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                3 tareas
              </span>
              <div className="flex items-start">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${roleColor}14`, border: `1px solid ${roleColor}33` }}>
                  {filteringRole
                    ? <Loader2 size={16} className="animate-spin" style={{ color: roleColor }} />
                    : <Award size={16} style={{ color: roleColor }} />}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                  Elegir la mejor automáticamente
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                  Generamos las 3 variantes y un revisor experto las califica contra 5 criterios (claridad, cobertura, precisión, formato y utilidad) para dejarte solo la mejor.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold pt-1 transition-transform group-hover:translate-x-0.5" style={{ color: roleColor }}>
                {filteringRole ? 'Evaluando 3 versiones' : 'Generar y elegir'} <ArrowRight size={12} strokeWidth={2.5} />
              </span>
            </button>
          </div>
        </div>

        {filterReasonRole && !filteringRole && (
          <p className="text-[12px] rounded-xl px-3.5 py-2.5 font-medium"
             style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.25)' }}>
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
        <KBGenerateConfirmModal
          open={confirmVariant !== null}
          onClose={() => setConfirmVariant(null)}
          onConfirm={handleConfirm}
          variant={confirmVariant ?? 'compare'}
          kind="role"
          hasExisting={roleHasExisting}
          accentColor={roleColor}
        />
        {genRoleError && (
          <p
            className="text-[12px] rounded-xl px-3.5 py-2.5 font-medium"
            style={{
              whiteSpace: 'pre-line',
              color:      isRoleValidation ? '#92400e' : '#EF4444',
              background: isRoleValidation ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
              border:     `1px solid ${isRoleValidation ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
            }}
          >
            {genRoleError}
          </p>
        )}
        {!websiteSynced && role.trim() && (
          <p className="text-[12px] leading-relaxed" style={{ color: '#9B8FB5' }}>
            Consejo: sincroniza tu sitio web en <strong style={{ color: '#6B6480' }}>Negocio, Sitio web</strong> para mejores resultados. Si no tienes sitio, el manual de la organización es suficiente.
          </p>
        )}
      </div>

      <div style={{ borderTop: '1px solid #F0EDF9' }} />

      {/* Section 2: Aprendizajes activos */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
          >
            <Brain size={20} style={{ color: '#6C3BFF' }} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
              Aprendizajes activos
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
              Todo lo que este empleado ha aprendido en campo y fue aprobado en Oficina. Puedes editar, reorganizar o eliminar entradas directamente.
            </p>
          </div>
        </div>

        {learningRunning && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.24)' }}>
            <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: '#6C3BFF' }} />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[13px] font-semibold" style={{ color: '#6C3BFF' }}>
                Analizando correos del negocio
              </span>
              <span className="text-[12px]" style={{ color: '#6B6480' }}>
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
          className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-colors focus:border-[#6C3BFF]"
          style={{
            padding:    '14px 16px',
            background: '#ffffff',
            border:     '1px solid rgba(108,59,255,0.2)',
            color:      '#1A0A3B',
            fontFamily: 'inherit',
            minHeight:  220,
          }}
        />
        <CharBar value={learnings} />

        <div className="flex items-center gap-2 flex-wrap">
          <SaveButton saving={savingLearn} saved={savedLearn} dirty={dirtyLearnings} accent="#6C3BFF" onSave={() => save('role_learnings', learnings, setSavingLearn, setSavedLearn, setDirtyLearnings)} />
          <SavePill saving={savingLearn && !dirtyLearnings} saved={savedLearn} />
        </div>
      </div>

      </>}
    </div>
  );
}
