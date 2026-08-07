'use client';

/**
 * DirectorioEditor — editor unificado del directorio de personas de la organización.
 *
 * Reemplaza TeamNumbersEditor (owner + equipo) y helpdesk/DirectorioEditor
 * (especialistas). Todo vive en organizations.directory y se comparte entre
 * todos los agentes de la cuenta.
 *
 * Una persona puede tener múltiples "roles" simultáneos:
 *   - is_owner: dueño (bypass 24/7)
 *   - is_team:  miembro del equipo interno (identificación de llamadas)
 *   - helpdesk_expertise + on_call: aparece en búsquedas de Neo y horario de guardia
 */

import { useState } from 'react';
import { Plus, X, Crown, Pencil, Save, Lock, Eye, EyeOff, BookUser, Users } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { DirectoryPerson } from '@/lib/helpdesk/folio';

type OwnerGate = 'locked' | 'confirming' | 'unlocked';

interface Props {
  token:    string;
  initial:  DirectoryPerson[];
  isOwner:  boolean;
  /** Cuando se renderiza dentro de helpdesk, mostrar campos de expertise/on_call. */
  showHelpdeskFields?: boolean;
}

const inputStyle: React.CSSProperties = {
  background: '#ffffff',
  border:     '1px solid #E8E3F5',
  color:      '#1A0A3B',
  outline:    'none',
};

export default function DirectorioEditor({
  token, initial, isOwner, showHelpdeskFields = false,
}: Props) {
  const [people, setPeople] = useState<DirectoryPerson[]>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [gate, setGate] = useState<OwnerGate>('locked');
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwVisible, setPwVisible] = useState(false);
  const [pwChecking, setPwChecking] = useState(false);

  async function persist(next: DirectoryPerson[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/directory`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ directory: next }),
      });
      if (res.ok) setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  async function confirmPassword() {
    if (!pwInput.trim()) return;
    setPwChecking(true);
    setPwError('');
    try {
      const res = await fetch(`/api/portal/${token}/verify-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: pwInput }),
      });
      if (!res.ok) { setPwError('Contraseña incorrecta'); return; }
      setGate('unlocked');
      setPwInput('');
    } catch {
      setPwError('Error de conexión');
    } finally {
      setPwChecking(false);
    }
  }

  function addPerson() {
    const p: DirectoryPerson = { id: uuid(), name: '', phone: '', is_team: true };
    setPeople(prev => [...prev, p]);
    setEditId(p.id);
  }

  function updatePerson(id: string, patch: Partial<DirectoryPerson>) {
    setPeople(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function removePerson(id: string) {
    const target = people.find(p => p.id === id);
    if (target?.is_owner && gate !== 'unlocked') { setGate('confirming'); return; }
    const next = people.filter(p => p.id !== id);
    setPeople(next);
    persist(next);
  }

  function commitEdit() {
    setEditId(null);
    persist(people);
  }

  function setOwnerFlag(id: string, next: boolean) {
    if (gate !== 'unlocked') { setGate('confirming'); return; }
    // Solo puede haber un dueño
    setPeople(prev => prev.map(p => ({
      ...p,
      is_owner: p.id === id ? next : (next ? false : p.is_owner),
    })));
  }

  const ownerEntry = people.find(p => p.is_owner);
  const teamPeople = people.filter(p => !p.is_owner);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Dueño ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-1.5 mb-2">
          <Crown size={12} style={{ color: '#f59e0b' }} />
          <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>Dueño</span>
          {isOwner && gate === 'locked' && ownerEntry && (
            <Lock size={11} style={{ color: 'rgba(245,158,11,0.5)' }} />
          )}
        </div>

        {ownerEntry ? (
          <PersonRow
            person={ownerEntry}
            editing={editId === ownerEntry.id && gate === 'unlocked'}
            onUpdate={patch => updatePerson(ownerEntry.id, patch)}
            onCommit={commitEdit}
            onEdit={() => isOwner && (gate === 'unlocked' ? setEditId(ownerEntry.id) : setGate('confirming'))}
            onRemove={() => removePerson(ownerEntry.id)}
            showHelpdeskFields={showHelpdeskFields}
            variant="owner"
          />
        ) : gate === 'unlocked' && isOwner ? (
          <button onClick={() => {
            const p: DirectoryPerson = { id: uuid(), name: '', phone: '', is_owner: true, is_team: false };
            setPeople(prev => [...prev.filter(x => !x.is_owner), p]);
            setEditId(p.id);
          }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px dashed rgba(245,158,11,0.35)', color: '#f59e0b', cursor: 'pointer' }}>
            <Plus size={11} /> Registrar dueño
          </button>
        ) : (
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {isOwner ? 'Sin número de dueño registrado. Desbloquea para añadir.' : 'Sin número de dueño registrado.'}
          </p>
        )}

        {isOwner && gate === 'confirming' && (
          <div className="flex flex-col gap-2 p-3 rounded-lg mt-2"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs font-medium" style={{ color: '#f59e0b' }}>
              Confirma tu contraseña para editar el número del dueño
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={pwVisible ? 'text' : 'password'}
                  value={pwInput}
                  onChange={e => setPwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmPassword()}
                  placeholder="Contraseña"
                  className="w-full px-3 py-2 pr-8 rounded-lg text-sm"
                  style={inputStyle}
                  autoFocus
                />
                <button
                  onClick={() => setPwVisible(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)' }}>
                  {pwVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button onClick={confirmPassword} disabled={pwChecking || !pwInput.trim()}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer' }}>
                {pwChecking ? '…' : 'Confirmar'}
              </button>
              <button onClick={() => { setGate('locked'); setPwInput(''); setPwError(''); }}
                className="px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-80"
                style={{ background: 'transparent', color: 'var(--c-text-3)', border: '1px solid var(--c-border)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
            {pwError && <p className="text-xs" style={{ color: '#ef4444' }}>{pwError}</p>}
          </div>
        )}
      </section>

      {/* ── Equipo / especialistas ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-1.5 mb-2">
          {showHelpdeskFields
            ? <BookUser size={12} style={{ color: '#6C3BFF' }} />
            : <Users size={12} style={{ color: '#6C3BFF' }} />}
          <span className="text-xs font-semibold" style={{ color: '#6C3BFF' }}>
            {showHelpdeskFields ? 'Personas y especialistas' : 'Equipo'}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
            {teamPeople.length}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {teamPeople.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              Aún no hay personas registradas.
            </p>
          )}
          {teamPeople.map(p => (
            <PersonRow
              key={p.id}
              person={p}
              editing={editId === p.id}
              onUpdate={patch => updatePerson(p.id, patch)}
              onCommit={commitEdit}
              onEdit={() => setEditId(p.id)}
              onRemove={() => removePerson(p.id)}
              onSetOwner={next => setOwnerFlag(p.id, next)}
              showHelpdeskFields={showHelpdeskFields}
              canPromoteToOwner={isOwner}
            />
          ))}
        </div>

        <button onClick={addPerson}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px dashed rgba(108,59,255,0.35)', cursor: 'pointer' }}>
          <Plus size={11} /> Añadir persona
        </button>
      </section>

      {saving && <p className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>Guardando…</p>}
      {!saving && savedAt > 0 && Date.now() - savedAt < 2500 && (
        <p className="text-[11px]" style={{ color: '#22c55e' }}>Guardado</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PersonRow

interface PersonRowProps {
  person:              DirectoryPerson;
  editing:             boolean;
  onUpdate:            (patch: Partial<DirectoryPerson>) => void;
  onCommit:            () => void;
  onEdit:              () => void;
  onRemove:            () => void;
  onSetOwner?:         (next: boolean) => void;
  showHelpdeskFields:  boolean;
  canPromoteToOwner?:  boolean;
  variant?:            'owner' | 'team';
}

function PersonRow({
  person, editing, onUpdate, onCommit, onEdit, onRemove, onSetOwner,
  showHelpdeskFields, canPromoteToOwner = false, variant = 'team',
}: PersonRowProps) {
  const bg     = variant === 'owner' ? 'rgba(245,158,11,0.07)'    : '#FAFAFB';
  const border = variant === 'owner' ? '1px solid rgba(245,158,11,0.25)' : '1px solid #E8E3F5';

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
        style={{ background: bg, border }}>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {variant === 'owner' && <Crown size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />}
          <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>
            {person.name || <em style={{ color: 'var(--c-text-4)' }}>sin nombre</em>}
          </span>
          <span className="font-mono text-xs" style={{ color: 'var(--c-text-3)' }}>{person.phone}</span>
          {person.extension && (
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>ext. {person.extension}</span>
          )}
          {person.department && (
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>
              {person.department}
            </span>
          )}
          {person.on_call && (
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
              guardia
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit}
            className="opacity-50 hover:opacity-100 transition-opacity"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
            title="Editar">
            <Pencil size={13} style={{ color: 'var(--c-text-2)' }} />
          </button>
          <button onClick={onRemove}
            className="opacity-50 hover:opacity-100 transition-opacity"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
            title="Eliminar">
            <X size={14} style={{ color: 'var(--c-text-2)' }} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: bg, border }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={person.name} onChange={e => onUpdate({ name: e.target.value })}
          placeholder="Nombre"
          className="px-3 py-2 rounded-lg text-sm" style={inputStyle} autoFocus />
        <input value={person.phone} onChange={e => onUpdate({ phone: e.target.value })}
          placeholder="Teléfono (ej: +52 811 234 5678)"
          className="px-3 py-2 rounded-lg text-sm font-mono" style={inputStyle} />
        <input value={person.extension ?? ''} onChange={e => onUpdate({ extension: e.target.value })}
          placeholder="Extensión (opcional)"
          className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
        <input value={person.department ?? ''} onChange={e => onUpdate({ department: e.target.value })}
          placeholder="Departamento / área (opcional)"
          className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
      </div>

      {showHelpdeskFields && (
        <>
          <input value={person.role ?? ''} onChange={e => onUpdate({ role: e.target.value })}
            placeholder="Puesto (opcional, ej: Coordinador de red)"
            className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
          <input value={person.helpdesk_expertise ?? ''} onChange={e => onUpdate({ helpdesk_expertise: e.target.value })}
            placeholder="Especialidad para Neo (ej: vpn, wifi, switches)"
            className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-2)' }}>
            <input type="checkbox" checked={!!person.on_call}
              onChange={e => onUpdate({ on_call: e.target.checked })} />
            Disponible en horario de guardia
          </label>
        </>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--c-text-2)' }}>
          {variant !== 'owner' && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!person.is_team}
                onChange={e => onUpdate({ is_team: e.target.checked })} />
              Miembro del equipo
            </label>
          )}
          {canPromoteToOwner && onSetOwner && !person.is_owner && (
            <button onClick={() => onSetOwner(true)}
              className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100"
              style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0 }}>
              <Crown size={11} /> Marcar como dueño
            </button>
          )}
        </div>
        <button onClick={onCommit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Save size={11} /> Guardar
        </button>
      </div>
    </div>
  );
}
