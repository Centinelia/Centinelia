'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, X, Edit3, Loader2, AlertCircle, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

interface PendingItem {
  id:             string;
  email_id:       string;
  image_index:    number | null;
  reason:         string;
  extracted:      Record<string, unknown>;
  candidates:     { top?: string; segundo?: string } | null;
  status:         string;
  created_at:     string;
  image_url:      string | null;
  image_filename: string | null;
  email: {
    from_address: string | null;
    subject:      string | null;
    received_at:  string | null;
  } | null;
}

export default function PendientesPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [items,   setItems]   = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null); // id en curso

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/billing/pendientes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function doAction(id: string, action: 'approve' | 'reject' | 'edit', corrections?: Record<string, unknown>) {
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/portal/${token}/billing/pendientes/${id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, corrections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Optimistic remove — el pending desaparece de la lista pending.
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      alert(`No se pudo ${action}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href={`/portal/${token}/oficina/facturas`}
        className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--c-text-3)' }}
      >
        <ArrowLeft size={12} />
        Volver a Facturas
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
          Pendientes de revisión
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
          Notitas que Nala procesó pero necesita tu confirmación antes de timbrar. Aprueba si está todo bien; corrige si hay algún dato mal leído; rechaza si no debe timbrarse.
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
          <Loader2 size={12} className="animate-spin" /> Cargando…
        </div>
      )}

      {error && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2 mb-4"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl p-8 text-center"
             style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <CheckCircle2 size={32} style={{ color: '#22c55e', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
            Sin pendientes. Todas las notitas están al día.
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
            Cuando Nala procese un correo y no pueda timbrar automáticamente, aparecerá aquí para tu revisión.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map(item => (
          <PendingCard
            key={item.id}
            item={item}
            busy={busy === item.id}
            onApprove={() => doAction(item.id, 'approve')}
            onReject={() => doAction(item.id, 'reject')}
            onEdit={(corrections) => doAction(item.id, 'edit', corrections)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function PendingCard({
  item, busy, onApprove, onReject, onEdit,
}: {
  item:      PendingItem;
  busy:      boolean;
  onApprove: () => void;
  onReject:  () => void;
  onEdit:    (corrections: Record<string, unknown>) => void;
}) {
  const [showEdit, setShowEdit]         = useState(false);
  const [editCliente, setEditCliente]   = useState<string>((item.extracted.cliente_texto as string) ?? '');
  const [editRfc, setEditRfc]           = useState<string>((item.extracted.rfc as string) ?? '');
  const [editTotal, setEditTotal]       = useState<string>(
    typeof item.extracted.total === 'number' ? String(item.extracted.total) : ''
  );

  const productos = Array.isArray(item.extracted.productos)
    ? item.extracted.productos as Array<Record<string, unknown>>
    : [];
  const folio   = item.extracted.folio_remision ?? '?';
  const fecha   = item.extracted.fecha_venta ?? item.extracted.fecha_nota ?? '';

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-0">
        {/* Imagen */}
        <div className="p-3" style={{ background: 'rgba(0,0,0,0.02)', borderRight: '1px solid var(--c-border)' }}>
          {item.image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={item.image_url} alt={item.image_filename ?? 'notita'}
                 className="w-full rounded-lg object-contain"
                 style={{ maxHeight: 260 }} />
          ) : (
            <div className="w-full h-40 rounded-lg flex items-center justify-center"
                 style={{ background: 'rgba(0,0,0,0.04)', color: '#6B6480' }}>
              <ImageIcon size={24} />
            </div>
          )}
          <p className="text-[10px] mt-2 truncate" style={{ color: 'var(--c-text-4)' }}>
            {item.image_filename ?? '(sin nombre)'}
          </p>
        </div>

        {/* Datos */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-bold"
                    style={{ color: '#f59e0b' }}>
                Requiere revisión
              </span>
              <p className="text-sm mt-0.5" style={{ color: 'var(--c-text)' }}>
                {item.reason}
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
                De: {item.email?.from_address ?? '—'} · Recibido {new Date(item.created_at).toLocaleString('es-MX')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
            <Field label="Folio remisión">{String(folio)}</Field>
            <Field label="Fecha">{String(fecha)}</Field>
            <Field label="Cliente leído (Nala)" wide>
              {String(item.extracted.cliente_texto_raw ?? item.extracted.cliente_texto ?? '—')}
            </Field>
            {item.candidates?.top && (
              <Field label="Candidato sugerido" wide>{String(item.candidates.top)}</Field>
            )}
            {typeof item.extracted.total === 'number' && (
              <Field label="Total">${String(item.extracted.total)}</Field>
            )}
            {typeof item.extracted.metodo_pago === 'string' && (
              <Field label="Método">{item.extracted.metodo_pago}</Field>
            )}
          </div>

          {productos.length > 0 && (
            <details className="mb-4">
              <summary className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--c-text-2)' }}>
                {productos.length} producto{productos.length === 1 ? '' : 's'} extraído{productos.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1 text-[11px]" style={{ color: 'var(--c-text-2)' }}>
                {productos.map((p, i) => (
                  <li key={i}>· {String(p.descripcion ?? p.nombre ?? '?')} — {String(p.cantidad ?? p.cant ?? '?')} × ${String(p.precio_unitario ?? p.p_unit ?? '?')}</li>
                ))}
              </ul>
            </details>
          )}

          {showEdit && (
            <div className="rounded-lg p-3 mb-4 space-y-2 text-xs"
                 style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.2)' }}>
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-4)' }}>Cliente (corrección)</span>
                <input value={editCliente} onChange={e => setEditCliente(e.target.value)}
                       className="mt-1 w-full px-2 py-1.5 rounded text-xs"
                       style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-4)' }}>RFC correcto</span>
                <input value={editRfc} onChange={e => setEditRfc(e.target.value)}
                       placeholder="XAXX010101000"
                       className="mt-1 w-full px-2 py-1.5 rounded text-xs font-mono"
                       style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-4)' }}>Total ($)</span>
                <input value={editTotal} onChange={e => setEditTotal(e.target.value)}
                       type="number" inputMode="decimal"
                       className="mt-1 w-full px-2 py-1.5 rounded text-xs"
                       style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
              </label>
              <p className="text-[10px] pt-1" style={{ color: 'var(--c-text-3)' }}>
                Nala reintentará con estas correcciones. Los productos se toman de la lectura original — si necesitas cambiarlos, mejor rechaza esta y súbela manual desde Facturación.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: '#22c55e', color: '#fff' }}
            >
              <Check size={12} /> Aprobar y timbrar
            </button>
            <button
              onClick={() => showEdit
                ? onEdit({ cliente_corregido: editCliente, rfc_corregido: editRfc, total_corregido: editTotal ? Number(editTotal) : null })
                : setShowEdit(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: '#6C3BFF', color: '#fff' }}
            >
              <Edit3 size={12} /> {showEdit ? 'Guardar corrección y timbrar' : 'Corregir'}
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'transparent', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.35)' }}
            >
              <X size={12} /> Rechazar
            </button>
            {busy && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--c-text-3)' }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <span className="block text-[10px] uppercase tracking-widest font-bold mb-0.5"
            style={{ color: 'var(--c-text-4)' }}>
        {label}
      </span>
      <span style={{ color: 'var(--c-text)' }}>{children}</span>
    </div>
  );
}
