'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, RotateCw, XCircle, AlertCircle, Loader2, PlayCircle, X } from 'lucide-react';
import type { AnnualContract } from '@/types/annual-contract';

type ModalKind = null | 'edit' | 'renew' | 'cancel';

export default function ContractDetailActions({ contract }: { contract: AnnualContract }) {
  const [open, setOpen] = useState<ModalKind>(null);
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {contract.status === 'draft' && (
        <ActionButton
          onClick={async () => {
            try {
              const res = await fetch(`/api/admin/annual-contracts/${contract.id}/activate`, { method: 'POST' });
              const json = await res.json();
              if (!res.ok) throw new Error(json.message ?? json.error ?? 'Error activando el contrato');
              toast.success('Contrato activado');
              router.refresh();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
          variant="primary"
          icon={<PlayCircle size={13} />}
          label="Activar"
        />
      )}
      <ActionButton onClick={() => setOpen('edit')}   variant="secondary" icon={<Pencil size={13} />}   label="Editar" />
      <ActionButton onClick={() => setOpen('renew')}  variant="secondary" icon={<RotateCw size={13} />} label="Renovar por otro año" />
      {(contract.status === 'active' || contract.status === 'draft') && (
        <ActionButton onClick={() => setOpen('cancel')} variant="danger" icon={<XCircle size={13} />} label="Cancelar" />
      )}

      {open === 'edit'   && <EditModal   contract={contract} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); router.refresh(); }} />}
      {open === 'renew'  && <RenewModal  contract={contract} onClose={() => setOpen(null)} onCreated={id => { setOpen(null); router.push(`/admin/facturacion/${id}`); }} />}
      {open === 'cancel' && <CancelModal contract={contract} onClose={() => setOpen(null)} onCancelled={() => { setOpen(null); router.refresh(); }} />}
    </div>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────────

function ActionButton({
  onClick, icon, label, variant,
}: {
  onClick:   () => void | Promise<void>;
  icon:      React.ReactNode;
  label:     string;
  variant:   'primary' | 'secondary' | 'danger';
}) {
  const style = variant === 'primary'
    ? { background: '#6C3BFF', color: '#FAFBFF' }
    : variant === 'danger'
      ? { background: 'rgba(248,113,113,0.10)', color: '#f87171', border: '1px solid rgba(248,113,113,0.30)' }
      : { background: 'var(--c-surface-2)', color: 'var(--c-text)', border: '1px solid var(--c-border)' };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
      style={style}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Modal shell ─────────────────────────────────────────────────────────────────

function ModalShell({
  title, subtitle, onClose, children, footer,
}: {
  title:    string;
  subtitle?: string;
  onClose:  () => void;
  children: React.ReactNode;
  footer:   React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl my-8"
        style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border-2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--c-divider)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>{title}</h2>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:opacity-80" style={{ color: 'var(--c-text-2)' }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--c-divider)' }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>{children}</label>;
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
      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
      style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
    />
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{ background: 'rgba(248,113,113,0.10)', color: '#f87171', border: '1px solid rgba(248,113,113,0.30)' }}
    >
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ── Edit modal ──────────────────────────────────────────────────────────────────

function EditModal({ contract, onClose, onSaved }: { contract: AnnualContract; onClose: () => void; onSaved: () => void }) {
  const [endDate, setEndDate]         = useState(contract.end_date);
  const [amountMxn, setAmountMxn]     = useState(String(contract.amount_mxn ?? ''));
  const [minutes, setMinutes]         = useState(String(contract.monthly_minutes_pool ?? ''));
  const [ops, setOps]                 = useState(String(contract.monthly_ops_pool ?? ''));
  const [invoiceFolio, setInvoiceFolio] = useState(contract.invoice_folio ?? '');
  const [invoicePdfUrl, setInvoicePdfUrl] = useState(contract.invoice_pdf_url ?? '');
  const [notes, setNotes]             = useState(contract.notes ?? '');
  const [error, setError]             = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/annual-contracts/${contract.id}`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          end_date:             endDate,
          amount_mxn:           Number(amountMxn),
          monthly_minutes_pool: Number(minutes),
          monthly_ops_pool:     Number(ops),
          invoice_folio:        invoiceFolio.trim() || null,
          invoice_pdf_url:      invoicePdfUrl.trim() || null,
          notes:                notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Error guardando');
      toast.success('Contrato actualizado');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Editar contrato"
      subtitle="Los cambios de pool aplican al siguiente ciclo de la organización."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg text-sm transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}>
            Cancelar
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: '#6C3BFF', color: '#FAFBFF' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Guardar
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Vigencia: fin</Label>
          <Input type="date" value={endDate} onChange={setEndDate} />
        </div>
        <div>
          <Label>Monto MXN</Label>
          <Input type="number" value={amountMxn} onChange={setAmountMxn} placeholder="180000" />
        </div>
        <div>
          <Label>Pool mensual: minutos</Label>
          <Input type="number" value={minutes} onChange={setMinutes} placeholder="12000" />
        </div>
        <div>
          <Label>Pool mensual: tareas</Label>
          <Input type="number" value={ops} onChange={setOps} placeholder="500" />
        </div>
        <div>
          <Label>Folio CFDI</Label>
          <Input value={invoiceFolio} onChange={setInvoiceFolio} placeholder="A-4523" />
        </div>
        <div>
          <Label>URL del PDF CFDI</Label>
          <Input value={invoicePdfUrl} onChange={setInvoicePdfUrl} placeholder="https://…" />
        </div>
      </div>

      <div>
        <Label>Notas</Label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
        />
      </div>
    </ModalShell>
  );
}

// ── Renew modal ─────────────────────────────────────────────────────────────────

function addYear(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function RenewModal({ contract, onClose, onCreated }: { contract: AnnualContract; onClose: () => void; onCreated: (newId: string) => void }) {
  const [folio, setFolio]           = useState('');
  const [startDate, setStartDate]   = useState(contract.end_date);
  const [endDate, setEndDate]       = useState(addYear(contract.end_date));
  const [amountMxn, setAmountMxn]   = useState(String(contract.amount_mxn ?? ''));
  const [minutes, setMinutes]       = useState(String(contract.monthly_minutes_pool ?? ''));
  const [ops, setOps]               = useState(String(contract.monthly_ops_pool ?? ''));
  const [error, setError]           = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  async function submit() {
    setError(null);
    if (!folio.trim()) { setError('Ingresa el folio del nuevo contrato.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/annual-contracts/${contract.id}/renew`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          contract_folio:       folio.trim(),
          start_date:           startDate,
          end_date:             endDate,
          amount_mxn:           Number(amountMxn),
          monthly_minutes_pool: Number(minutes),
          monthly_ops_pool:     Number(ops),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Error creando renovación');
      toast.success('Renovación creada como borrador');
      onCreated(json.contract.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Renovar por otro año"
      subtitle="Se crea un nuevo contrato en borrador con el mismo pool y monto. Ajusta lo que necesites antes de activarlo."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg text-sm transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: '#6C3BFF', color: '#FAFBFF' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Crear renovación
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />

      <div>
        <Label>Folio del nuevo contrato</Label>
        <Input value={folio} onChange={setFolio} placeholder="CTR-2027-0001" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Nueva vigencia: inicio</Label>
          <Input type="date" value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <Label>Nueva vigencia: fin</Label>
          <Input type="date" value={endDate} onChange={setEndDate} />
        </div>
        <div>
          <Label>Monto MXN</Label>
          <Input type="number" value={amountMxn} onChange={setAmountMxn} />
        </div>
        <div>
          <Label>Pool mensual: minutos</Label>
          <Input type="number" value={minutes} onChange={setMinutes} />
        </div>
        <div>
          <Label>Pool mensual: tareas</Label>
          <Input type="number" value={ops} onChange={setOps} />
        </div>
      </div>
    </ModalShell>
  );
}

// ── Cancel modal ────────────────────────────────────────────────────────────────

function CancelModal({ contract, onClose, onCancelled }: { contract: AnnualContract; onClose: () => void; onCancelled: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (reason.trim().length < 5) { setError('La razón debe tener al menos 5 caracteres.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/annual-contracts/${contract.id}/cancel`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Error cancelando');
      toast.success('Contrato cancelado');
      onCancelled();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Cancelar contrato"
      subtitle="Si el contrato estaba activo, la organización regresa a facturación Stripe. Esta acción se registra."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg text-sm transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}>
            Regresar
          </button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: '#DC2626', color: '#FAFBFF' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Cancelar contrato
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div>
        <Label>Razón de cancelación (obligatoria)</Label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="Cliente pidió cancelar por reestructura interna…"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
        />
      </div>
    </ModalShell>
  );
}
