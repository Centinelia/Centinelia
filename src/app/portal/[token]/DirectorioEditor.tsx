'use client';

/**
 * DirectorioEditor — editor unificado del directorio de personas de la organización.
 *
 * Reemplaza TeamNumbersEditor (owner + equipo) y helpdesk/DirectorioEditor
 * (especialistas). Todo vive en organizations.directory y se comparte entre
 * todos los agentes de la cuenta.
 *
 * Una persona puede tener múltiples "roles" simultáneos:
 *   - is_owner: responsable (bypass 24/7)
 *   - is_team:  miembro del equipo interno (identificación de llamadas)
 *   - helpdesk_expertise + on_call: aparece en búsquedas de Neo y horario de guardia
 */

import { useState } from 'react';
import { Plus, X, Crown, Pencil, Save, Lock, Eye, EyeOff, BookUser, Users, PenLine, DollarSign, Mail } from 'lucide-react';
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
    // Solo puede haber un responsable
    setPeople(prev => prev.map(p => ({
      ...p,
      is_owner: p.id === id ? next : (next ? false : p.is_owner),
    })));
  }

  const ownerEntry = people.find(p => p.is_owner);
  const teamPeople = people.filter(p => !p.is_owner);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Responsable ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <Crown size={14} style={{ color: '#f59e0b' }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#f59e0b' }}>Responsable</span>
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
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px dashed rgba(245,158,11,0.35)', color: '#f59e0b', cursor: 'pointer' }}>
            <Plus size={12} /> Registrar responsable
          </button>
        ) : (
          <p className="text-[12px]" style={{ color: '#6B6480' }}>
            {isOwner ? 'Sin número de responsable registrado. Desbloquea para añadir.' : 'Sin número de responsable registrado.'}
          </p>
        )}

        {isOwner && gate === 'confirming' && (
          <div className="flex flex-col gap-2.5 p-4 rounded-xl mt-2"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.24)' }}>
            <p className="text-[12px] font-semibold" style={{ color: '#c2680a' }}>
              Confirma tu contraseña para editar el número del responsable
            </p>
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 min-w-[180px]">
                <input
                  type={pwVisible ? 'text' : 'password'}
                  value={pwInput}
                  onChange={e => setPwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmPassword()}
                  placeholder="Contraseña"
                  className="w-full px-3 py-2 pr-8 rounded-lg text-[13px]"
                  style={inputStyle}
                  autoFocus
                />
                <button
                  onClick={() => setPwVisible(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6480' }}>
                  {pwVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button onClick={confirmPassword} disabled={pwChecking || !pwInput.trim()}
                className="px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(245,158,11,0.24)' }}>
                {pwChecking ? '…' : 'Confirmar'}
              </button>
              <button onClick={() => { setGate('locked'); setPwInput(''); setPwError(''); }}
                className="px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-80"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
            {pwError && <p className="text-[11px]" style={{ color: '#dc2626' }}>{pwError}</p>}
          </div>
        )}
      </section>

      {/* ── Equipo / especialistas ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          {showHelpdeskFields
            ? <BookUser size={14} style={{ color: '#6C3BFF' }} />
            : <Users size={14} style={{ color: '#6C3BFF' }} />}
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#6C3BFF' }}>
            {showHelpdeskFields ? 'Personas y especialistas' : 'Equipo'}
          </span>
          {teamPeople.length > 0 && (
            <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}>
              {teamPeople.length}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {teamPeople.length === 0 && (
            <p className="text-[12px]" style={{ color: '#9B8FB5' }}>
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
          className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.06)', color: '#6C3BFF', border: '1px dashed rgba(108,59,255,0.28)', cursor: 'pointer' }}>
          <Plus size={12} /> Añadir persona
        </button>
      </section>

      {saving && (
        <p className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#6B6480' }}>
          Guardando
        </p>
      )}
      {!saving && savedAt > 0 && Date.now() - savedAt < 2500 && (
        <p className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: '#22c55e' }}>Guardado</p>
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
  const bg     = variant === 'owner' ? 'rgba(245,158,11,0.06)'    : '#FAFAFB';
  const border = variant === 'owner' ? '1px solid rgba(245,158,11,0.24)' : '1px solid #E8E3F5';

  if (!editing) {
    // Initials del nombre para el avatar
    const initials = (person.name ?? '')
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
    const avatarBg = variant === 'owner' ? 'rgba(245,158,11,0.15)' : 'rgba(108,59,255,0.12)';
    const avatarColor = variant === 'owner' ? '#c2680a' : '#6C3BFF';
    return (
      <div className="group flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-colors"
        style={{ background: bg, border }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = variant === 'owner' ? 'rgba(245,158,11,0.10)' : '#F4F1FA'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = bg}>
        {/* Avatar initials */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
          style={{ background: avatarBg, color: avatarColor }}>
          {variant === 'owner' ? <Crown size={16} strokeWidth={2.2} /> : initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
              {person.name || <em style={{ color: '#9B8FB5', fontWeight: 400 }}>Sin nombre</em>}
            </span>
            {person.department && (
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>
                {person.department}
              </span>
            )}
            {person.on_call && (
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#16a34a' }} />
                Guardia
              </span>
            )}
            {person.is_oc_autorizador && (
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#c2680a' }}
                title="Autoriza órdenes de compra que no pasan autofirma">
                <PenLine size={9} /> Autoriza OC
              </span>
            )}
            {person.is_oc_pagos && (
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1"
                style={{ background: 'rgba(14,165,233,0.12)', color: '#0369a1' }}
                title="Recibe OCs firmadas para hacer transferencia bancaria">
                <DollarSign size={9} /> Pagos OC
              </span>
            )}
            {/* Badge "Operaciones" (flag is_operations_contact) escondido
                2026-08-31 junto con su checkbox. Ver comentario más abajo. */}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {person.phone && (
              <span className="font-mono text-[12px]" style={{ color: '#6B6480' }}>{person.phone}</span>
            )}
            {person.extension && (
              <span className="text-[11px]" style={{ color: '#9B8FB5' }}>· ext. {person.extension}</span>
            )}
            {person.email && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: '#6B6480' }}>
                <Mail size={10} /> {person.email}
              </span>
            )}
            {!person.phone && !person.email && (
              <span className="text-[11px]" style={{ color: '#9B8FB5' }}>Sin contacto</span>
            )}
          </div>
        </div>

        {/* Actions — siempre visibles en móvil (< sm), hover-reveal en desktop */}
        <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[rgba(108,59,255,0.08)]"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Editar">
            <Pencil size={13} style={{ color: '#6C3BFF' }} />
          </button>
          <button onClick={onRemove}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.1)]"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Eliminar">
            <X size={15} style={{ color: '#EF4444' }} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-xl" style={{ background: bg, border }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={person.name} onChange={e => onUpdate({ name: e.target.value })}
          placeholder="Nombre"
          className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle} autoFocus />
        <input value={person.phone} onChange={e => onUpdate({ phone: e.target.value })}
          placeholder="Teléfono (ej: +52 811 234 5678)"
          className="px-3 py-2 rounded-lg text-[13px] font-mono" style={inputStyle} />
        <input type="email" value={person.email ?? ''} onChange={e => onUpdate({ email: e.target.value })}
          placeholder="Correo (opcional, requerido para escalación OC)"
          className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
        <input value={person.extension ?? ''} onChange={e => onUpdate({ extension: e.target.value })}
          placeholder="Extensión (opcional)"
          className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
        <input value={person.department ?? ''} onChange={e => onUpdate({ department: e.target.value })}
          placeholder="Departamento o área (opcional)"
          className="px-3 py-2 rounded-lg text-[13px] sm:col-span-2" style={inputStyle} />
      </div>

      {/* Flags del pack ciclo_oc_cfdi — solo visibles si hay correo */}
      {(person.email ?? '').trim() && (
        <div className="flex flex-col gap-1.5 pt-1 pb-1 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B8FB5' }}>
            Roles del ciclo de compras
          </p>
          <label className="flex items-start gap-2 text-[12px] cursor-pointer" style={{ color: '#6B6480' }}>
            <input type="checkbox" className="mt-0.5" checked={!!person.is_oc_autorizador}
              onChange={e => onUpdate({ is_oc_autorizador: e.target.checked })} />
            <div>
              <span style={{ color: '#1A0A3B', fontWeight: 500 }}>Autoriza órdenes de compra</span>
              <div className="text-[11px]" style={{ color: '#9B8FB5' }}>
                Recibe por correo las OCs que no pasan autofirma para aprobación manual.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-2 text-[12px] cursor-pointer" style={{ color: '#6B6480' }}>
            <input type="checkbox" className="mt-0.5" checked={!!person.is_oc_pagos}
              onChange={e => onUpdate({ is_oc_pagos: e.target.checked })} />
            <div>
              <span style={{ color: '#1A0A3B', fontWeight: 500 }}>Departamento de pagos</span>
              <div className="text-[11px]" style={{ color: '#9B8FB5' }}>
                Recibe por correo las OCs firmadas para hacer la transferencia bancaria al proveedor.
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Rol operativo — el checkbox "Contacto de operaciones" (flag
          `is_operations_contact`) se esconde 2026-08-31 porque generaba
          confusión: Nelia solo manda correo (no llama al encargado) y el flag
          es de Noah/otros meerkats con buscar_directorio o trigger_outbound_call.
          El valor en DB se preserva por si un flow futuro lo necesita.

          Solo requiere email (no phone): el flow es notificación por correo. */}
      {(person.email ?? '').trim() && (
        <div className="flex flex-col gap-1.5 pt-1 pb-1 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9B8FB5' }}>
            Notificaciones
          </p>
          <label className="flex items-start gap-2 text-[12px] cursor-pointer" style={{ color: '#6B6480' }}>
            <input type="checkbox" className="mt-0.5" checked={!!person.receives_incident_reports}
              onChange={e => onUpdate({ receives_incident_reports: e.target.checked })} />
            <div>
              <span style={{ color: '#1A0A3B', fontWeight: 500 }}>Recibe reportes de incidencias por correo</span>
              <div className="text-[11px]" style={{ color: '#9B8FB5' }}>
                Se envían notificaciones automáticas de problemas en operaciones y entregas a este correo.
              </div>
            </div>
          </label>
        </div>
      )}

      {showHelpdeskFields && (
        <>
          <input value={person.role ?? ''} onChange={e => onUpdate({ role: e.target.value })}
            placeholder="Puesto (opcional, ej: Coordinador de red)"
            className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
          <input value={person.helpdesk_expertise ?? ''} onChange={e => onUpdate({ helpdesk_expertise: e.target.value })}
            placeholder="Especialidad para Neo (ej: vpn, wifi, switches)"
            className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
          <label className="flex items-center gap-2 text-[12px]" style={{ color: '#6B6480' }}>
            <input type="checkbox" checked={!!person.on_call}
              onChange={e => onUpdate({ on_call: e.target.checked })} />
            Disponible en horario de guardia
          </label>
        </>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <div className="flex items-center gap-3 text-[12px]" style={{ color: '#6B6480' }}>
          {variant !== 'owner' && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!person.is_team}
                onChange={e => onUpdate({ is_team: e.target.checked })} />
              Miembro del equipo
            </label>
          )}
          {canPromoteToOwner && onSetOwner && !person.is_owner && (
            <button onClick={() => onSetOwner(true)}
              className="text-[12px] font-medium flex items-center gap-1 opacity-70 hover:opacity-100"
              style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0 }}>
              <Crown size={11} /> Marcar como responsable
            </button>
          )}
        </div>
        <button onClick={onCommit}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
          <Save size={12} /> Guardar
        </button>
      </div>
    </div>
  );
}
