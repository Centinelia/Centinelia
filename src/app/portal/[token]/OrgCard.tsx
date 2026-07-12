'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Pencil, Check, X } from 'lucide-react';

interface OrgData {
  name:       string | null;
  plan:       string;
  logo_url:   string | null;
  created_at: string;
}

interface Props { token: string; portalEmail: string }

export default function OrgCard({ token, portalEmail }: Props) {
  const [org,     setOrg]     = useState<OrgData | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}/org`)
      .then(r => r.json())
      .then(d => { if (d.org) setOrg(d.org); })
      .catch(() => null);
  }, [token]);

  function startEdit() {
    setDraft(org?.name ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function save() {
    if (!draft.trim()) return cancel();
    setSaving(true);
    await fetch(`/api/portal/${token}/org`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft.trim() }),
    });
    setOrg(prev => prev ? { ...prev, name: draft.trim() } : prev);
    setEditing(false);
    setSaving(false);
  }

  function cancel() {
    setEditing(false);
    setDraft('');
  }

  const planLabel: Record<string, string> = {
    starter:    'Starter',
    crecimiento:'Crecimiento',
    pro:        'Pro',
    agencia:    'Agencia',
  };

  const memberSince = org?.created_at
    ? new Date(org.created_at).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div
      id="organizacion"
      className="rounded-xl p-5"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
    >
      <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
        Organización
      </h2>

      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-xl shrink-0"
          style={{ width: 48, height: 48, background: 'rgba(108,59,255,0.12)', color: '#9B6DFF' }}
        >
          <Building2 size={22} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Name row */}
          {editing ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                maxLength={100}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
              />
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: '#6C3BFF' }}
              >
                <Check size={14} />
              </button>
              <button
                onClick={cancel}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: 'var(--c-text-3)' }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
                {org?.name ?? '—'}
              </span>
              <button
                onClick={startEdit}
                className="flex items-center justify-center w-6 h-6 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: 'var(--c-text-3)', flexShrink: 0 }}
              >
                <Pencil size={11} />
              </button>
            </div>
          )}

          {/* Email */}
          <p className="text-xs truncate mb-2" style={{ color: 'var(--c-text-3)' }}>{portalEmail}</p>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {org?.plan && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF' }}
              >
                {planLabel[org.plan] ?? org.plan}
              </span>
            )}
            {memberSince && (
              <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                Desde {memberSince}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
