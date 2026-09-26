import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';
import { getCentineliaFiscalConfig, isFacturamaSandbox } from '@/lib/invoicing/facturama/centinelia-preset';
import { ArrowLeft, FileText, ShieldCheck, KeyRound, Zap, MessageCircle, MailCheck, Users, Clock, Receipt } from 'lucide-react';

export const dynamic = 'force-dynamic';

const NEKA = MEERKAT_ROLES.find(r => r.id === 'neka')!;

function envStatusCentinelia() {
  const cfg = getCentineliaFiscalConfig();
  const sandbox = isFacturamaSandbox();
  const facturamaOk = !!(process.env.FACTURAMA_USER && process.env.FACTURAMA_PASSWORD);
  const resendOk = !!process.env.RESEND_API_KEY;
  return { cfg, sandbox, facturamaOk, resendOk };
}

export default async function NekaConfigPage() {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/staff/neka');
  }

  const env = envStatusCentinelia();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href="/admin/staff"
        className="inline-flex items-center gap-1.5 text-[12px] mb-6 transition-colors"
        style={{ color: '#6B6480' }}
      >
        <ArrowLeft size={12} />
        Volver a Staff interno
      </Link>

      <header className="flex items-start gap-4 mb-8 flex-wrap">
        {NEKA.imagen && (
          <span
            style={{
              width: 72, height: 72, borderRadius: '50%',
              overflow: 'hidden', display: 'inline-block',
              flexShrink: 0,
              background: '#ffffff',
              border: `2px solid ${NEKA.color}33`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={NEKA.imagen}
              alt={NEKA.nombre}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: NEKA.avatarPosition ?? 'center 3%',
                transform: NEKA.avatarScale && NEKA.avatarScale !== 1 ? `scale(${NEKA.avatarScale})` : 'none',
                transformOrigin: NEKA.avatarPosition ?? 'center 3%',
              }}
            />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Staff · {NEKA.rol}</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Configuración de {NEKA.nombre}
          </h1>
          <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>{NEKA.descripcion}</p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Link
            href="/admin/staff/neka/chat"
            className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
            style={{
              padding:    '10px 18px',
              background: '#6C3BFF',
              color:      '#ffffff',
              boxShadow:  '0 2px 8px rgba(108,59,255,0.32)',
            }}
          >
            <MessageCircle size={14} />
            Hablar con Neka
          </Link>
          <NekaNavLink href="/admin/staff/neka/clientes"        icon={<Users     size={13} />}>Clientes</NekaNavLink>
          <NekaNavLink href="/admin/staff/neka/facturas-recibidas" icon={<Receipt   size={13} />}>Facturas recibidas</NekaNavLink>
          <NekaNavLink href="/admin/staff/neka/pagos-pendientes"   icon={<Clock     size={13} />}>Pagos pendientes</NekaNavLink>
          <NekaNavLink href="/admin/staff/neka/test-email"         icon={<MailCheck size={13} />}>Probar correo</NekaNavLink>
        </div>
      </header>

      {/* Datos fiscales del emisor */}
      <section
        className="mb-5 rounded-2xl p-5"
        style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <FileText size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
              Datos fiscales del emisor
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              Neka usa estos datos para timbrar CFDIs a nombre de Centinelia. Overridables vía env vars <code>CENTINELIA_*</code>.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <FiscalField label="RFC" value={env.cfg.rfc} mono />
          <FiscalField label="Régimen" value={env.cfg.regimenFiscal} />
          <FiscalField label="Lugar expedición" value={env.cfg.lugarExpedicion} />
          <FiscalField label="Razón social" value={env.cfg.razonSocial} className="col-span-2 md:col-span-3" />
          <FiscalField label="Domicilio" value={env.cfg.domicilioFiscal} className="col-span-2" />
          <FiscalField label="Correo contacto" value={env.cfg.emailContacto} />
        </dl>
      </section>

      {/* Conexiones externas */}
      <section
        className="mb-5 rounded-2xl p-5"
        style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <KeyRound size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
              Conexiones
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              PAC para timbrado + servicio de correo para entrega.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <ConnectionRow
            label="Facturama (PAC)"
            ok={env.facturamaOk}
            badge={env.facturamaOk ? (env.sandbox ? 'SANDBOX' : 'PROD') : 'sin creds'}
            badgeVariant={env.facturamaOk ? (env.sandbox ? 'warn' : 'ok') : 'error'}
            hint={env.facturamaOk
              ? (env.sandbox
                  ? 'Timbres no válidos fiscalmente. Al contratar plan prod, remueve FACTURAMA_TEST_MODE=true.'
                  : 'Timbres válidos fiscalmente.')
              : 'Configura FACTURAMA_USER + FACTURAMA_PASSWORD en .env.local.'}
          />
          <ConnectionRow
            label="Resend (entrega de correo)"
            ok={env.resendOk}
            badge={env.resendOk ? 'conectado' : 'sin creds'}
            badgeVariant={env.resendOk ? 'ok' : 'error'}
            hint={env.resendOk
              ? 'Los CFDIs se envían al cliente con XML + PDF adjuntos.'
              : 'Configura RESEND_API_KEY para envío automático por correo.'}
          />
        </div>
      </section>

      {/* Tools disponibles */}
      <section
        className="mb-5 rounded-2xl p-5"
        style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <Zap size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
              Tools disponibles
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              Registradas en el executor con <code>gatedByRole: [&#39;neka&#39;]</code>.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <ToolRow
            name="emitir_cfdi_centinelia"
            desc="Emite CFDI Ingreso (típicamente PPD) a nombre de Centinelia. Adjunta XML + PDF y lo manda al receptor si le pasas su correo."
          />
          <ToolRow
            name="solicitar_complemento_pago"
            desc="Emite Complemento de Pago (REP) referenciando el UUID del CFDI PPD original. Se dispara cuando llega un comprobante SPEI."
          />
        </div>
      </section>

      {/* Bandeja */}
      <section
        className="rounded-2xl p-5"
        style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <ShieldCheck size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
              Bandeja
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              Neka comparte <code>hola@centinelia.mx</code> con Nash. El routing por asunto está pendiente (Fase 2b).
            </p>
          </div>
        </div>

        <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(108,59,255,0.06)', color: '#4A3B6B' }}>
          <p className="font-semibold mb-1" style={{ color: '#1A0A3B' }}>Mientras Fase 2b se construye:</p>
          <p>
            Puedes invocar a Neka vía CLI:{' '}
            <code style={{ color: '#1A0A3B' }}>scripts/facturama-emitir-ingreso.ts</code>{' '}
            (CFDI) o{' '}
            <code style={{ color: '#1A0A3B' }}>scripts/facturama-emitir-rep.ts</code>{' '}
            (REP). Ambos aceptan <code>--email=&lt;destino&gt;</code> para entrega automática al cliente.
          </p>
        </div>
      </section>
    </div>
  );
}

// ── UI helpers ─────────────────────────────────────────────────────────────

function FiscalField({
  label, value, mono, className,
}: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt
        className="text-[10px] uppercase tracking-widest mb-0.5"
        style={{ color: '#9B8FB5' }}
      >
        {label}
      </dt>
      <dd
        className={mono ? 'font-mono text-sm' : 'text-sm'}
        style={{ color: '#1A0A3B' }}
      >
        {value}
      </dd>
    </div>
  );
}

function ConnectionRow({
  label, ok, badge, badgeVariant, hint,
}: {
  label: string; ok: boolean;
  badge: string; badgeVariant: 'ok' | 'warn' | 'error';
  hint: string;
}) {
  const badgeStyle = {
    ok:    { background: 'rgba(34,197,94,0.15)', color: '#15803d', border: '1px solid rgba(34,197,94,0.35)' },
    warn:  { background: 'rgba(245,158,11,0.15)', color: '#b45309', border: '1px solid rgba(245,158,11,0.35)' },
    error: { background: 'rgba(239,68,68,0.15)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.35)' },
  }[badgeVariant];

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: ok ? '#22c55e' : '#ef4444' }}
          />
          <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{label}</span>
        </div>
        <p className="text-xs" style={{ color: '#6B6480' }}>{hint}</p>
      </div>
      <span
        className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
        style={badgeStyle}
      >
        {badge}
      </span>
    </div>
  );
}

function ToolRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(108,59,255,0.04)', border: '1px solid #E8E3F5' }}>
      <code className="text-xs font-mono font-semibold" style={{ color: '#6C3BFF' }}>{name}</code>
      <p className="text-xs mt-1" style={{ color: '#4A3B6B' }}>{desc}</p>
    </div>
  );
}

function NekaNavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-colors"
      style={{
        padding:    '9px 14px',
        background: '#F5F0FF',
        color:      '#6C3BFF',
        border:     '1px solid #E8E3F5',
      }}
    >
      {icon}
      {children}
    </Link>
  );
}
