'use client';

import { useEffect, useState } from 'react';
import { Ban, Trash2, Plus } from 'lucide-react';
import { SectionHeader } from '@/components/portal-ui';

interface BlockedNumber {
  id:          string;
  phone_e164:  string;
  reason:      string | null;
  created_at:  string;
  created_by:  string | null;
}

const PHONE_INPUT_RE = /^[+\d\s()\-.]+$/;

function normalizeToE164Client(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return `+${digits}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('1'))  return `+${digits}`;
  return `+${digits}`;
}

export default function BlockedNumbersSection({ token }: { token: string }) {
  const [items,     setItems]     = useState<BlockedNumber[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phone,     setPhone]     = useState('');
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch(`/api/portal/${token}/blocked-numbers`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as BlockedNumber[];
      setItems(data);
    } catch (err) {
      console.error('[blocked-numbers] load failed:', err);
      setLoadError('No pudimos cargar la lista. Recarga la página.');
    }
  }

  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalized = phone ? normalizeToE164Client(phone) : '';
  const isValidPhone = phone === '' || /^\+[0-9]{10,15}$/.test(normalized);
  const canAdd = phone.length > 0 && isValidPhone && !saving;

  async function add() {
    if (!canAdd) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/portal/${token}/blocked-numbers`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: normalized, reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: (data as { error?: string }).error ?? 'No se pudo guardar.' });
        return;
      }
      setPhone('');
      setReason('');
      setMsg({ kind: 'ok', text: `${(data as BlockedNumber).phone_e164} bloqueado.` });
      await load();
    } catch (err) {
      console.error('[blocked-numbers] add failed:', err);
      setMsg({ kind: 'err', text: 'Error de red. Intenta de nuevo.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  async function remove(id: string, display: string) {
    if (!confirm(`¿Desbloquear ${display}? Volverá a poder llamar.`)) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/portal/${token}/blocked-numbers?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg({ kind: 'err', text: (data as { error?: string }).error ?? 'No se pudo quitar.' });
        return;
      }
      setMsg({ kind: 'ok', text: `${display} desbloqueado.` });
      await load();
    } catch (err) {
      console.error('[blocked-numbers] delete failed:', err);
      setMsg({ kind: 'err', text: 'Error de red. Intenta de nuevo.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  function fmtDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return iso.slice(0, 10);
    }
  }

  return (
    <section id="numeros-bloqueados" className="scroll-mt-6">
      <SectionHeader
        as="h2"
        title="Números bloqueados"
        tooltip="Los números en esta lista no podrán llamar a tu negocio. Útil para bots marcadores, spam o personas que ya no quieres atender."
        className="mb-2"
      />
      <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--c-text-3)' }}>
        Agrega números con lada completa (ej. +528112345678 o 8112345678 para México). El bloqueo aplica a todos los empleados de tu negocio.
      </p>

      <div
        className="p-4 rounded-xl mb-4"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <label htmlFor="block-phone" className="sr-only">Número a bloquear</label>
            <input
              id="block-phone"
              type="tel"
              placeholder="+528112345678"
              value={phone}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || PHONE_INPUT_RE.test(v)) setPhone(v);
              }}
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
              style={{
                borderColor: isValidPhone ? 'var(--c-border)' : '#DC2626',
                background:  'var(--c-surface-elevated)',
                color:       'var(--c-text)',
              }}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="block-reason" className="sr-only">Razón (opcional)</label>
            <input
              id="block-reason"
              type="text"
              placeholder="Razón (opcional): bot marcador, acoso..."
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 200))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{
                borderColor: 'var(--c-border)',
                background:  'var(--c-surface-elevated)',
                color:       'var(--c-text)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center justify-center gap-1.5"
            style={{
              background: '#6C3BFF',
              opacity:    canAdd ? 1 : 0.5,
              cursor:     canAdd ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={16} />
            {saving ? 'Guardando...' : 'Bloquear'}
          </button>
        </div>
        {!isValidPhone && (
          <p className="text-xs mt-2" style={{ color: '#DC2626' }}>
            Número inválido. Usa al menos 10 dígitos con lada.
          </p>
        )}
        {msg && (
          <p className="text-xs mt-2" style={{ color: msg.kind === 'ok' ? '#10B981' : '#DC2626' }}>
            {msg.text}
          </p>
        )}
      </div>

      {loadError && (
        <p className="text-sm" style={{ color: '#DC2626' }}>{loadError}</p>
      )}

      {items === null && !loadError && (
        <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Cargando…</p>
      )}

      {items !== null && items.length === 0 && (
        <div
          className="p-4 rounded-xl flex items-center gap-3"
          style={{ background: 'var(--c-surface)', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}
        >
          <Ban size={16} />
          <span className="text-sm">No tienes números bloqueados.</span>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <ul className="space-y-2">
          {items.map(it => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm" style={{ color: 'var(--c-text)' }}>{it.phone_e164}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                  {it.reason ? `${it.reason} · ` : ''}
                  Bloqueado el {fmtDate(it.created_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(it.id, it.phone_e164)}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                style={{
                  background: 'transparent',
                  border:     '1px solid var(--c-border)',
                  color:      'var(--c-text-2)',
                  cursor:     saving ? 'wait' : 'pointer',
                }}
              >
                <Trash2 size={14} />
                Desbloquear
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
