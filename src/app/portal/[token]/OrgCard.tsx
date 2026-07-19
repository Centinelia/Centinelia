'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import InfoTooltip  from '@/components/InfoTooltip';
import LogoUploader from './LogoUploader';

interface OrgData {
  name:       string | null;
  plan:       string;
  logo_url:   string | null;
  created_at: string;
}

interface Props { token: string; portalEmail: string; logoUrl: string | null; initialDescription?: string }

export default function OrgCard({ token, portalEmail, logoUrl, initialDescription = '' }: Props) {
  const [org,     setOrg]     = useState<OrgData | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [desc,      setDesc]      = useState(initialDescription);
  const [descSaved, setDescSaved] = useState(false);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDesc = async (value: string) => {
    await fetch(`/api/portal/${token}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_description: value }),
    });
    setDescSaved(true);
    setTimeout(() => setDescSaved(false), 2000);
  };

  const handleDescChange = (value: string) => {
    setDesc(value);
    setDescSaved(false);
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => saveDesc(value), 900);
  };

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

  function cancel() { setEditing(false); setDraft(''); }

  const planLabel: Record<string, string> = {
    starter: 'Starter', crecimiento: 'Crecimiento', pro: 'Pro', agencia: 'Agencia',
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
      {/* Header row: two column labels */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Organización
          </h2>
          <InfoTooltip text="Nombre e identidad de tu cuenta. El logo aparece en el encabezado del portal y en los documentos generados." />
        </div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Logo</h2>
          <InfoTooltip text={"Aparece en el encabezado de tu portal de clientes y en todos los documentos generados.\nFormatos: PNG, JPG, SVG o WebP. Máx. 2 MB."} />
        </div>
      </div>

      {/* Content row: name/email/date + logo */}
      <div className="flex items-start gap-5">

        {/* Left: org info */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                maxLength={100}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
              />
              <button onClick={save} disabled={saving}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: '#6C3BFF' }}>
                <Check size={14} />
              </button>
              <button onClick={cancel}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: 'var(--c-text-3)' }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
                {org?.name ?? '—'}
              </span>
              <button onClick={startEdit}
                className="flex items-center justify-center w-6 h-6 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: 'var(--c-text-3)', flexShrink: 0 }}>
                <Pencil size={11} />
              </button>
            </div>
          )}

          <p className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{portalEmail}</p>

          {memberSince && (
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              Desde {memberSince}
            </span>
          )}
        </div>

        {/* Right: logo */}
        <div className="flex-shrink-0">
          <LogoUploader token={token} currentUrl={logoUrl} />
        </div>

      </div>

      {/* Business description — full width */}
      <div className="mt-4 flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>Descripción</span>
          <InfoTooltip text={"Describe brevemente a qué se dedica tu organización y tus servicios principales.\nEl agente IA usará esto para generar bases de conocimiento más precisas."} />
          {descSaved && <Check size={10} style={{ color: '#22c55e', marginLeft: 2 }} />}
        </div>
        <textarea
          value={desc}
          onChange={e => handleDescChange(e.target.value)}
          placeholder="Ej. Taller mecánico especializado en autos europeos, ofrecemos servicio de mantenimiento, frenos y suspensión en Monterrey..."
          rows={3}
          maxLength={600}
          className="w-full rounded-lg px-2.5 py-2 text-xs leading-relaxed outline-none resize-none"
          style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        />
        <span className="text-[10px] self-end" style={{ color: 'var(--c-text-4)' }}>{desc.length}/600</span>
      </div>
    </div>
  );
}
