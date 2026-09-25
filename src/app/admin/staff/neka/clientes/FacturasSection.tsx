'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Upload, Download, Loader2, CheckCircle2, Clock, Receipt } from 'lucide-react';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';

interface Factura {
  id:                    string;
  tipo:                  'cfdi_emitido' | 'rep_emitido' | string;
  cfdi_uuid:             string | null;
  related_uuid:          string | null;
  ciclo_key:             string | null;
  monto:                 number | null;
  subtotal:              number | null;
  iva:                   number | null;
  moneda:                string | null;
  metodo_pago_cfdi:      'PUE' | 'PPD' | null;
  forma_pago_cfdi:       string | null;
  uso_cfdi:              string | null;
  xml_path:              string | null;
  pdf_path:              string | null;
  paid_at:               string | null;
  rep_reminder_at:       string | null;
  rep_reminder_sent_at:  string | null;
  created_at:            string;
}

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortUuid(u: string | null): string {
  if (!u) return '—';
  return u.slice(0, 8).toUpperCase() + '…';
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface FacturasSectionProps {
  clienteId: string;
}

export function FacturasSection({ clienteId }: FacturasSectionProps) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const xmlInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [cicloKey, setCicloKey] = useState('');
  const [uploading, setUp]      = useState(false);

  const [repFor, setRepFor] = useState<Factura | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Error al cargar');
      else setFacturas(data.facturas ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- `refresh` dispara setLoading; patrón "fetch on mount + manual refresh" no calza con la regla React 19 sin migrar a SWR/TanStack Query.
  useEffect(() => { refresh(); }, [refresh]);

  const upload = async () => {
    const xml = xmlInputRef.current?.files?.[0];
    const pdf = pdfInputRef.current?.files?.[0];
    if (!xml) { setError('Selecciona el XML de la factura'); return; }
    if (!pdf) { setError('Selecciona el PDF de la factura'); return; }

    setError(null); setUp(true);
    try {
      const form = new FormData();
      form.append('xml', xml);
      form.append('pdf', pdf);
      if (cicloKey.trim()) form.append('cicloKey', cicloKey.trim());

      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al subir'); return; }

      if (xmlInputRef.current) xmlInputRef.current.value = '';
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      setCicloKey('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUp(false);
    }
  };

  const marcarPagada = async (f: Factura) => {
    const input = prompt('Fecha de pago (YYYY-MM-DD). Deja vacío para hoy.');
    if (input === null) return;
    const paidAt = input.trim() ? new Date(input.trim() + 'T12:00:00Z').toISOString() : undefined;
    try {
      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas/${f.id}/marcar-pagada`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAt }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error'); return; }
      await refresh();
      if (data.repReminderAt) {
        alert(`Marcada como pagada. Neka te recuerda del REP el ${fmtDate(data.repReminderAt)}.`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const uploadRepFiles = async (f: Factura, xmlFile: File, pdfFile: File) => {
    setError(null);
    try {
      const form = new FormData();
      form.append('xml', xmlFile);
      form.append('pdf', pdfFile);
      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas/${f.id}/rep`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error ?? 'Error al subir REP' };
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };

  const download = async (f: Factura, kind: 'xml' | 'pdf') => {
    try {
      const res  = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/facturas/${f.id}/url?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo generar enlace'); return; }
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ingresos    = facturas.filter(f => f.tipo === 'cfdi_emitido');
  const repsByRelated = new Map<string, Factura>();
  facturas.filter(f => f.tipo === 'rep_emitido' && f.related_uuid).forEach(f => {
    repsByRelated.set(f.related_uuid!, f);
  });

  return (
    <div className="mt-6">
      <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
        Facturas emitidas y REPs
      </label>
      <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
        Repositorio de CFDIs emitidos a este cliente. Sube el XML+PDF cuando timbres en el portal. Cuando el cliente pague, marca la factura para que Neka te recuerde emitir el REP.
      </p>

      <div className="space-y-2 mb-4">
        {loading && (
          <div className="rounded-lg p-3 text-center text-xs" style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)' }}>
            <Loader2 size={13} className="inline animate-spin mr-1.5" />
            Cargando…
          </div>
        )}
        {!loading && ingresos.length === 0 && (
          <div className="rounded-lg p-4 text-center text-xs" style={{ background: 'var(--c-surface)', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}>
            Aún no hay facturas emitidas para este cliente.
          </div>
        )}
        {ingresos.map(f => {
          const rep = f.cfdi_uuid ? repsByRelated.get(f.cfdi_uuid) : undefined;
          const isPPD = f.metodo_pago_cfdi === 'PPD';
          const paid  = !!f.paid_at;
          return (
            <div key={f.id} className="rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-3 p-3">
                <FileText size={16} style={{ color: '#6C3BFF' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono" style={{ color: 'var(--c-text)' }}>{shortUuid(f.cfdi_uuid)}</span>
                    {f.metodo_pago_cfdi && (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>
                        {f.metodo_pago_cfdi}
                      </span>
                    )}
                    {f.ciclo_key && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--c-input-bg)', color: 'var(--c-text-3)' }}>
                        {f.ciclo_key}
                      </span>
                    )}
                    {paid ? (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.1)', color: '#15803d' }}>
                        <CheckCircle2 size={10} /> Pagada {fmtDate(f.paid_at)}
                      </span>
                    ) : isPPD ? (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1" style={{ background: 'rgba(234,179,8,0.1)', color: '#a16207' }}>
                        <Clock size={10} /> Sin pago
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                    ${money(f.monto)} {f.moneda ?? 'MXN'} · emitida {fmtDate(f.created_at)}
                    {f.rep_reminder_at && !rep && (
                      <> · REP recordatorio {fmtDate(f.rep_reminder_at)}</>
                    )}
                  </p>
                </div>
                <button onClick={() => download(f, 'xml')} className="p-2 rounded-lg hover:opacity-70" style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }} title="Descargar XML">
                  <Download size={13} />
                </button>
                <button onClick={() => download(f, 'pdf')} className="p-2 rounded-lg hover:opacity-70" style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }} title="Descargar PDF">
                  <FileText size={13} />
                </button>
                {isPPD && !paid && (
                  <button
                    onClick={() => marcarPagada(f)}
                    className="px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase hover:opacity-70"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#15803d' }}
                    title="Marcar pagada"
                  >
                    Marcar pagada
                  </button>
                )}
                {isPPD && paid && !rep && (
                  <button
                    onClick={() => setRepFor(f)}
                    className="px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase hover:opacity-70 inline-flex items-center gap-1"
                    style={{ background: 'rgba(161,98,7,0.1)', color: '#a16207' }}
                    title="Subir REP emitido"
                  >
                    <Receipt size={11} /> Subir REP
                  </button>
                )}
              </div>
              {rep && (
                <div className="border-t px-3 py-2 flex items-center gap-3" style={{ borderColor: 'var(--c-border)', background: 'rgba(161,98,7,0.03)' }}>
                  <Receipt size={13} style={{ color: '#a16207' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono" style={{ color: 'var(--c-text-2)' }}>REP {shortUuid(rep.cfdi_uuid)}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#15803d' }}>
                        ✓ Emitido
                      </span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{fmtDate(rep.created_at)}</p>
                  </div>
                  <button onClick={() => download(rep, 'xml')} className="p-1.5 rounded hover:opacity-70" style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }} title="XML del REP">
                    <Download size={11} />
                  </button>
                  <button onClick={() => download(rep, 'pdf')} className="p-1.5 rounded hover:opacity-70" style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }} title="PDF del REP">
                    <FileText size={11} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl flex flex-col gap-3" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '16px 18px' }}>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>Subir factura ya timbrada</p>
          <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
            Neka parsea el XML para extraer UUID, montos, método de pago y uso CFDI.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="XML del CFDI">
            <OficinaModal.FileInput inputRef={xmlInputRef} accept="application/xml,text/xml,.xml" placeholder="Selecciona XML…" />
          </OficinaModal.Field>
          <OficinaModal.Field label="PDF del CFDI">
            <OficinaModal.FileInput inputRef={pdfInputRef} accept="application/pdf,.pdf" placeholder="Selecciona PDF…" />
          </OficinaModal.Field>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <OficinaModal.Field label="Ciclo" hint="opcional">
              <OficinaModal.Input
                value={cicloKey}
                onChange={e => setCicloKey(e.target.value)}
                placeholder='2026-09'
                maxLength={20}
              />
            </OficinaModal.Field>
          </div>
          <button
            onClick={upload}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all shrink-0"
            style={{
              padding:    '9px 18px',
              height:     40,
              background: uploading ? '#B9A8E8' : '#6C3BFF',
              color:      '#ffffff',
              boxShadow:  uploading ? 'none' : '0 2px 8px rgba(108,59,255,0.32)',
              cursor:     uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Registrar factura
          </button>
        </div>
      </div>

      {error && <div className="mt-3"><OficinaModal.Alert tone="danger">{error}</OficinaModal.Alert></div>}

      {repFor && (
        <RepUploadModal
          factura={repFor}
          onClose={() => setRepFor(null)}
          onSubmit={async (xml, pdf) => {
            const result = await uploadRepFiles(repFor, xml, pdf);
            if (result.ok) setRepFor(null);
            return result;
          }}
        />
      )}
    </div>
  );
}

interface RepUploadModalProps {
  factura:  Factura;
  onClose:  () => void;
  onSubmit: (xml: File, pdf: File) => Promise<{ ok: boolean; error?: string }>;
}

function RepUploadModal({ factura, onClose, onSubmit }: RepUploadModalProps) {
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!xmlFile) { setErr('Selecciona el XML del REP'); return; }
    if (!pdfFile) { setErr('Selecciona el PDF del REP'); return; }
    setErr(null); setSubmitting(true);
    const result = await onSubmit(xmlFile, pdfFile);
    setSubmitting(false);
    if (!result.ok) setErr(result.error ?? 'Error al subir REP');
  };

  return (
    <OficinaModal
      open
      onClose={onClose}
      size="md"
      eyebrow="Complemento de pago"
      title="Subir REP timbrado"
      description={`REP para la factura ${shortUuid(factura.cfdi_uuid)} — sube el XML y el PDF ya timbrados en el portal del PAC.`}
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose} disabled={submitting}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={submit} loading={submitting}>
            Subir REP
          </OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Info card de la factura padre */}
        <div className="flex items-center gap-3 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #F0EBFA', padding: '12px 14px' }}>
          <div className="flex items-center justify-center rounded-lg" style={{ background: 'rgba(108,59,255,0.10)', width: 36, height: 36 }}>
            <Receipt size={16} style={{ color: '#6C3BFF' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: '#9B6DFF' }}>Factura de origen</p>
            <p className="text-[14px] font-mono truncate" style={{ color: '#1A0A3B' }}>{shortUuid(factura.cfdi_uuid)}</p>
          </div>
        </div>

        <OficinaModal.Field label="XML del REP">
          <OficinaModal.FileInput accept="application/xml,text/xml,.xml" placeholder="Selecciona el XML del complemento…" onChange={setXmlFile} />
        </OficinaModal.Field>

        <OficinaModal.Field label="PDF del REP">
          <OficinaModal.FileInput accept="application/pdf,.pdf" placeholder="Selecciona el PDF del complemento…" onChange={setPdfFile} />
        </OficinaModal.Field>

        {err && <OficinaModal.Alert tone="danger">{err}</OficinaModal.Alert>}
      </div>
    </OficinaModal>
  );
}
