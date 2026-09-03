import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';
import { getCentineliaFiscalConfig, isFacturamaSandbox } from '@/lib/invoicing/facturama/centinelia-preset';
import { ArrowLeft, FileText, ShieldCheck, KeyRound, Zap, MessageCircle, MailCheck, Users, Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';

const NALA = MEERKAT_ROLES.find(r => r.id === 'nala')!;

function envStatusCentinelia() {
  const cfg = getCentineliaFiscalConfig();
  const sandbox = isFacturamaSandbox();
  const facturamaOk = !!(process.env.FACTURAMA_USER && process.env.FACTURAMA_PASSWORD);
  const resendOk = !!process.env.RESEND_API_KEY;
  return { cfg, sandbox, facturamaOk, resendOk };
}

export default async function NalaConfigPage() {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/staff/nala');
  }

  const env = envStatusCentinelia();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href="/admin/staff"
        className="inline-flex items-center gap-1.5 text-xs mb-6 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--c-text-3)' }}
      >
        <ArrowLeft size={12} />
        Volver a Staff interno
      </Link>

      <header className="flex items-center gap-4 mb-8 flex-wrap">
        {NALA.imagen && (
          <span
            style={{
              width: 64, height: 64, borderRadius: '50%',
              overflow: 'hidden', display: 'inline-block',
              flexShrink: 0,
              background: '#ffffff',
              border: `2px solid ${NALA.color}33`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={NALA.imagen}
              alt={NALA.nombre}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: NALA.avatarPosition ?? 'center 3%',
                transform: NALA.avatarScale && NALA.avatarScale !== 1 ? `scale(${NALA.avatarScale})` : 'none',
                transformOrigin: NALA.avatarPosition ?? 'center 3%',
              }}
            />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
            Configuración de {NALA.nombre}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: NALA.color }}>{NALA.rol}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>{NALA.descripcion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/staff/nala/chat"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: NALA.color, color: '#fff' }}
          >
            <MessageCircle size={14} />
            Hablar con Nala
          </Link>
          <Link
            href="/admin/staff/nala/clientes"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'rgba(161,98,7,0.1)', color: '#a16207', border: '1px solid rgba(161,98,7,0.3)' }}
          >
            <Users size={14} />
            Clientes
          </Link>
          <Link
            href="/admin/staff/nala/pagos-pendientes"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            <Clock size={14} />
            Pagos pendientes
          </Link>
          <Link
            href="/admin/staff/nala/test-email"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.3)' }}
          >
            <MailCheck size={14} />
            Probar correo
          </Link>
        </div>
      </header>

      {/* Datos fiscales del emisor */}
      <section
        className="mb-5 rounded-2xl p-5"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <FileText size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Datos fiscales del emisor
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Nala usa estos datos para timbrar CFDIs a nombre de Centinelia. Overridables vía env vars <code>CENTINELIA_*</code>.
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
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <KeyRound size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Conexiones
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
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
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <Zap size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Tools disponibles
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Registradas en el executor con <code>gatedByRole: [&#39;nala&#39;]</code>.
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
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <ShieldCheck size={16} className="mt-0.5" style={{ color: '#6C3BFF' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Bandeja
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Nala comparte <code>hola@centinelia.mx</code> con Nash. El routing por asunto está pendiente (Fase 2b).
            </p>
          </div>
        </div>

        <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(108,59,255,0.06)', color: 'var(--c-text-2)' }}>
          <p className="font-semibold mb-1" style={{ color: 'var(--c-text)' }}>Mientras Fase 2b se construye:</p>
          <p>
            Puedes invocar a Nala vía CLI:{' '}
            <code style={{ color: 'var(--c-text)' }}>scripts/facturama-emitir-ingreso.ts</code>{' '}
            (CFDI) o{' '}
            <code style={{ color: 'var(--c-text)' }}>scripts/facturama-emitir-rep.ts</code>{' '}
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
        style={{ color: 'var(--c-text-4)' }}
      >
        {label}
      </dt>
      <dd
        className={mono ? 'font-mono text-sm' : 'text-sm'}
        style={{ color: 'var(--c-text)' }}
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
          <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{label}</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{hint}</p>
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
    <div className="rounded-lg p-3" style={{ background: 'rgba(108,59,255,0.04)', border: '1px solid var(--c-border)' }}>
      <code className="text-xs font-mono font-semibold" style={{ color: '#6C3BFF' }}>{name}</code>
      <p className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>{desc}</p>
    </div>
  );
}
