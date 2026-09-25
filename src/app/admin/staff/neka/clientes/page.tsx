'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, User, Calendar, Pause, Play, Edit3, Loader2, FileText, Mail, MapPin, Repeat, TrendingUp } from 'lucide-react';
import type { ClienteDoc } from '@/lib/billing/centinelia-clientes';
import { DocsSection } from './DocsSection';
import { FacturasSection } from './FacturasSection';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';
import { useApi } from '@/lib/hooks/useApi';
import { formatMoney } from '@/lib/format/money';

interface Cliente {
  id: string;
  rfc: string;
  razon_social: string;
  cp: string;
  regimen_fiscal: string;
  uso_cfdi_default: string;
  correo_facturacion: string;
  nombre_contacto: string | null;
  activo: boolean;
  conceptos: Array<{ descripcion: string; valor_unitario: number; cantidad?: number; con_iva?: boolean }>;
  periodicidad: 'monthly' | 'biweekly' | 'weekly' | 'annual';
  fecha_proxima_facturacion: string;
  fecha_ultima_facturacion: string | null;
  metodo_pago_default: 'PUE' | 'PPD';
  forma_pago_default: string;
  notas: string | null;
  docs: ClienteDoc[];
}

const PERIODICIDAD_LABEL: Record<Cliente['periodicidad'], string> = {
  monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal', annual: 'Anual',
};

function conceptoTotal(cc: Cliente['conceptos'][number]): number {
  return cc.valor_unitario * (cc.cantidad ?? 1) * (cc.con_iva !== false ? 1.16 : 1);
}

function clienteTotal(c: Cliente): number {
  return c.conceptos.reduce((s, cc) => s + conceptoTotal(cc), 0);
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClientesNekaPage() {
  const { data: clientes = [], error: fetchError, isLoading: loading, mutate } =
    useApi<Cliente[]>('/api/admin/staff/neka/clientes', { key: 'clientes' });

  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<Cliente | null>(null);

  const togglePause = async (c: Cliente) => {
    await fetch(`/api/admin/staff/neka/clientes/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !c.activo }),
    });
    mutate();
  };

  const activos      = clientes.filter(c => c.activo).length;
  const pausados     = clientes.filter(c => !c.activo).length;
  const totalMensual = clientes
    .filter(c => c.activo && c.periodicidad === 'monthly')
    .reduce((sum, c) => sum + clienteTotal(c), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        href="/admin/staff/neka"
        className="inline-flex items-center gap-1.5 text-[12px] mb-4 transition-colors"
        style={{ color: '#6B6480' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#6C3BFF'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6B6480'; }}
      >
        <ArrowLeft size={12} />
        Volver a config
      </Link>

      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Staff · Neka</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Clientes de Centinelia
          </h1>
          <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
            Catálogo que Neka usa para facturar proactivamente. Cada cliente activo se factura automáticamente en su fecha próxima.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            padding:    '10px 18px',
            background: '#6C3BFF',
            color:      '#ffffff',
            boxShadow:  '0 2px 8px rgba(108,59,255,0.32)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#5A2FDB'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#6C3BFF'; }}
        >
          <Plus size={14} />
          Nuevo cliente
        </button>
      </header>

      {/* Stats — solo cuando ya cargaron y hay clientes */}
      {!loading && clientes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <StatCard label="Clientes activos" value={String(activos)} accent="#6C3BFF" icon={<User size={16} />} />
          <StatCard label="Pausados" value={String(pausados)} accent="#9B8FB5" icon={<Pause size={16} />} />
          <StatCard label="Ingreso mensual estimado" value={formatMoney(totalMensual)} accent="#22C55E" icon={<TrendingUp size={16} />} hint="con IVA · mensualidad" />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-[13px]" style={{ color: '#6B6480' }}>
          <Loader2 size={14} className="animate-spin" style={{ color: '#6C3BFF' }} /> Cargando clientes…
        </div>
      )}

      {fetchError && (
        <div className="mb-4">
          <OficinaModal.Alert tone="danger">{fetchError.message}</OficinaModal.Alert>
        </div>
      )}

      {!loading && clientes.length === 0 && (
        <div className="rounded-2xl text-center flex flex-col items-center gap-3" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '48px 24px' }}>
          <div className="flex items-center justify-center rounded-2xl" style={{ background: 'rgba(108,59,255,0.08)', width: 56, height: 56 }}>
            <User size={24} style={{ color: '#6C3BFF' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>Aún no hay clientes registrados</p>
            <p className="text-[13px] mt-1 max-w-md" style={{ color: '#6B6480' }}>
              Agrega el primero para que Neka empiece a facturar automáticamente en el ciclo definido.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {clientes.map(c => (
          <ClienteCard
            key={c.id}
            cliente={c}
            onEdit={() => { setEditing(c); setShowForm(true); }}
            onTogglePause={() => togglePause(c)}
          />
        ))}
      </div>

      {showForm && (
        <ClienteForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); mutate(); }}
        />
      )}
    </div>
  );
}

// ─── Stats Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, icon, hint }: { label: string; value: string; accent: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl transition-all" style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-lg" style={{ background: `${accent}1A`, color: accent, width: 28, height: 28 }}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>{label}</p>
      </div>
      <p className="text-[24px] font-bold tracking-tight leading-none" style={{ color: '#1A0A3B' }}>{value}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>{hint}</p>}
    </div>
  );
}

// ─── Cliente Card ────────────────────────────────────────────────────────────

function ClienteCard({ cliente: c, onEdit, onTogglePause }: { cliente: Cliente; onEdit: () => void; onTogglePause: () => void }) {
  const total = clienteTotal(c);
  const conceptosPreview = c.conceptos.slice(0, 2);
  const remaining = c.conceptos.length - conceptosPreview.length;

  return (
    <article
      className="rounded-2xl transition-all group"
      style={{
        background: '#ffffff',
        border:     `1px solid ${c.activo ? '#E8E3F5' : '#F0EBFA'}`,
        boxShadow:  c.activo ? '0 1px 3px rgba(15,5,34,0.04)' : 'none',
        opacity:    c.activo ? 1 : 0.72,
      }}
    >
      {/* Header row: razón social + RFC + estado + actions */}
      <div className="flex items-start gap-3" style={{ padding: '16px 18px 12px' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[16px] font-bold tracking-tight truncate" style={{ color: '#1A0A3B' }}>
              {c.razon_social}
            </h3>
            <code
              className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(108,59,255,0.10)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.20)' }}
            >
              {c.rfc}
            </code>
            {!c.activo && (
              <span className="text-[10px] uppercase font-bold tracking-[0.1em] px-2 py-0.5 rounded-md" style={{ background: '#F0EBFA', color: '#6B6480' }}>
                Pausado
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1.5 flex items-center gap-1.5" style={{ color: '#6B6480' }}>
            <Repeat size={11} style={{ color: '#9B6DFF' }} />
            {PERIODICIDAD_LABEL[c.periodicidad]} · {c.conceptos.length} concepto{c.conceptos.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onTogglePause}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: 34, height: 34,
              background: c.activo ? 'rgba(180,83,9,0.08)' : 'rgba(34,197,94,0.10)',
              color:      c.activo ? '#B45309' : '#15803D',
              border:     `1px solid ${c.activo ? 'rgba(180,83,9,0.16)' : 'rgba(34,197,94,0.20)'}`,
            }}
            title={c.activo ? 'Pausar cliente' : 'Reactivar cliente'}
          >
            {c.activo ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={onEdit}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: 34, height: 34,
              background: 'rgba(108,59,255,0.08)',
              color:      '#6C3BFF',
              border:     '1px solid rgba(108,59,255,0.16)',
            }}
            title="Editar"
          >
            <Edit3 size={14} />
          </button>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ padding: '0 18px 14px' }}>
        <MetaItem icon={<Mail size={12} />} label="Facturación" value={c.correo_facturacion} />
        <MetaItem icon={<MapPin size={12} />} label="Código postal" value={c.cp} />
        <MetaItem icon={<Calendar size={12} />} label="Próxima factura" value={fmtFecha(c.fecha_proxima_facturacion)} accent />
      </div>

      {/* Footer: conceptos + total + docs */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap"
        style={{ padding: '12px 18px', background: '#FAFAFB', borderTop: '1px solid #F0EBFA', borderRadius: '0 0 16px 16px' }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: '#9B6DFF' }}>Conceptos</p>
          <p className="text-[13px] truncate" style={{ color: '#1A0A3B' }}>
            {conceptosPreview.map(cc => (
              <span key={cc.descripcion}>
                {cc.descripcion} <span style={{ color: '#6B6480' }}>{formatMoney(cc.valor_unitario)}</span>
              </span>
            )).reduce((acc, item, idx) => idx === 0 ? [item] : [...acc, <span key={`sep-${idx}`} style={{ color: '#9B8FB5' }}> · </span>, item], [] as React.ReactNode[])}
            {remaining > 0 && <span className="ml-2" style={{ color: '#9B8FB5' }}>+{remaining} más</span>}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {c.docs && c.docs.length > 0 && (
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#6B6480' }}>
              <FileText size={12} style={{ color: '#9B6DFF' }} />
              {c.docs.length} doc{c.docs.length !== 1 ? 's' : ''}
            </div>
          )}
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#9B6DFF' }}>Total ciclo</p>
            <p className="text-[15px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>{formatMoney(total)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function MetaItem({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="flex items-center justify-center rounded-md mt-0.5" style={{ background: accent ? 'rgba(108,59,255,0.10)' : '#F5F0FF', color: accent ? '#6C3BFF' : '#9B6DFF', width: 22, height: 22, flexShrink: 0 }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#9B8FB5' }}>{label}</p>
        <p className="text-[12.5px] truncate" style={{ color: accent ? '#6C3BFF' : '#1A0A3B', fontWeight: accent ? 600 : 500 }}>{value}</p>
      </div>
    </div>
  );
}

interface FormState {
  rfc: string;
  razon_social: string;
  cp: string;
  regimen_fiscal: string;
  uso_cfdi_default: string;
  correo_facturacion: string;
  nombre_contacto: string;
  activo: boolean;
  periodicidad: Cliente['periodicidad'];
  fecha_proxima_facturacion: string;
  metodo_pago_default: 'PUE' | 'PPD';
  forma_pago_default: string;
  notas: string;
  conceptos: Array<{ descripcion: string; valor_unitario: string; cantidad: string; con_iva: boolean }>;
}

function toFormState(c: Cliente | null): FormState {
  return {
    rfc:                       c?.rfc                       ?? '',
    razon_social:              c?.razon_social              ?? '',
    cp:                        c?.cp                        ?? '',
    regimen_fiscal:            c?.regimen_fiscal            ?? '601',
    uso_cfdi_default:          c?.uso_cfdi_default          ?? 'G03',
    correo_facturacion:        c?.correo_facturacion        ?? '',
    nombre_contacto:           c?.nombre_contacto           ?? '',
    activo:                    c?.activo                    ?? true,
    periodicidad:              c?.periodicidad              ?? 'monthly',
    fecha_proxima_facturacion: c?.fecha_proxima_facturacion ?? new Date().toISOString().slice(0, 10),
    metodo_pago_default:       c?.metodo_pago_default       ?? 'PPD',
    forma_pago_default:        c?.forma_pago_default        ?? '99',
    notas:                     c?.notas                     ?? '',
    conceptos: c?.conceptos?.length
      ? c.conceptos.map(cc => ({
          descripcion:    cc.descripcion,
          valor_unitario: String(cc.valor_unitario),
          cantidad:       String(cc.cantidad ?? 1),
          con_iva:        cc.con_iva !== false,
        }))
      : [{ descripcion: '', valor_unitario: '', cantidad: '1', con_iva: true }],
  };
}

function ClienteForm({ initial, onClose, onSaved }: { initial: Cliente | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF]           = useState<FormState>(toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const body = {
        rfc: f.rfc.toUpperCase().trim(),
        razon_social: f.razon_social.trim(),
        cp: f.cp.trim(),
        regimen_fiscal: f.regimen_fiscal,
        uso_cfdi_default: f.uso_cfdi_default,
        correo_facturacion: f.correo_facturacion.trim(),
        nombre_contacto: f.nombre_contacto.trim() || null,
        activo: f.activo,
        periodicidad: f.periodicidad,
        fecha_proxima_facturacion: f.fecha_proxima_facturacion,
        metodo_pago_default: f.metodo_pago_default,
        forma_pago_default: f.forma_pago_default,
        notas: f.notas.trim() || null,
        conceptos: f.conceptos
          .filter(c => c.descripcion.trim() && c.valor_unitario)
          .map(c => ({
            descripcion:    c.descripcion.trim(),
            valor_unitario: Number(c.valor_unitario),
            cantidad:       Number(c.cantidad) || 1,
            con_iva:        c.con_iva,
          })),
      };
      const url = initial ? `/api/admin/staff/neka/clientes/${initial.id}` : '/api/admin/staff/neka/clientes';
      const res = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const addConcepto = () => setF({ ...f, conceptos: [...f.conceptos, { descripcion: '', valor_unitario: '', cantidad: '1', con_iva: true }] });
  const rmConcepto = (i: number) => setF({ ...f, conceptos: f.conceptos.filter((_, idx) => idx !== i) });
  const updateConcepto = (i: number, patch: Partial<FormState['conceptos'][number]>) =>
    setF({ ...f, conceptos: f.conceptos.map((c, idx) => idx === i ? { ...c, ...patch } : c) });

  return (
    <OficinaModal
      open
      onClose={onClose}
      size="xl"
      eyebrow={initial ? 'Editar cliente' : 'Nuevo cliente'}
      title={initial?.razon_social || (initial ? 'Editar cliente' : 'Nuevo cliente de facturación')}
      description={initial
        ? 'Actualiza datos fiscales, conceptos, documentos o facturas emitidas.'
        : 'Neka usará estos datos para timbrar automáticamente cada ciclo.'}
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose} disabled={saving}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={submit} loading={saving}>
            {initial ? 'Guardar cambios' : 'Crear cliente'}
          </OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Sección: Datos fiscales */}
        <section className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="RFC">
            <OficinaModal.Input value={f.rfc} onChange={e => setF({ ...f, rfc: e.target.value })} placeholder="TEN010518AL3" style={{ textTransform: 'uppercase' }} />
          </OficinaModal.Field>
          <OficinaModal.Field label="CP">
            <OficinaModal.Input value={f.cp} onChange={e => setF({ ...f, cp: e.target.value })} placeholder="66470" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Razón social" className="col-span-2">
            <OficinaModal.Input value={f.razon_social} onChange={e => setF({ ...f, razon_social: e.target.value })} placeholder="TORTILLAS ESTRELLA DEL NORTE" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Régimen fiscal">
            <OficinaModal.Input value={f.regimen_fiscal} onChange={e => setF({ ...f, regimen_fiscal: e.target.value })} placeholder="601" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Uso CFDI">
            <OficinaModal.Input value={f.uso_cfdi_default} onChange={e => setF({ ...f, uso_cfdi_default: e.target.value })} placeholder="G03" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Correo de facturación" className="col-span-2">
            <OficinaModal.Input value={f.correo_facturacion} onChange={e => setF({ ...f, correo_facturacion: e.target.value })} placeholder="facturacion@cliente.com" type="email" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Contacto" hint="opcional" className="col-span-2">
            <OficinaModal.Input value={f.nombre_contacto} onChange={e => setF({ ...f, nombre_contacto: e.target.value })} placeholder="Nombre del contable" />
          </OficinaModal.Field>
        </section>

        {/* Divider */}
        <div style={{ height: 1, background: '#F0EBFA' }} />

        {/* Sección: Ciclo y pagos */}
        <section className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="Periodicidad">
            <OficinaModal.Select value={f.periodicidad} onChange={e => setF({ ...f, periodicidad: e.target.value as Cliente['periodicidad'] })}>
              <option value="monthly">Mensual</option>
              <option value="biweekly">Quincenal</option>
              <option value="weekly">Semanal</option>
              <option value="annual">Anual</option>
            </OficinaModal.Select>
          </OficinaModal.Field>
          <OficinaModal.Field label="Próxima facturación">
            <OficinaModal.Input type="date" value={f.fecha_proxima_facturacion} onChange={e => setF({ ...f, fecha_proxima_facturacion: e.target.value })} />
          </OficinaModal.Field>
          <OficinaModal.Field label="Método de pago">
            <OficinaModal.Select value={f.metodo_pago_default} onChange={e => setF({ ...f, metodo_pago_default: e.target.value as 'PUE' | 'PPD' })}>
              <option value="PPD">PPD (parcialidades / diferido)</option>
              <option value="PUE">PUE (una sola exhibición)</option>
            </OficinaModal.Select>
          </OficinaModal.Field>
          <OficinaModal.Field label="Forma de pago" hint="clave SAT">
            <OficinaModal.Input value={f.forma_pago_default} onChange={e => setF({ ...f, forma_pago_default: e.target.value })} placeholder="99" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Notas internas" hint="opcional" className="col-span-2">
            <OficinaModal.Textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} rows={2} />
          </OficinaModal.Field>
        </section>

        {/* Divider */}
        <div style={{ height: 1, background: '#F0EBFA' }} />

        {/* Sección: Conceptos */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>
              Conceptos a facturar cada ciclo
            </label>
            <button
              type="button"
              onClick={addConcepto}
              className="text-[12px] font-semibold transition-colors"
              style={{ color: '#6C3BFF' }}
            >
              + Agregar concepto
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {f.conceptos.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #F0EBFA', padding: '10px' }}>
                <div className="col-span-6"><OficinaModal.Input value={c.descripcion} onChange={e => updateConcepto(i, { descripcion: e.target.value })} placeholder="Descripción" /></div>
                <div className="col-span-2"><OficinaModal.MoneyInput value={c.valor_unitario} onChange={v => updateConcepto(i, { valor_unitario: v })} placeholder="0.00" /></div>
                <div className="col-span-1"><OficinaModal.Input value={c.cantidad} onChange={e => updateConcepto(i, { cantidad: e.target.value })} placeholder="Cant" type="number" /></div>
                <label className="flex items-center gap-1.5 text-[12px] col-span-2 cursor-pointer" style={{ color: '#6B6480' }}>
                  <input type="checkbox" checked={c.con_iva} onChange={e => updateConcepto(i, { con_iva: e.target.checked })} style={{ accentColor: '#6C3BFF' }} />
                  IVA
                </label>
                <button
                  type="button"
                  onClick={() => rmConcepto(i)}
                  className="col-span-1 flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
                  style={{ background: 'rgba(239,68,68,0.06)', color: '#B91C1C', width: 32, height: 32, marginLeft: 'auto' }}
                  aria-label="Quitar concepto"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Activo toggle */}
        <label className="flex items-center gap-2 text-[13px] cursor-pointer rounded-xl" style={{ padding: '10px 14px', background: '#FAFAFB', border: '1px solid #F0EBFA', color: '#1A0A3B' }}>
          <input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} style={{ accentColor: '#6C3BFF' }} />
          Cliente activo <span style={{ color: '#6B6480' }}>· Neka factura automáticamente en su fecha</span>
        </label>

        {initial && (
          <>
            <div style={{ height: 1, background: '#F0EBFA' }} />
            <DocsSection
              clienteId={initial.id}
              initialDocs={initial.docs ?? []}
              onClienteUpdated={onSaved}
            />
            <div style={{ height: 1, background: '#F0EBFA' }} />
            <FacturasSection clienteId={initial.id} />
          </>
        )}

        {error && <OficinaModal.Alert tone="danger">{error}</OficinaModal.Alert>}
      </div>
    </OficinaModal>
  );
}
