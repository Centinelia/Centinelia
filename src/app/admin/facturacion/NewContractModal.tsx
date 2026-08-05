'use client';

import { useEffect, useRef, useState } from 'react';
import { X, AlertCircle, Loader2, Check } from 'lucide-react';
import type { CreateAnnualContractInput } from '@/types/annual-contract';

interface OrgOption {
  portal_email:       string;
  name:               string | null;
  billing_model:      string | null;
  active_contract_id: string | null;
}

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

export default function NewContractModal({ onClose, onCreated }: Props) {
  const [org, setOrg]                       = useState<OrgOption | null>(null);
  const [contractFolio, setContractFolio]   = useState('');
  const [startDate, setStartDate]           = useState('');
  const [endDate, setEndDate]               = useState('');
  const [amountMxn, setAmountMxn]           = useState('');
  const [monthlyMinutes, setMonthlyMinutes] = useState('');
  const [monthlyOps, setMonthlyOps]         = useState('');
  const [includedEmployees, setIncludedEmployees] = useState('');
  const [invoiceFolio, setInvoiceFolio]     = useState('');
  const [paymentReceivedAt, setPaymentReceivedAt] = useState('');
  const [notes, setNotes]                   = useState('');

  const [error, setError]                   = useState<string | null>(null);
  const [submitting, setSubmitting]         = useState<'draft' | 'activate' | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function submit(activate: boolean) {
    setError(null);
    if (!org?.portal_email) { setError('Selecciona un cliente.'); return; }
    if (!contractFolio.trim()) { setError('Ingresa el folio del contrato.'); return; }
    if (!startDate || !endDate) { setError('Ingresa la vigencia completa.'); return; }
    if (endDate <= startDate) { setError('La fecha de fin debe ser posterior al inicio.'); return; }
    const amount = Number(amountMxn);
    if (!Number.isFinite(amount) || amount <= 0) { setError('El monto MXN debe ser un número mayor a cero.'); return; }
    const minutesPool = Number(monthlyMinutes);
    if (!Number.isFinite(minutesPool) || minutesPool < 0) { setError('El pool mensual de minutos debe ser un número.'); return; }
    const opsPool = Number(monthlyOps);
    if (!Number.isFinite(opsPool) || opsPool < 0) { setError('El pool mensual de tareas debe ser un número.'); return; }

    const body: CreateAnnualContractInput = {
      organization_email:   org.portal_email,
      contract_folio:       contractFolio.trim(),
      start_date:           startDate,
      end_date:             endDate,
      amount_mxn:           amount,
      monthly_minutes_pool: minutesPool,
      monthly_ops_pool:     opsPool,
      included_employees:   includedEmployees ? Number(includedEmployees) : null,
      invoice_folio:        invoiceFolio.trim() || null,
      payment_received_at:  paymentReceivedAt ? new Date(paymentReceivedAt + 'T12:00:00').toISOString() : null,
      notes:                notes.trim() || null,
      activate,
    };

    setSubmitting(activate ? 'activate' : 'draft');
    try {
      const res = await fetch('/api/admin/annual-contracts', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? 'Error creando el contrato');
      }
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(null);
    }
  }

  const hasStripeConflict = org?.billing_model === 'stripe';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/50"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-xl my-8 bg-white overflow-hidden"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>Nuevo contrato anual</h2>
            <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
              Guarda como borrador para editar después, o actívalo para arrancar el pool prepagado.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={!!submitting}
            className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
            style={{ color: '#6B7280' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}
            >
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label>Cliente</Label>
            <OrgAutocomplete value={org} onChange={setOrg} />
            {hasStripeConflict && (
              <p className="text-[12px] mt-1.5" style={{ color: '#B45309' }}>
                Este cliente hoy paga por Stripe. Al activar el contrato dejará de cobrarse por tarjeta.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Folio del contrato</Label>
              <Input value={contractFolio} onChange={setContractFolio} placeholder="CTR-2026-0001" />
            </div>
            <div>
              <Label>Folio CFDI (opcional)</Label>
              <Input value={invoiceFolio} onChange={setInvoiceFolio} placeholder="A-4523" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Vigencia: inicio</Label>
              <Input type="date" value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <Label>Vigencia: fin</Label>
              <Input type="date" value={endDate} onChange={setEndDate} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Monto MXN (IVA incluido)</Label>
              <Input type="number" value={amountMxn} onChange={setAmountMxn} placeholder="180000" />
            </div>
            <div>
              <Label>Empleados incluidos (informativo)</Label>
              <Input type="number" value={includedEmployees} onChange={setIncludedEmployees} placeholder="3" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Pool mensual: minutos</Label>
              <Input type="number" value={monthlyMinutes} onChange={setMonthlyMinutes} placeholder="12000" />
            </div>
            <div>
              <Label>Pool mensual: tareas</Label>
              <Input type="number" value={monthlyOps} onChange={setMonthlyOps} placeholder="500" />
            </div>
          </div>

          <div>
            <Label>Fecha SPEI recibido (opcional)</Label>
            <Input type="date" value={paymentReceivedAt} onChange={setPaymentReceivedAt} />
          </div>

          <div>
            <Label>Notas internas (opcional)</Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Detalles de la negociación, contacto interno, etc."
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9FAFB' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={!!submitting}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50 disabled:opacity-40"
            style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={!!submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50 disabled:opacity-40"
            style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
          >
            {submitting === 'draft' ? <Loader2 size={13} className="animate-spin" /> : null}
            Guardar como borrador
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={!!submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: '#6C3BFF', color: '#FFFFFF' }}
          >
            {submitting === 'activate' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Activar
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>{children}</label>;
}

function Input({
  value, onChange, type = 'text', placeholder,
}: {
  value:       string;
  onChange:    (v: string) => void;
  type?:       string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
      style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
    />
  );
}

// ── Org autocomplete ────────────────────────────────────────────────────────────

function OrgAutocomplete({ value, onChange }: { value: OrgOption | null; onChange: (o: OrgOption | null) => void }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/organizations?search=${encodeURIComponent(q)}`, { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) setOptions(json.organizations ?? []);
        else setOptions([]);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const label = value ? (value.name ? `${value.name} · ${value.portal_email}` : value.portal_email) : '';

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={open ? query : label}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        placeholder="Buscar por correo o nombre del cliente..."
        className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
      />
      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg overflow-hidden max-h-72 overflow-y-auto bg-white"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
        >
          {loading && (
            <div className="px-3 py-2 text-[12px]" style={{ color: '#6B7280' }}>Buscando...</div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-[12px]" style={{ color: '#6B7280' }}>Sin resultados.</div>
          )}
          {!loading && options.map((o, i) => (
            <button
              key={o.portal_email}
              type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className="w-full flex flex-col gap-0.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-gray-50"
              style={{
                background: value?.portal_email === o.portal_email ? '#F5F3FF' : 'transparent',
                borderTop: i > 0 ? '1px solid #F3F4F6' : undefined,
              }}
            >
              <span className="font-medium" style={{ color: '#111827' }}>{o.name ?? o.portal_email}</span>
              <span className="text-[12px]" style={{ color: '#6B7280' }}>
                {o.portal_email}
                {o.billing_model && o.billing_model !== 'stripe' ? ` · ${o.billing_model}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
