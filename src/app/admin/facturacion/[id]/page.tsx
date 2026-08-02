export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Coins, FileText, User, Bot, Clock, ExternalLink } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AnnualContract } from '@/types/annual-contract';
import ContractDetailActions from './ContractDetailActions';

interface Props {
  params: Promise<{ id: string }>;
}

type OrgRow = {
  portal_email:         string;
  name:                 string | null;
  billing_model:        string | null;
  active_contract_id:   string | null;
  monthly_minutes_used: number | null;
  monthly_ops_used:     number | null;
  pool_reset_date:      string | null;
  overage_minutes:      number | null;
  overage_ops:          number | null;
};

type AgentRow = {
  id:            string;
  business_name: string;
  agent_name:    string | null;
  active:        boolean;
};

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Borrador',  color: '#facc15', bg: 'rgba(250,204,21,0.10)',  border: 'rgba(250,204,21,0.25)' },
  active:    { label: 'Activo',    color: '#4ade80', bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.25)' },
  expired:   { label: 'Expirado',  color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
  cancelled: { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
};

function formatMXN(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const raw = iso.length > 10 ? iso : iso + 'T00:00:00';
  return new Date(raw).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
  const end = new Date(iso + 'T23:59:59Z').getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: contract } = await supabase.from('annual_contracts').select('*').eq('id', id).maybeSingle();
  if (!contract) notFound();
  const c = contract as AnnualContract;

  const [{ data: orgRaw }, { data: agentsRaw }] = await Promise.all([
    supabase
      .from('organizations')
      .select('portal_email, name, billing_model, active_contract_id, monthly_minutes_used, monthly_ops_used, pool_reset_date, overage_minutes, overage_ops')
      .eq('portal_email', c.organization_email)
      .maybeSingle(),
    supabase
      .from('voice_agents')
      .select('id, business_name, agent_name, active')
      .eq('portal_email', c.organization_email)
      .neq('id', process.env.DEMO_AGENT_ID ?? '')
      .order('business_name'),
  ]);

  const org    = (orgRaw ?? null) as OrgRow | null;
  const agents = (agentsRaw ?? []) as AgentRow[];

  const status    = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft;
  const days      = daysUntil(c.end_date);
  const isActive  = c.status === 'active';
  const isCurrent = org?.active_contract_id === c.id;

  const minutesUsed     = isCurrent ? Number(org?.monthly_minutes_used ?? 0) : 0;
  const minutesPool     = Number(c.monthly_minutes_pool ?? 0);
  const minutesPct      = minutesPool > 0 ? Math.min((minutesUsed / minutesPool) * 100, 100) : 0;
  const minutesOverage  = isCurrent ? Number(org?.overage_minutes ?? 0) : 0;

  const opsUsed     = isCurrent ? Number(org?.monthly_ops_used ?? 0) : 0;
  const opsPool     = Number(c.monthly_ops_pool ?? 0);
  const opsPct      = opsPool > 0 ? Math.min((opsUsed / opsPool) * 100, 100) : 0;
  const opsOverage  = isCurrent ? Number(org?.overage_ops ?? 0) : 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <Link
        href="/admin/facturacion?tab=contratos"
        className="inline-flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--c-text-2)' }}
      >
        <ArrowLeft size={14} />
        Contratos anuales
      </Link>

      {/* Header */}
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold font-mono" style={{ color: 'var(--c-text)' }}>{c.contract_folio}</h1>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ color: status.color, background: status.bg, border: `1px solid ${status.border}` }}
              >
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-sm" style={{ color: 'var(--c-text-2)' }}>
              <User size={13} />
              <span>{org?.name ?? c.organization_email}</span>
              {org?.name && <span style={{ color: 'var(--c-text-3)' }}>· {c.organization_email}</span>}
            </div>
          </div>
          <ContractDetailActions contract={c} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2" style={{ borderTop: '1px solid var(--c-divider)' }}>
          <InfoBlock icon={<Calendar size={13} />} label="Vigencia">
            <div className="text-sm" style={{ color: 'var(--c-text)' }}>
              {formatDate(c.start_date)} → {formatDate(c.end_date)}
            </div>
            {isActive && days >= 0 && (
              <div className="text-xs mt-0.5" style={{ color: days <= 60 ? '#facc15' : 'var(--c-text-3)' }}>
                {days === 0 ? 'Último día' : `Faltan ${days} días`}
              </div>
            )}
          </InfoBlock>
          <InfoBlock icon={<Coins size={13} />} label="Monto anual">
            <div className="text-sm" style={{ color: 'var(--c-text)' }}>{formatMXN(Number(c.amount_mxn))}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>IVA incluido</div>
          </InfoBlock>
          <InfoBlock icon={<FileText size={13} />} label="CFDI">
            <div className="text-sm font-mono" style={{ color: 'var(--c-text)' }}>{c.invoice_folio ?? 'Sin folio'}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Estado SPEI: {c.payment_status}
            </div>
          </InfoBlock>
        </div>
      </div>

      {/* Consumo del ciclo */}
      <Section title="Consumo del ciclo actual" subtitle={isCurrent && org?.pool_reset_date ? `Se reinicia el ${formatDate(org.pool_reset_date)}` : 'Solo se muestra para el contrato activo de la organización.'}>
        {!isCurrent ? (
          <div className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            Este contrato no es el ciclo activo de la organización.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PoolBar
              label="Minutos"
              used={minutesUsed}
              pool={minutesPool}
              pct={minutesPct}
              overage={minutesOverage}
              unitLabel="min"
            />
            <PoolBar
              label="Tareas de oficina"
              used={opsUsed}
              pool={opsPool}
              pct={opsPct}
              overage={opsOverage}
              unitLabel="tareas"
            />
          </div>
        )}
      </Section>

      {/* Empleados activos */}
      <Section title="Empleados en la organización" subtitle={agents.length === 0 ? undefined : `${agents.length} empleado${agents.length === 1 ? '' : 's'}`}>
        {agents.length === 0 ? (
          <div className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            No hay empleados registrados en esta organización.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {agents.map(a => (
              <Link
                key={a.id}
                href={`/admin/agentes/${a.id}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-opacity hover:opacity-90"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
              >
                <Bot size={16} style={{ color: '#9B6DFF' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--c-text)' }}>{a.business_name}</div>
                  {a.agent_name && (
                    <div className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{a.agent_name}</div>
                  )}
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    color:      a.active ? '#4ade80' : 'var(--c-text-3)',
                    background: a.active ? 'rgba(74,222,128,0.10)' : 'var(--c-surface)',
                  }}
                >
                  {a.active ? 'Activo' : 'Pausado'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Documentos */}
      <Section title="Documentos">
        <div className="space-y-2">
          <DocRow label="CFDI (PDF)" href={c.invoice_pdf_url} />
          <DocRow label="Comprobante SPEI" href={null} placeholder="Aún no cargado" />
        </div>
      </Section>

      {/* Timeline */}
      <Section title="Timeline">
        <div className="space-y-2 text-sm" style={{ color: 'var(--c-text-2)' }}>
          <TimelineRow when={c.created_at} label={`Creado por ${c.created_by ?? 'admin'}`} />
          {c.payment_received_at && <TimelineRow when={c.payment_received_at} label="Pago SPEI registrado" />}
          {c.renewal_reminder_60d_sent && <TimelineRow when={null} label="Recordatorio 60 días enviado" />}
          {c.renewal_reminder_15d_sent && <TimelineRow when={null} label="Recordatorio 15 días enviado" />}
          {c.cancelled_at && (
            <TimelineRow when={c.cancelled_at} label={`Cancelado: ${c.cancelled_reason ?? 'sin razón'}`} />
          )}
        </div>
      </Section>

      {c.notes && (
        <Section title="Notas internas">
          <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{c.notes}</div>
        </Section>
      )}
    </div>
  );
}

// ── Presentational helpers ──────────────────────────────────────────────────────

function InfoBlock({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5 space-y-3"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
    >
      <div>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{title}</h2>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function PoolBar({
  label, used, pool, pct, overage, unitLabel,
}: {
  label: string; used: number; pool: number; pct: number; overage: number; unitLabel: string;
}) {
  const barColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#facc15' : '#6C3BFF';
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--c-text-2)' }}>
        <span>{label}</span>
        <span>{used.toLocaleString('es-MX')} / {pool.toLocaleString('es-MX')} {unitLabel}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      {overage > 0 && (
        <div className="text-xs mt-1" style={{ color: '#f87171' }}>
          Overage: {overage.toLocaleString('es-MX')} {unitLabel} arriba del pool.
        </div>
      )}
    </div>
  );
}

function DocRow({ label, href, placeholder }: { label: string; href: string | null; placeholder?: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2.5"
      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
    >
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text)' }}>
        <FileText size={14} style={{ color: 'var(--c-text-3)' }} />
        {label}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: '#9B6DFF' }}
        >
          <ExternalLink size={11} />
          Abrir
        </a>
      ) : (
        <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{placeholder ?? 'Sin archivo'}</span>
      )}
    </div>
  );
}

function TimelineRow({ when, label }: { when: string | null; label: string }) {
  return (
    <div className="flex items-start gap-2">
      <Clock size={12} className="mt-0.5" style={{ color: 'var(--c-text-3)' }} />
      <div>
        <div style={{ color: 'var(--c-text)' }}>{label}</div>
        {when && <div className="text-xs" style={{ color: 'var(--c-text-3)' }}>{new Date(when).toLocaleString('es-MX')}</div>}
      </div>
    </div>
  );
}
