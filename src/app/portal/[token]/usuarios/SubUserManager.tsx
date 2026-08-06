'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, Check, X, Eye, EyeOff, ChevronDown, ChevronUp, Users, Info, Search } from 'lucide-react';
import { PORTAL_MODULES, GIRO_GROUPS } from '@/lib/portal/modules';

interface PortalUser {
  id:         string;
  email:      string;
  name:       string | null;
  modules:    string[];
  is_owner:   boolean;
  created_at: string;
}

interface Props {
  token:          string;
  initialUsers:   PortalUser[];
  accountGiro?:   string;
  accountSerial?: string;
}

// ── Module Selector ────────────────────────────────────────────────────────────

function ModuleSelector({
  selected,
  onChange,
  accountGiro,
}: {
  selected:     string[];
  onChange:     (m: string[]) => void;
  accountGiro?: string;
}) {
  const [openGiros, setOpenGiros] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of GIRO_GROUPS) initial[g.id] = g.id === accountGiro;
    return initial;
  });

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const toggleAll = (ids: string[]) => {
    const allSel = ids.every(id => selected.includes(id));
    if (allSel) onChange(selected.filter(id => !ids.includes(id)));
    else onChange([...new Set([...selected, ...ids])]);
  };

  const generalModules = (group: string) =>
    PORTAL_MODULES.filter(m => m.group === group && m.giros.includes('all'));

  const allInSet  = (ids: string[]) => ids.every(id => selected.includes(id));
  const someInSet = (ids: string[]) => ids.some(id => selected.includes(id));

  return (
    <div className="flex flex-col gap-4">
      {/* General groups */}
      {(['Portal', 'Oficina'] as const).map(group => {
        const mods = generalModules(group);
        const ids  = mods.map(m => m.id);
        const all  = allInSet(ids);
        const some = someInSet(ids) && !all;
        return (
          <div key={group}>
            <button
              type="button"
              onClick={() => toggleAll(ids)}
              className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--c-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Checkbox all={all} some={some} />
              {group === 'Oficina' ? 'Oficina (general)' : group}
            </button>
            <div className="grid grid-cols-1 gap-1.5 pl-2">
              {mods.map(m => <ModuleToggle key={m.id} id={m.id} label={m.label} selected={selected} onToggle={toggle} />)}
            </div>
          </div>
        );
      })}

      {/* Industry groups */}
      {GIRO_GROUPS.map(giroGroup => {
        const mods     = PORTAL_MODULES.filter(m => m.giros.includes(giroGroup.id));
        if (mods.length === 0) return null;
        const ids      = mods.map(m => m.id);
        const all      = allInSet(ids);
        const some     = someInSet(ids) && !all;
        const isOpen   = !!openGiros[giroGroup.id];
        const isActive = giroGroup.id === accountGiro;

        return (
          <div key={giroGroup.id} className="rounded-xl"
            style={{ border: isActive ? '1px solid rgba(108,59,255,0.35)' : '1px solid var(--c-border)', background: isActive ? 'rgba(108,59,255,0.04)' : 'var(--c-surface-2)' }}>

            <div className="flex items-center gap-2 px-3 py-2.5">
              <button type="button" onClick={() => toggleAll(ids)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                <Checkbox all={all} some={some} />
              </button>
              <button
                type="button"
                onClick={() => setOpenGiros(p => ({ ...p, [giroGroup.id]: !p[giroGroup.id] }))}
                className="flex-1 flex items-center gap-2 text-left"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: isActive ? '#9B6DFF' : 'var(--c-text-3)' }}>
                  {giroGroup.label}
                </span>
                {isActive && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: 'rgba(108,59,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }}>
                    Tu sector
                  </span>
                )}
                <span className="ml-auto" style={{ color: 'var(--c-text-4)' }}>
                  {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
            </div>

            {isOpen && (
              <div className="px-3 pb-3 grid grid-cols-1 gap-1.5" style={{ borderTop: '1px solid var(--c-border)' }}>
                <div className="h-2" />
                {mods.map(m => <ModuleToggle key={m.id} id={m.id} label={m.label} selected={selected} onToggle={toggle} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Checkbox({ all, some }: { all: boolean; some: boolean }) {
  return (
    <div className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
      style={{ border: '1px solid rgba(108,59,255,0.6)', background: all ? '#6C3BFF' : some ? 'rgba(108,59,255,0.35)' : 'transparent' }}>
      {all && <Check size={9} color="#fff" />}
      {some && <span style={{ width: 6, height: 2, background: '#fff', display: 'block', borderRadius: 1 }} />}
    </div>
  );
}

function ModuleToggle({ id, label, selected, onToggle }: {
  id: string; label: string; selected: string[]; onToggle: (id: string) => void;
}) {
  const on   = selected.includes(id);
  const desc = PORTAL_MODULES.find(m => m.id === id)?.desc;
  const [tip, setTip] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tip) return;
    const hide = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) setTip(false);
    };
    document.addEventListener('mousedown', hide);
    return () => document.removeEventListener('mousedown', hide);
  }, [tip]);

  return (
    <div className="relative flex">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex-1 flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors text-left"
        style={{
          background:   on ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
          border:       on ? '1px solid rgba(108,59,255,0.4)' : '1px solid var(--c-border)',
          color:        on ? '#9B6DFF' : 'var(--c-text-2)',
          borderRadius: desc ? '8px 0 0 8px' : 8,
        }}
      >
        <div className="w-3 h-3 rounded flex items-center justify-center flex-shrink-0"
          style={{ border: '1px solid rgba(108,59,255,0.5)', background: on ? '#6C3BFF' : 'transparent' }}>
          {on && <Check size={8} color="#fff" />}
        </div>
        {label}
      </button>

      {desc && (
        <div className="relative flex-shrink-0" ref={tipRef}>
          <button
            type="button"
            onClick={() => setTip(v => !v)}
            className="h-full px-1.5 flex items-center justify-center"
            style={{
              background:   on ? 'rgba(108,59,255,0.08)' : 'var(--c-surface-2)',
              border:       on ? '1px solid rgba(108,59,255,0.4)' : '1px solid var(--c-border)',
              borderLeft:   'none',
              borderRadius: '0 8px 8px 0',
              color:        'var(--c-text-4)',
              cursor:       'pointer',
            }}
          >
            <Info size={10} />
          </button>

          {tip && (
            <div
              className="absolute z-50 bottom-full right-0 mb-1.5 w-52 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
              style={{ background: 'var(--c-modal)', border: '1px solid rgba(108,59,255,0.25)', color: 'var(--c-text-2)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
            >
              <p className="font-semibold mb-0.5" style={{ color: '#9B6DFF' }}>{label}</p>
              {desc}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Initials avatar ────────────────────────────────────────────────────────────

const AVATAR_HUES = [265, 210, 155, 25, 340, 190];

function InitialsAvatar({ name, email, isOwner }: { name: string | null; email: string; isOwner: boolean }) {
  const source = (name?.trim() || email).replace(/[^a-zA-Z0-9\s]/g, ' ');
  const initials = source.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || email[0]?.toUpperCase() || '?';
  // Deterministic color from email
  const h = AVATAR_HUES[Math.abs(email.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_HUES.length];
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        background: isOwner
          ? 'linear-gradient(135deg, rgba(108,59,255,0.16), rgba(108,59,255,0.06))'
          : `hsl(${h} 70% 96%)`,
        color:      isOwner ? '#6C3BFF' : `hsl(${h} 55% 42%)`,
        border:     isOwner ? '1px solid rgba(108,59,255,0.28)' : `1px solid hsl(${h} 60% 88%)`,
        fontSize:   12,
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}
    >
      {initials}
    </div>
  );
}

// ── Module chips (compact view) ────────────────────────────────────────────────

function ModuleChips({ modules }: { modules: string[] }) {
  if (modules.length === 0)
    return <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin acceso</span>;
  const labels = modules.map(id => PORTAL_MODULES.find(m => m.id === id)?.label ?? id);
  const shown  = labels.slice(0, 3);
  const rest   = labels.length - 3;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(l => (
        <span key={l} className="px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
          {l}
        </span>
      ))}
      {rest > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
          +{rest}
        </span>
      )}
    </div>
  );
}

// ── Password field ─────────────────────────────────────────────────────────────

function PasswordField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-9 rounded-lg text-xs"
        style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
      />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2"
        style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer' }}>
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SubUserManager({ token, initialUsers, accountGiro, accountSerial }: Props) {
  const [users, setUsers]         = useState<PortalUser[]>(initialUsers);
  const [showAdd, setShowAdd]     = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');

  const [newEmail,    setNewEmail]    = useState('');
  const [newName,     setNewName]     = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newModules,  setNewModules]  = useState<string[]>([]);

  const [editName,     setEditName]     = useState('');
  const [editModules,  setEditModules]  = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [editOpen,     setEditOpen]     = useState(false);

  // Derived per-user serial: owner → accountSerial as-is; sub-users → CNT-XXXXX-NN
  // where NN is a 2-digit index based on creation order among non-owners.
  const serialByUserId = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    if (!accountSerial) return map;
    let subIdx = 0;
    for (const u of users) {
      if (u.is_owner) { map[u.id] = accountSerial; continue; }
      subIdx += 1;
      map[u.id] = `${accountSerial}-${String(subIdx).padStart(2, '0')}`;
    }
    return map;
  }, [users, accountSerial]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    if (accountSerial && q === accountSerial.toLowerCase()) return users;
    return users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      (u.name ?? '').toLowerCase().includes(q) ||
      (serialByUserId[u.id] ?? '').toLowerCase().includes(q)
    );
  }, [users, search, accountSerial, serialByUserId]);

  const startEdit = (u: PortalUser) => {
    setEditId(u.id); setEditName(u.name ?? ''); setEditModules(u.modules);
    setEditPassword(''); setEditOpen(false); setError('');
  };
  const cancelEdit = () => { setEditId(null); setError(''); };

  const handleAdd = async () => {
    if (!newEmail.trim() || !newPassword.trim()) { setError('Correo y contraseña son requeridos'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/portal/${token}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || undefined, password: newPassword, modules: newModules }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al crear usuario'); return; }
      const { user } = await res.json();
      setUsers(u => [...u, user]);
      setShowAdd(false); setNewEmail(''); setNewName(''); setNewPassword(''); setNewModules([]);
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    setSaving(true); setError('');
    try {
      const body: Record<string, unknown> = { name: editName, modules: editModules };
      if (editPassword.trim()) body.password = editPassword;
      const res = await fetch(`/api/portal/${token}/users/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al guardar'); return; }
      const { user } = await res.json();
      setUsers(u => u.map(x => x.id === user.id ? { ...x, ...user } : x));
      setEditId(null);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`¿Eliminar el acceso de ${email}?`)) return;
    const res = await fetch(`/api/portal/${token}/users/${id}`, { method: 'DELETE' });
    if (res.ok) setUsers(u => u.filter(x => x.id !== id));
    else setError('Error al eliminar usuario');
  };

  const resetAdd = () => {
    setShowAdd(false); setNewEmail(''); setNewName(''); setNewPassword(''); setNewModules([]); setError('');
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">

      {/* ── LEFT PANEL: form ──────────────────────────────────────────────── */}
      <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} style={{ color: '#6C3BFF' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Usuarios ({users.length})
            </h2>
          </div>
          {!showAdd && (
            <button
              onClick={() => { setShowAdd(true); setError(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={12} /> Añadir usuario
            </button>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        {/* Add form */}
        {showAdd ? (
          <div className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.2)' }}>
            <p className="text-xs font-semibold" style={{ color: '#9B6DFF' }}>Nuevo usuario</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Correo *</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="usuario@empresa.com" className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Nombre</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Nombre del usuario" className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Contraseña inicial *</label>
              <PasswordField value={newPassword} onChange={setNewPassword} placeholder="Mínimo 8 caracteres" />
            </div>

            <div>
              <label className="block text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Secciones con acceso</label>
              <ModuleSelector selected={newModules} onChange={setNewModules} accountGiro={accountGiro} />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={handleAdd} disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Guardando...' : 'Crear usuario'}
              </button>
              <button onClick={resetAdd}
                className="px-4 py-2 rounded-lg text-xs transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 rounded-xl text-xs flex flex-col gap-1"
            style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: 'var(--c-text-3)' }}>
            <p className="font-semibold" style={{ color: 'var(--c-text-2)' }}>Acerca de los usuarios</p>
            <p>Cada usuario tiene su propio correo y contraseña. Al iniciar sesión, solo ven las secciones que tú les asignas.</p>
            <p>El propietario siempre tiene acceso completo.</p>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: user list ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-4)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo o número de cuenta…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm outline-none transition-colors focus:border-[rgba(108,59,255,0.4)]"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
          />
        </div>

        {/* Empty state */}
        {users.length === 0 && (
          <div className="flex flex-col items-center text-center py-16 px-4 rounded-2xl"
            style={{ background: 'rgba(108,59,255,0.03)', border: '1px dashed rgba(108,59,255,0.2)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.16)' }}>
              <Users size={22} style={{ color: '#9B6DFF' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Sin colaboradores aún</p>
            <p className="text-xs mt-1.5 max-w-[280px]" style={{ color: 'var(--c-text-3)' }}>
              Añade a tu equipo desde el panel de la izquierda. Cada persona inicia sesión con su propio correo.
            </p>
          </div>
        )}

        {users.length > 0 && filteredUsers.length === 0 && (
          <div className="text-center py-10 text-xs" style={{ color: 'var(--c-text-4)' }}>
            Sin resultados para &ldquo;{search}&rdquo;
          </div>
        )}

        {/* User cards */}
        {filteredUsers.map(u => (
          <div key={u.id} className="user-card rounded-xl overflow-hidden transition-all"
            style={{
              border: editId === u.id ? '1px solid rgba(108,59,255,0.4)' : '1px solid var(--c-border-2)',
              background: 'var(--c-surface)',
              boxShadow: editId === u.id ? '0 8px 24px rgba(108,59,255,0.08)' : '0 1px 2px rgba(26,10,59,0.04)',
            }}>

            {/* User header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <InitialsAvatar name={u.name} email={u.email} isOwner={u.is_owner} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)', letterSpacing: '-0.005em' }}>
                      {u.name ?? u.email}
                    </p>
                    {u.is_owner && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: 'rgba(245,158,11,0.10)', color: '#c2820a', border: '1px solid rgba(245,158,11,0.22)' }}>
                        Propietario
                      </span>
                    )}
                  </div>
                  {u.name && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--c-text-3)' }}>{u.email}</p>}
                </div>
              </div>
              {!u.is_owner && (
                <div className="flex items-center gap-1 shrink-0">
                  {editId !== u.id ? (
                    <>
                      <button onClick={() => startEdit(u)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                        style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer' }}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(u.id, u.email)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                        style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleSaveEdit} disabled={saving}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(34,197,94,0.1)]"
                        style={{ background: 'none', border: 'none', color: '#22c55e', cursor: saving ? 'not-allowed' : 'pointer' }}>
                        <Check size={13} />
                      </button>
                      <button onClick={cancelEdit}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                        style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer' }}>
                        <X size={13} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modules chips (view mode) */}
            {editId !== u.id && (
              <div className="px-4 pb-3 flex items-end justify-between gap-2">
                <ModuleChips modules={u.modules} />
                {serialByUserId[u.id] && (
                  <span
                    className="shrink-0 text-[10px] font-semibold"
                    style={{ color: 'var(--c-text-4)', fontFamily: 'monospace', letterSpacing: '0.04em' }}
                  >
                    {serialByUserId[u.id]}
                  </span>
                )}
              </div>
            )}

            {/* Edit mode */}
            {editId === u.id && (
              <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--c-border)' }}>
                <div className="pt-3">
                  <label className="block text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Nombre</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                    placeholder="Nombre del usuario" className="w-full px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                </div>

                <div>
                  <label className="block text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Secciones con acceso</label>
                  <ModuleSelector selected={editModules} onChange={setEditModules} accountGiro={accountGiro} />
                </div>

                <div>
                  <button type="button" onClick={() => setEditOpen(v => !v)}
                    className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                    style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer', padding: 0 }}>
                    {editOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    Cambiar contraseña
                  </button>
                  {editOpen && (
                    <div className="mt-2">
                      <PasswordField value={editPassword} onChange={setEditPassword} placeholder="Nueva contraseña" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
