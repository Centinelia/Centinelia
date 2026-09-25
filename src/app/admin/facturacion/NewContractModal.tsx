'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { CreateAnnualContractInput } from '@/types/annual-contract';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(null);
    }
  }

  const hasStripeConflict = org?.billing_model === 'stripe';

  return (
    <OficinaModal
      open
      onClose={() => !submitting && onClose()}
      size="xl"
      dismissOnOverlay={!submitting}
      eyebrow="Contrato anual"
      title="Nuevo contrato anual"
      description="Guarda como borrador para editar después, o actívalo para arrancar el pool prepagado."
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose} disabled={!!submitting}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.SecondaryAction onClick={() => submit(false)} disabled={!!submitting} loading={submitting === 'draft'}>
            Guardar como borrador
          </OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={() => submit(true)} disabled={!!submitting} loading={submitting === 'activate'}>
            <Check size={13} />
            Activar contrato
          </OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <OficinaModal.Alert tone="danger">{error}</OficinaModal.Alert>}

        <OficinaModal.Field label="Cliente">
          <OrgAutocomplete value={org} onChange={setOrg} />
        </OficinaModal.Field>
        {hasStripeConflict && (
          <OficinaModal.Alert tone="warning">
            Este cliente hoy paga por Stripe. Al activar el contrato dejará de cobrarse por tarjeta.
          </OficinaModal.Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OficinaModal.Field label="Folio del contrato">
            <OficinaModal.Input value={contractFolio} onChange={e => setContractFolio(e.target.value)} placeholder="CTR-2026-0001" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Folio CFDI" hint="opcional">
            <OficinaModal.Input value={invoiceFolio} onChange={e => setInvoiceFolio(e.target.value)} placeholder="A-4523" />
          </OficinaModal.Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OficinaModal.Field label="Vigencia: inicio">
            <OficinaModal.Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </OficinaModal.Field>
          <OficinaModal.Field label="Vigencia: fin">
            <OficinaModal.Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </OficinaModal.Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OficinaModal.Field label="Monto MXN" hint="IVA incluido">
            <OficinaModal.Input type="number" value={amountMxn} onChange={e => setAmountMxn(e.target.value)} placeholder="180000" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Empleados incluidos" hint="informativo">
            <OficinaModal.Input type="number" value={includedEmployees} onChange={e => setIncludedEmployees(e.target.value)} placeholder="3" />
          </OficinaModal.Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OficinaModal.Field label="Pool mensual: minutos">
            <OficinaModal.Input type="number" value={monthlyMinutes} onChange={e => setMonthlyMinutes(e.target.value)} placeholder="12000" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Pool mensual: tareas">
            <OficinaModal.Input type="number" value={monthlyOps} onChange={e => setMonthlyOps(e.target.value)} placeholder="500" />
          </OficinaModal.Field>
        </div>

        <OficinaModal.Field label="Fecha SPEI recibido" hint="opcional">
          <OficinaModal.Input type="date" value={paymentReceivedAt} onChange={e => setPaymentReceivedAt(e.target.value)} />
        </OficinaModal.Field>

        <OficinaModal.Field label="Notas internas" hint="opcional">
          <OficinaModal.Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Detalles de la negociación, contacto interno, etc."
          />
        </OficinaModal.Field>
      </div>
    </OficinaModal>
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <OficinaModal.Input
        type="text"
        value={open ? query : label}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        placeholder="Buscar por correo o nombre del cliente…"
      />
      {open && (
        <div
          className="absolute z-50 top-full mt-2 left-0 right-0 rounded-xl overflow-hidden max-h-72 overflow-y-auto"
          style={{
            background: '#ffffff',
            border:     '1px solid #E8E3F5',
            boxShadow:  '0 12px 32px rgba(15,5,34,0.12), 0 4px 12px rgba(15,5,34,0.08)',
          }}
        >
          {loading && (
            <div className="px-4 py-3 text-[13px] flex items-center gap-2" style={{ color: '#6B6480' }}>
              <Loader2 size={13} className="animate-spin" style={{ color: '#6C3BFF' }} />
              Buscando…
            </div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-4 py-3 text-[13px]" style={{ color: '#9B8FB5' }}>Sin resultados.</div>
          )}
          {!loading && options.map((o, i) => {
            const selected = value?.portal_email === o.portal_email;
            return (
              <button
                key={o.portal_email}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className="w-full flex flex-col gap-0.5 px-4 py-2.5 text-left text-[13px] transition-colors"
                style={{
                  background: selected ? '#F5F0FF' : 'transparent',
                  borderTop:  i > 0 ? '1px solid #F0EBFA' : undefined,
                }}
                onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#FAFAFB'; }}
                onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span className="font-semibold" style={{ color: '#1A0A3B' }}>{o.name ?? o.portal_email}</span>
                <span className="text-[12px]" style={{ color: '#6B6480' }}>
                  {o.portal_email}
                  {o.billing_model && o.billing_model !== 'stripe' ? ` · ${o.billing_model}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
