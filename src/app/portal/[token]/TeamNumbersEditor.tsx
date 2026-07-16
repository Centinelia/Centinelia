'use client';

import { useState } from 'react';
import { Plus, X, Crown, Users, Check, Lock, Unlock, Eye, EyeOff, Pencil } from 'lucide-react';

interface TeamNumber {
  number:    string;
  name?:     string;
  is_owner?: boolean;
}

type OwnerGate = 'locked' | 'confirming' | 'unlocked';

interface Props {
  token:          string;
  initialNumbers: TeamNumber[];
  isOwner:        boolean;
}

export default function TeamNumbersEditor({ token, initialNumbers, isOwner }: Props) {
  const [numbers,     setNumbers]     = useState<TeamNumber[]>(initialNumbers);
  const [newNum,      setNewNum]      = useState('');
  const [newName,     setNewName]     = useState('');
  const [ownerNum,    setOwnerNum]    = useState('');
  const [ownerName,   setOwnerName]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  // Password gate for owner section
  const [gate,        setGate]        = useState<OwnerGate>('locked');
  const [pwInput,     setPwInput]     = useState('');
  const [pwVisible,   setPwVisible]   = useState(false);
  const [pwError,     setPwError]     = useState('');
  const [pwChecking,  setPwChecking]  = useState(false);

  const ownerEntry = numbers.find(n => n.is_owner);
  const teamList   = numbers.filter(n => !n.is_owner);

  const inputStyle: React.CSSProperties = {
    background: 'var(--c-surface-2)',
    border:     '1px solid var(--c-border)',
    color:      'var(--c-text)',
    outline:    'none',
  };

  async function persist(updated: TeamNumber[]) {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/team-numbers`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ team_numbers: updated }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
      setPwVisible(false);
    } catch {
      setPwError('Error de conexión');
    } finally {
      setPwChecking(false);
    }
  }

  function saveOwner() {
    const num = ownerNum.trim();
    if (!num) return;
    const entry: TeamNumber = { number: num, name: ownerName.trim() || undefined, is_owner: true };
    const updated = [entry, ...numbers.filter(n => !n.is_owner)];
    setNumbers(updated);
    setOwnerNum('');
    setOwnerName('');
    setGate('locked');
    persist(updated);
  }

  function removeOwner() {
    const updated = numbers.filter(n => !n.is_owner);
    setNumbers(updated);
    setGate('locked');
    persist(updated);
  }

  function addTeam() {
    const num = newNum.trim();
    if (!num) return;
    if (numbers.some(n => n.number === num)) return;
    const entry: TeamNumber = { number: num, name: newName.trim() || undefined };
    const updated = [...numbers, entry];
    setNumbers(updated);
    setNewNum('');
    setNewName('');
    persist(updated);
  }

  function removeTeam(num: string) {
    const updated = numbers.filter(n => n.number !== num);
    setNumbers(updated);
    persist(updated);
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Dueño ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Crown size={12} style={{ color: '#f59e0b' }} />
          <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>Dueño</span>
          {isOwner && ownerEntry && gate === 'locked' && (
            <Lock size={11} style={{ color: 'rgba(245,158,11,0.5)', marginLeft: 2 }} />
          )}
        </div>

        {/* Owner entry display (always visible) */}
        {ownerEntry && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm mb-2"
            style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <Crown size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <span className="font-mono" style={{ color: 'var(--c-text)' }}>{ownerEntry.number}</span>
              {ownerEntry.name && (
                <span style={{ color: 'var(--c-text-3)' }}>— {ownerEntry.name}</span>
              )}
            </div>
            {isOwner && gate === 'unlocked' && (
              <div className="flex items-center gap-1">
                <button onClick={() => { setOwnerNum(ownerEntry.number); setOwnerName(ownerEntry.name ?? ''); }}
                  className="opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--c-text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                  title="Editar">
                  <Pencil size={13} />
                </button>
                <button onClick={removeOwner}
                  className="opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--c-text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                  title="Eliminar">
                  <X size={14} />
                </button>
              </div>
            )}
            {isOwner && gate === 'locked' && (
              <button onClick={() => setGate('confirming')}
                className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: '#f59e0b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                <Pencil size={11} /> Editar
              </button>
            )}
          </div>
        )}

        {/* Password confirmation gate */}
        {isOwner && gate === 'confirming' && (
          <div className="flex flex-col gap-2 p-3 rounded-lg mb-2"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs font-medium" style={{ color: '#f59e0b' }}>
              Confirma tu contraseña para editar el número del dueño
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={pwVisible ? 'text' : 'password'}
                  value={pwInput}
                  onChange={e => { setPwInput(e.target.value); setPwError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') confirmPassword(); if (e.key === 'Escape') { setGate('locked'); setPwInput(''); } }}
                  placeholder="Tu contraseña del portal"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg text-sm pr-9"
                  style={inputStyle}
                />
                <button type="button" onClick={() => setPwVisible(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--c-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {pwVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button onClick={confirmPassword} disabled={!pwInput.trim() || pwChecking}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40 flex-shrink-0"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}>
                {pwChecking ? '…' : <><Unlock size={12} /> Confirmar</>}
              </button>
              <button onClick={() => { setGate('locked'); setPwInput(''); setPwError(''); }}
                className="px-3 py-2 rounded-lg text-xs opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
                style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
            {pwError && (
              <p className="text-xs" style={{ color: '#f87171' }}>{pwError}</p>
            )}
          </div>
        )}

        {/* Owner number edit form (unlocked + no entry, or editing existing) */}
        {isOwner && gate === 'unlocked' && (
          <div className="flex gap-2">
            <input type="text" value={ownerNum} onChange={e => setOwnerNum(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveOwner()}
              placeholder="+5218113334444"
              className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
              style={inputStyle} />
            <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveOwner()}
              placeholder="Tu nombre"
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={inputStyle} />
            <button onClick={saveOwner} disabled={!ownerNum.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40 flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}>
              {saved ? <Check size={14} /> : <Plus size={14} />}
              Guardar
            </button>
          </div>
        )}

        {/* No owner + not yet unlocked: prompt to add */}
        {isOwner && !ownerEntry && gate === 'locked' && (
          <button onClick={() => setGate('confirming')}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-opacity hover:opacity-80"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px dashed rgba(245,158,11,0.3)', color: 'rgba(245,158,11,0.7)', cursor: 'pointer' }}>
            <Plus size={13} /> Agregar número del dueño
          </button>
        )}

        {/* Sub-user: no owner set */}
        {!isOwner && !ownerEntry && (
          <p className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
            El dueño no ha configurado su número todavía.
          </p>
        )}
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--c-border)' }} />

      {/* ── Equipo ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Users size={12} style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Equipo</span>
        </div>

        {teamList.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-2">
            {teamList.map(entry => (
              <div key={entry.number}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Users size={13} className="flex-shrink-0" style={{ color: 'var(--c-text-3)' }} />
                  <span className="font-mono" style={{ color: 'var(--c-text)' }}>{entry.number}</span>
                  {entry.name && (
                    <span style={{ color: 'var(--c-text-3)' }}>— {entry.name}</span>
                  )}
                </div>
                <button onClick={() => removeTeam(entry.number)}
                  className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--c-text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input type="text" value={newNum} onChange={e => setNewNum(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTeam()}
              placeholder="+5218113334444"
              className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
              style={inputStyle} />
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTeam()}
              placeholder="Nombre (opcional)"
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={inputStyle} />
            <button onClick={addTeam} disabled={!newNum.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40 flex-shrink-0"
              style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {saved ? <Check size={14} /> : <Plus size={14} />}
              Agregar
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            El empleado los reconocerá por número y les saludará por nombre. Incluye el código de país. Ej: +5218113334444
          </p>
        </div>
      </div>

    </div>
  );
}
