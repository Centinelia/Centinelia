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
  /** ID del sub-usuario logueado (undefined si es owner). Se usa para ocultar
   *  las acciones sobre su propia tarjeta y evitar auto-lockout. */
  currentUserId?: string;
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
              style={{ color: '#6B6480', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
            style={{ border: isActive ? '1px solid rgba(108,59,255,0.35)' : '1px solid #E8E3F5', background: isActive ? 'rgba(108,59,255,0.04)' : '#FAFAFB' }}>

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
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: isActive ? '#9B6DFF' : '#6B6480' }}>
                  {giroGroup.label}
                </span>
                {isActive && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: 'rgba(108,59,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }}>
                    Tu sector
                  </span>
                )}
                <span className="ml-auto" style={{ color: '#9B8FB5' }}>
                  {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
            </div>

            {isOpen && (
              <div className="px-3 pb-3 grid grid-cols-1 gap-1.5" style={{ borderTop: '1px solid #E8E3F5' }}>
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
          background:   on ? 'rgba(108,59,255,0.12)' : '#FAFAFB',
          border:       on ? '1px solid rgba(108,59,255,0.4)' : '1px solid #E8E3F5',
          color:        on ? '#9B6DFF' : '#1A0A3B',
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
              background:   on ? 'rgba(108,59,255,0.08)' : '#FAFAFB',
              border:       on ? '1px solid rgba(108,59,255,0.4)' : '1px solid #E8E3F5',
              borderLeft:   'none',
              borderRadius: '0 8px 8px 0',
              color:        '#9B8FB5',
              cursor:       'pointer',
            }}
          >
            <Info size={10} />
          </button>

          {tip && (
            <div
              className="absolute z-50 bottom-full right-0 mb-1.5 w-52 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', boxShadow: '0 8px 24px rgba(26,10,59,0.12)' }}
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
    return <span className="text-xs" style={{ color: '#9B8FB5' }}>Sin acceso</span>;
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
          style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
          +{rest}
        </span>
      )}
    </div>
  );
}

// ── Field group (label + input + hint) ────────────────────────────────────────

function FieldGroup({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold flex items-center gap-1" style={{ color: '#1A0A3B', letterSpacing: '0.01em' }}>
        {label}
        {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed" style={{ color: '#9B8FB5' }}>{hint}</p>}
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
        className="w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm outline-none transition-colors focus:border-[rgba(108,59,255,0.45)]"
        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
      />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:bg-[#ffffff]"
        style={{ background: 'none', border: 'none', color: '#6B6480', cursor: 'pointer' }}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SubUserManager({ token, initialUsers, accountGiro, accountSerial, currentUserId }: Props) {
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
            <h2 className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
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
          <div
            className="rounded-2xl p-5 flex flex-col gap-4"
            style={{
              background: '#ffffff',
              border:     '1px solid rgba(108,59,255,0.25)',
              boxShadow:  '0 12px 30px rgba(108,59,255,0.08)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.22)' }}
              >
                <Plus size={14} style={{ color: '#6C3BFF' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight" style={{ color: '#1A0A3B' }}>
                  Nuevo colaborador
                </p>
                <p className="text-[11px]" style={{ color: '#6B6480' }}>
                  Configura correo, contraseña inicial y las secciones a las que tendrá acceso.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldGroup label="Correo" required>
                <input
                  type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors focus:border-[rgba(108,59,255,0.45)]"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                />
              </FieldGroup>
              <FieldGroup label="Nombre">
                <input
                  type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Nombre del colaborador"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors focus:border-[rgba(108,59,255,0.45)]"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Contraseña inicial" required hint="Mínimo 8 caracteres. El usuario podrá cambiarla al iniciar sesión.">
              <PasswordField value={newPassword} onChange={setNewPassword} placeholder="Mínimo 8 caracteres" />
            </FieldGroup>

            <FieldGroup label="Secciones con acceso" hint="Selecciona qué áreas del portal podrá ver este usuario.">
              <ModuleSelector selected={newModules} onChange={setNewModules} accountGiro={accountGiro} />
            </FieldGroup>

            <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid #E8E3F5' }}>
              <button
                onClick={resetAdd}
                className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-[#FAFAFB]"
                style={{ background: 'none', border: '1px solid #E8E3F5', color: '#1A0A3B', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAdd} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 12px rgba(108,59,255,0.25)' }}
              >
                {saving ? 'Guardando…' : (<><Plus size={13} /> Crear colaborador</>)}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl px-4 py-4 flex gap-3"
            style={{ background: 'rgba(108,59,255,0.045)', border: '1px solid rgba(108,59,255,0.16)' }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.22)' }}
            >
              <Info size={14} style={{ color: '#6C3BFF' }} />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Acerca de los usuarios</p>
              <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
                Cada usuario inicia sesión con su propio correo y contraseña. Solo ve las secciones que le asignes. El propietario siempre tiene acceso completo.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: user list ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9B8FB5' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo o número de cuenta…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm outline-none transition-colors focus:border-[rgba(108,59,255,0.4)]"
            style={{ background: '#ffffff', border: '1px solid #F0EDF9', color: '#1A0A3B' }}
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
            <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Sin colaboradores aún</p>
            <p className="text-xs mt-1.5 max-w-[280px]" style={{ color: '#6B6480' }}>
              Añade a tu equipo desde el panel de la izquierda. Cada persona inicia sesión con su propio correo.
            </p>
          </div>
        )}

        {users.length > 0 && filteredUsers.length === 0 && (
          <div className="text-center py-10 text-xs" style={{ color: '#9B8FB5' }}>
            Sin resultados para &ldquo;{search}&rdquo;
          </div>
        )}

        {/* User cards */}
        {filteredUsers.map(u => (
          <div key={u.id} className="user-card rounded-xl overflow-hidden transition-all"
            style={{
              border: editId === u.id ? '1px solid rgba(108,59,255,0.4)' : '1px solid #F0EDF9',
              background: '#ffffff',
              boxShadow: editId === u.id ? '0 8px 24px rgba(108,59,255,0.08)' : '0 1px 2px rgba(26,10,59,0.04)',
            }}>

            {/* User header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <InitialsAvatar name={u.name} email={u.email} isOwner={u.is_owner} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate" style={{ color: '#1A0A3B', letterSpacing: '-0.005em' }}>
                      {u.name ?? u.email}
                    </p>
                    {u.is_owner && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: 'rgba(245,158,11,0.10)', color: '#c2820a', border: '1px solid rgba(245,158,11,0.22)' }}>
                        Propietario
                      </span>
                    )}
                  </div>
                  {u.name && <p className="text-xs truncate mt-0.5" style={{ color: '#6B6480' }}>{u.email}</p>}
                </div>
              </div>
              {!u.is_owner && u.id !== currentUserId && editId !== u.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(u)}
                    title="Editar"
                    className="p-2 rounded-lg transition-colors hover:bg-[rgba(108,59,255,0.08)]"
                    style={{ background: 'none', border: 'none', color: '#6B6480', cursor: 'pointer' }}>
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(u.id, u.email)}
                    title="Eliminar"
                    className="p-2 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                    style={{ background: 'none', border: 'none', color: '#6B6480', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
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
                    style={{ color: '#9B8FB5', fontFamily: 'monospace', letterSpacing: '0.04em' }}
                  >
                    {serialByUserId[u.id]}
                  </span>
                )}
              </div>
            )}

            {/* Edit mode */}
            {editId === u.id && (
              <div className="px-5 pb-5 pt-4 flex flex-col gap-4" style={{ borderTop: '1px solid #E8E3F5', background: 'rgba(108,59,255,0.03)' }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.22)' }}
                  >
                    <Edit2 size={13} style={{ color: '#6C3BFF' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight" style={{ color: '#1A0A3B' }}>
                      Editando {u.name ?? u.email}
                    </p>
                    <p className="text-[11px]" style={{ color: '#6B6480' }}>
                      Cambia nombre, permisos o contraseña.
                    </p>
                  </div>
                </div>

                <FieldGroup label="Nombre">
                  <input
                    type="text" value={editName} onChange={e => setEditName(e.target.value)}
                    placeholder="Nombre del colaborador"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors focus:border-[rgba(108,59,255,0.45)]"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
                  />
                </FieldGroup>

                <FieldGroup label="Secciones con acceso">
                  <ModuleSelector selected={editModules} onChange={setEditModules} accountGiro={accountGiro} />
                </FieldGroup>

                <div>
                  <button
                    type="button" onClick={() => setEditOpen(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ background: 'none', border: 'none', color: '#6C3BFF', cursor: 'pointer', padding: 0 }}
                  >
                    {editOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Cambiar contraseña
                  </button>
                  {editOpen && (
                    <div className="mt-2.5">
                      <PasswordField value={editPassword} onChange={setEditPassword} placeholder="Nueva contraseña" />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3" style={{ borderTop: '1px solid #E8E3F5' }}>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-[#FAFAFB]"
                    style={{ background: 'none', border: '1px solid #E8E3F5', color: '#6B6480', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveEdit} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90"
                    style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 12px rgba(108,59,255,0.25)' }}
                  >
                    {saving ? 'Guardando…' : (<><Check size={13} strokeWidth={2.5} /> Guardar cambios</>)}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
