import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin/auth';
import { INTERNAL_MEERKAT_IDS, MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';
import { Sparkles, Terminal, Settings, ShieldAlert, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const INTERNAL_ROLES = MEERKAT_ROLES.filter(r => INTERNAL_MEERKAT_IDS.has(r.id));

const INTERNAL_STATUS: Record<string, {
  canales: string[]; features: string[]; notas: string[]; configHref?: string;
}> = {
  nash: {
    canales: ['dashboard admin', 'notificaciones sistema', 'correo saliente'],
    features: ['monitoreo plataforma', 'health-check clientes', 'passive discovery'],
    notas: [
      'Vigila crons, empleados sin actividad y clientes por churn.',
      'Envía reportes diarios y semanales a Nazre.',
    ],
  },
  neka: {
    canales: ['CLI (dev)', 'chat via executor (WIP)'],
    features: ['emitir_cfdi_centinelia (Facturama)', 'solicitar_complemento_pago (Facturama)'],
    notas: [
      'Timbra CFDIs Ingreso + REPs a nombre de Centinelia hacia sus clientes.',
      'PAC actual: Facturama sandbox. Cuando volumen suba, migrar a Solución Factible.',
      'Bandeja: comparte hola@centinelia.mx (no requiere alias separado).',
    ],
    configHref: '/admin/staff/neka',
  },
};

export default async function StaffPage() {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/staff');
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Roster interno</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          Staff interno de Centinelia
        </h1>
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
          Meerkats que trabajan para Centinelia como empresa (no para clientes externos). Nash vigila la plataforma; Neka timbra CFDIs propios.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTERNAL_ROLES.map(role => {
          const status = INTERNAL_STATUS[role.id];
          return (
            <article
              key={role.id}
              className="rounded-2xl p-5"
              style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}
            >
              <div className="flex items-start gap-4 mb-4">
                {role.imagen ? (
                  <span
                    style={{
                      width: 56, height: 56, borderRadius: '50%',
                      overflow: 'hidden', display: 'inline-block',
                      flexShrink: 0,
                      background: '#ffffff',
                      border: `2px solid ${role.color}33`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={role.imagen}
                      alt={role.nombre}
                      style={{
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                        objectPosition: role.avatarPosition ?? 'center 3%',
                        transform: role.avatarScale && role.avatarScale !== 1 ? `scale(${role.avatarScale})` : 'none',
                        transformOrigin: role.avatarPosition ?? 'center 3%',
                      }}
                    />
                  </span>
                ) : (
                  <div
                    className="flex-shrink-0 flex items-center justify-center text-lg font-bold text-white"
                    style={{ width: 56, height: 56, borderRadius: '50%', background: role.color }}
                  >
                    {role.nombre[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold" style={{ color: '#1A0A3B' }}>{role.nombre}</h3>
                  <p className="text-xs font-medium" style={{ color: role.color }}>{role.rol}</p>
                  <p className="text-xs mt-1" style={{ color: '#6B6480' }}>{role.descripcion}</p>
                </div>
                {status?.configHref && (
                  <Link
                    href={status.configHref}
                    className="p-2 rounded-lg transition-opacity hover:opacity-70 flex-shrink-0"
                    style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}
                    title={`Configurar ${role.nombre}`}
                  >
                    <Settings size={14} />
                  </Link>
                )}
              </div>

              {status && (
                <div className="space-y-3">
                  <MeerkatSection label="Canales">
                    <div className="flex flex-wrap gap-1.5">
                      {status.canales.map(c => (
                        <span
                          key={c}
                          className="text-[11px] px-2 py-0.5 rounded"
                          style={{ background: 'rgba(108,59,255,0.08)', color: '#4A3B6B' }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </MeerkatSection>

                  <MeerkatSection label="Features / tools">
                    <ul className="space-y-1">
                      {status.features.map(f => (
                        <li
                          key={f}
                          className="text-xs flex items-start gap-1.5"
                          style={{ color: '#4A3B6B' }}
                        >
                          <Sparkles size={11} className="mt-0.5 flex-shrink-0" style={{ color: role.color }} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </MeerkatSection>

                  {status.notas.length > 0 && (
                    <MeerkatSection label="Notas">
                      <ul className="space-y-1">
                        {status.notas.map((n, i) => (
                          <li key={i} className="text-xs" style={{ color: '#6B6480' }}>
                            · {n}
                          </li>
                        ))}
                      </ul>
                    </MeerkatSection>
                  )}

                  {status.configHref && (
                    <Link
                      href={status.configHref}
                      className="inline-flex items-center gap-1.5 text-xs font-medium mt-1 hover:opacity-70 transition-opacity"
                      style={{ color: role.color }}
                    >
                      Configurar {role.nombre}
                      <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <aside
        className="mt-6 rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#b45309' }} />
        <div className="text-xs" style={{ color: '#4A3B6B' }}>
          <p className="font-semibold mb-1" style={{ color: '#1A0A3B' }}>Pendiente Fase 2b de Nala</p>
          <ul className="space-y-1">
            <li>· Routing de emails entrantes en <code>hola@centinelia.mx</code> hacia Nala cuando el asunto/cuerpo sea fiscal.</li>
            <li>· UI chat interno para invocar Nala manual desde admin.</li>
            <li>· Tabla <code>centinelia_billing</code> para trackear CFDIs y REPs (hoy XML/PDF locales).</li>
            <li>· Contratar plan API prod Facturama ($1,650/año) para timbres fiscalmente válidos.</li>
          </ul>
        </div>
      </aside>

      <aside
        className="mt-4 rounded-lg p-3 flex items-center gap-2 text-xs"
        style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: '#6B6480' }}
      >
        <Terminal size={13} style={{ color: '#6C3BFF' }} />
        <span>
          Mientras la UI se termina, timbras CFDIs con{' '}
          <code style={{ color: '#1A0A3B' }}>scripts/facturama-emitir-ingreso.ts</code>{' '}
          y REPs con{' '}
          <code style={{ color: '#1A0A3B' }}>scripts/facturama-emitir-rep.ts</code>.
        </span>
      </aside>
    </div>
  );
}

function MeerkatSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: '#9B8FB5' }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}
