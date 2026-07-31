'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Ban, PlayCircle, Save, Trash2, Eye } from 'lucide-react';
import type { FlagRow, FlagCounts } from '@/lib/feature-flags/types';

type Mode = 'create' | 'edit';

export function FlagEditor({ flag, mode }: { flag?: FlagRow; mode: Mode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [flagKey,     setFlagKey]     = useState(flag?.flag_key    ?? '');
  const [description, setDescription] = useState(flag?.description ?? '');
  const [rolloutPct,  setRolloutPct]  = useState(flag?.rollout_pct ?? 0);
  const [allowlist,   setAllowlist]   = useState((flag?.allowlist  ?? []).join('\n'));
  const [denylist,    setDenylist]    = useState((flag?.denylist   ?? []).join('\n'));
  const [defaultOn,   setDefaultOn]   = useState(flag?.default_on  ?? false);
  const [preview,     setPreview]     = useState<{ counts: FlagCounts; sample_on: string[]; sample_off: string[] } | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const parseList = (text: string): string[] =>
    text.split('\n').map(s => s.trim()).filter(Boolean);

  const buildPatch = () => ({
    flag_key:    flagKey.trim(),
    description: description.trim(),
    rollout_pct: rolloutPct,
    allowlist:   parseList(allowlist),
    denylist:    parseList(denylist),
    default_on:  defaultOn,
  });

  const onPreview = () => {
    if (!flagKey.trim()) { setError('Escribe un flag_key antes de hacer preview.'); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/flags/${encodeURIComponent(flagKey.trim())}/preview`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(buildPatch()),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error en preview'); return; }
      setPreview(json);
    });
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const url = mode === 'create'
        ? '/api/admin/flags'
        : `/api/admin/flags/${encodeURIComponent(flagKey)}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(buildPatch()),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error al guardar'); return; }
      if (mode === 'create') {
        router.push(`/admin/flags/${encodeURIComponent(flagKey.trim())}`);
      } else {
        router.refresh();
      }
    });
  };

  const onToggleKill = (unkill: boolean) => {
    startTransition(async () => {
      const res = await fetch(`/api/admin/flags/${encodeURIComponent(flagKey)}/kill`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ unkill }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error al cambiar killed'); return; }
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirm(`Borrar flag ${flagKey}. Esta acción se registra pero no se puede deshacer. ¿Continuar?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/flags/${encodeURIComponent(flagKey)}`, { method: 'DELETE' });
      if (res.ok) router.push('/admin/flags');
      else {
        const json = await res.json();
        setError(json.error ?? 'Error al borrar');
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg p-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>flag_key</label>
          <input
            type="text"
            value={flagKey}
            onChange={e => setFlagKey(e.target.value)}
            disabled={mode === 'edit'}
            placeholder="meerkat.nia.v2"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{
              background: mode === 'edit' ? 'var(--c-surface-2)' : 'var(--c-surface)',
              color:      'var(--c-text)',
              border:     '1px solid var(--c-border)',
            }}
          />
        </div>
        {mode === 'edit' && flag && (
          <div className="flex gap-2 pt-5">
            {flag.killed ? (
              <button
                onClick={() => onToggleKill(true)}
                disabled={pending}
                className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#16A34A' }}
              >
                <PlayCircle size={14} /> Un-kill
              </button>
            ) : (
              <button
                onClick={() => onToggleKill(false)}
                disabled={pending}
                className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626' }}
              >
                <Ban size={14} /> Kill
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={pending}
              className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
            >
              <Trash2 size={14} /> Borrar
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Descripción</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Rollout v2 de nia"
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          rollout_pct: <span className="font-mono">{rolloutPct}</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={rolloutPct}
          onChange={e => setRolloutPct(parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Allowlist (portal_email por línea)</label>
          <textarea
            value={allowlist}
            onChange={e => setAllowlist(e.target.value)}
            rows={5}
            placeholder={'nazre@gmail.com\nsergio@example.com'}
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Denylist (portal_email por línea)</label>
          <textarea
            value={denylist}
            onChange={e => setDenylist(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text)' }}>
        <input type="checkbox" checked={defaultOn} onChange={e => setDefaultOn(e.target.checked)} />
        default_on (usar cuando no hay org email, ej. webhook anónimo)
      </label>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)' }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onPreview}
          disabled={pending || !flagKey.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'var(--c-surface-2)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
        >
          <Eye size={14} /> Preview (dry-run)
        </button>
        <button
          onClick={onSave}
          disabled={pending}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <Save size={14} /> Guardar
        </button>
      </div>

      {preview && (
        <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
          <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
            Preview: {preview.counts.orgs_on} on, {preview.counts.orgs_off} off
          </div>
          <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>
            via hash: {preview.counts.orgs_via_hash}, via allowlist: {preview.counts.orgs_via_allowlist}, via denylist: {preview.counts.orgs_via_denylist}
          </div>
          {preview.sample_on.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>
              Sample on: <span className="font-mono">{preview.sample_on.join(', ')}</span>
            </div>
          )}
          {preview.sample_off.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>
              Sample off: <span className="font-mono">{preview.sample_off.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
