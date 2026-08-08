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
    try {
      await fetch(`/api/portal/${token}/org`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.trim() }),
      });
      setOrg(prev => prev ? { ...prev, name: draft.trim() } : prev);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() { setEditing(false); setDraft(''); }

  const planLabel: Record<string, string> = {
    starter: 'Starter', crecimiento: 'Crecimiento', pro: 'Pro', agencia: 'Agencia',
  };

  const memberSince = org?.created_at
    ? new Date(org.created_at).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div id="organizacion" className="flex flex-col gap-5">

      {/* Content row: name/email/date + logo */}
      <div className="flex items-start gap-5 flex-wrap sm:flex-nowrap">

        {/* Left: org info */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
              Organización
            </span>
            <InfoTooltip text="Nombre e identidad de tu cuenta. El logo aparece en el encabezado del portal y en los documentos generados." />
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                maxLength={100}
                className="flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              />
              <button onClick={save} disabled={saving}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                <Check size={14} />
              </button>
              <button onClick={cancel}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[#F0EDF9]"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight truncate" style={{ color: '#1A0A3B' }}>
                {org?.name ?? '—'}
              </span>
              <button onClick={startEdit}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[#FAFAFB]"
                style={{ color: '#9B8FB5', flexShrink: 0 }}>
                <Pencil size={12} />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            <p className="text-[12px] truncate" style={{ color: '#6B6480' }}>{portalEmail}</p>
            {memberSince && (
              <span className="text-[11px]" style={{ color: '#9B8FB5' }}>
                Miembro desde {memberSince}
              </span>
            )}
          </div>
        </div>

        {/* Right: logo */}
        <div className="flex-shrink-0 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Logo</span>
            <InfoTooltip text={"Aparece en el encabezado de tu portal de clientes y en todos los documentos generados.\nFormatos: PNG, JPG, SVG o WebP. Máx. 2 MB."} />
          </div>
          <LogoUploader token={token} currentUrl={logoUrl} />
        </div>

      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #F0EDF9' }} />

      {/* Business description — full width */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Descripción</span>
          <InfoTooltip text={"Describe brevemente a qué se dedica tu organización y tus servicios principales.\nTu empleado usará esto para generar bases de conocimiento más precisas."} />
          {descSaved && (
            <span className="inline-flex items-center gap-1 text-[11px] ml-auto" style={{ color: '#22c55e' }}>
              <Check size={11} /> Guardado
            </span>
          )}
        </div>
        <textarea
          value={desc}
          onChange={e => handleDescChange(e.target.value)}
          placeholder="Ej. Taller mecánico especializado en autos europeos, ofrecemos servicio de mantenimiento, frenos y suspensión en Monterrey..."
          rows={3}
          maxLength={600}
          className="w-full rounded-lg px-3 py-2.5 text-[13px] leading-relaxed outline-none resize-none"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
        />
        <span className="text-[11px] self-end tabular-nums" style={{ color: '#9B8FB5' }}>{desc.length}/600</span>
      </div>
    </div>
  );
}
