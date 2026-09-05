'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clock, AlertCircle, Loader2, Mail, FileText } from 'lucide-react';

interface PagoPendiente {
  id: string;
  cliente_id: string | null;
  related_uuid: string;
  monto: number;
  sent_to_email: string | null;
  created_at: string;
  meta: {
    fecha_pago?: string;
    num_operacion?: string;
    forma_pago?: string;
    motivos?: string[];
    cliente_razon_social?: string | null;
    resolved_at?: string;
    resolved_action?: string;
    rep_uuid?: string;
  };
  cliente: { razon_social: string; rfc: string; correo_facturacion: string } | null;
}

export default function PagosPendientesPage() {
  const [pendientes, setPendientes] = useState<PagoPendiente[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [approving, setApproving]   = useState<string | null>(null);
  const [feedback, setFeedback]     = useState<{ id: string; type: 'ok' | 'err'; text: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/staff/nala/pagos-pendientes');
      const data = await res.json();
      if (data.error) setError(data.error);
      else setPendientes(data.pendientes ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, []);

  const approve = async (p: PagoPendiente) => {
    if (approving) return;
    if (!confirm(`Verificaste en tu banco que llegó el pago de $${p.monto.toFixed(2)} de ${p.cliente?.razon_social ?? 'este cliente'}?`)) return;
    setApproving(p.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/staff/nala/pagos-pendientes/${p.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.error) setFeedback({ id: p.id, type: 'err', text: data.error });
      else {
        setFeedback({ id: p.id, type: 'ok', text: `REP ${data.rep_uuid} timbrado y enviado a ${data.sent_to}` });
        refresh();
      }
    } catch (e) {
      setFeedback({ id: p.id, type: 'err', text: (e as Error).message });
    } finally {
      setApproving(null);
    }
  };

  // Separar pendientes reales de los ya resueltos (por si se muestran ambos)
  const abiertos = pendientes.filter(p => !p.meta.resolved_at);
  const resueltos = pendientes.filter(p => p.meta.resolved_at);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href="/admin/staff/nala"
        className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--c-text-3)' }}
      >
        <ArrowLeft size={12} />
        Volver a config
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
          Pagos pendientes de verificación
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
          Nala recibió comprobante SPEI que no cumplió reglas de auto-aprobación. Verifica en tu banco y aprueba para que Nala timbre el REP.
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

      {!loading && abiertos.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <Check size={32} className="mx-auto mb-2" style={{ color: '#15803d' }} />
          <p className="text-sm mb-1" style={{ color: 'var(--c-text)' }}>Todo al día</p>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>No hay pagos esperando tu aprobación.</p>
        </div>
      )}

      <div className="space-y-3">
        {abiertos.map(p => (
          <article
            key={p.id}
            className="rounded-xl p-4"
            style={{ background: 'var(--c-surface)', border: '1px solid rgba(245,158,11,0.4)' }}
          >
            <div className="flex items-start gap-3 mb-3">
              <Clock size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#b45309' }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                  {p.cliente?.razon_social ?? p.meta.cliente_razon_social ?? 'Cliente no identificado'}
                  {' · '}
                  <span style={{ color: '#b45309' }}>${p.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                  <code className="font-mono">{p.related_uuid}</code>
                  {p.cliente?.rfc && ` · ${p.cliente.rfc}`}
                </p>
                {p.meta.fecha_pago && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                    SPEI: {p.meta.fecha_pago}
                    {p.meta.num_operacion && ` · Op ${p.meta.num_operacion}`}
                  </p>
                )}
                {p.sent_to_email && (
                  <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
                    <Mail size={10} /> {p.sent_to_email}
                  </p>
                )}
              </div>
              <button
                onClick={() => approve(p)}
                disabled={approving === p.id}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex-shrink-0"
                style={{ background: '#15803d' }}
              >
                {approving === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Aprobar y timbrar REP
              </button>
            </div>

            {p.meta.motivos && p.meta.motivos.length > 0 && (
              <div className="rounded-lg p-2.5 text-[11px]"
                   style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--c-text-2)' }}>
                <p className="font-semibold mb-1" style={{ color: '#b45309' }}>Por qué no se auto-aprobó:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  {p.meta.motivos.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}

            {feedback?.id === p.id && (
              <div className="rounded-lg p-2 mt-2 text-xs flex items-start gap-2"
                   style={{
                     background: feedback.type === 'ok' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                     border: `1px solid ${feedback.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                     color: feedback.type === 'ok' ? '#15803d' : '#b91c1c',
                   }}>
                {feedback.type === 'ok' ? <Check size={12} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
                <span>{feedback.text}</span>
              </div>
            )}
          </article>
        ))}
      </div>

      {resueltos.length > 0 && (
        <>
          <h2 className="text-xs font-bold uppercase tracking-widest mt-8 mb-3" style={{ color: 'var(--c-text-4)' }}>
            Resueltos ({resueltos.length})
          </h2>
          <div className="space-y-2">
            {resueltos.map(p => (
              <div key={p.id} className="rounded-lg p-3 text-xs flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.02)', color: 'var(--c-text-3)' }}>
                <FileText size={11} />
                <span>{p.cliente?.razon_social ?? '(sin cliente)'} · ${p.monto.toFixed(2)} · aprobado {p.meta.resolved_at?.slice(0, 10)} · REP {p.meta.rep_uuid?.slice(-8)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
