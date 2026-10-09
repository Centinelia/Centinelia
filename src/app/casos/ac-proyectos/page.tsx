// Caso real: AC Proyectos + Nami.
// NO LINKEAR desde navegación pública (navbar, footer, sitemap) hasta
// que AC Proyectos autorice uso del nombre y logo del cliente.
// La ruta existe para compartir el URL directo con el cliente y pedir
// autorización viendo el asset renderizado.
// Datos verificados: pull directo de inventory_mutations_log + organizations
// el 2026-10-09 sobre la cuenta agent_id=3245bc1f-89e1-4949-bbed-71a18b05e344,
// portal camila@acproyectos.com, periodo 2026-10-02 a 2026-10-09.

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, Clock, FileText, Receipt, Truck, UserPlus, ClipboardList, Package, ShieldCheck, Calendar } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter from '@/app/industrias/IndustryFooter';

export const metadata: Metadata = {
  title: 'Caso AC Proyectos + Nami',
  description: 'Primera semana operando: 144 operaciones de inventario capturadas sin que Camila abriera Excel. 34 órdenes de compra, 17 facturas TRANE, 33 hojas de salida, 25 cargas al BACKLOG.',
  robots: { index: false, follow: false },
};

const C = {
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  surface: '#FFFFFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.60)',
  border:  'rgba(108,59,255,0.12)',
  accent:  '#6C3BFF',
  accentSoft: 'rgba(108,59,255,0.08)',
};

const RESULTADOS = [
  { icon: Package,       n: '144', label: 'Operaciones de inventario en 7 días' },
  { icon: FileText,      n: '34',  label: 'Órdenes de compra capturadas desde QuickBooks' },
  { icon: Receipt,       n: '17',  label: 'Facturas TRANE procesadas con series' },
  { icon: Truck,         n: '33',  label: 'Hojas de salida registradas' },
  { icon: ClipboardList, n: '25',  label: 'Cargas semanales al BACKLOG de TRANE' },
  { icon: UserPlus,      n: '10',  label: 'Equipos asignados a cliente' },
  { icon: Check,         n: '4',   label: 'Facturas de venta procesadas desde Solución Factible' },
  { icon: ShieldCheck,   n: '13',  label: 'Correos duplicados detectados sin duplicar filas' },
];

const RESOLUCIONES = [
  { label: 'Órdenes de compra desde QuickBooks',       n: 34 },
  { label: 'Hojas de salida con folio',                n: 33 },
  { label: 'Cargas al BACKLOG de TRANE',               n: 25 },
  { label: 'Facturas TRANE con series y tipo de cambio', n: 17 },
  { label: 'Equipos asignados a cliente',              n: 10 },
  { label: 'Cambios de estatus de inventario',         n:  9 },
  { label: 'Equipos agregados manualmente',            n:  4 },
  { label: 'Transferencias entre bodegas',             n:  4 },
  { label: 'Facturas de venta de Solución Factible',   n:  4 },
  { label: 'Ventas registradas en el INVENTARIO',      n:  4 },
];

const QUE_HACE = [
  { icon: FileText,      titulo: 'Captura la orden de compra',        desc: 'Lee el PDF de QuickBooks que le reenvías y crea una fila por cada equipo en el INVENTARIO.' },
  { icon: Receipt,       titulo: 'Procesa la factura TRANE',          desc: 'Hace match contra la OC pre-registrada y agrega series, modelo, SEER, REF, VOLTS y tipo de cambio del XML.' },
  { icon: Package,       titulo: 'Actualiza estatus del equipo',      desc: 'ALMACEN, SEPARADO, ENTREGADO, PENDIENTE. Mantiene SALIDA, CONTROL y RECIBO2 consistentes.' },
  { icon: UserPlus,      titulo: 'Asigna cliente al equipo',          desc: 'Cuando ventas confirma pago, cambia STOCK por el nombre real del cliente y marca SEPARADO.' },
  { icon: Truck,         titulo: 'Registra la hoja de salida',        desc: 'Varias series en una sola hoja de folio. Pone ESTATUS en ENTREGADO y actualiza CONTROL y SALIDA.' },
  { icon: Check,         titulo: 'Procesa la factura de venta',       desc: 'Reenvías el XML de Solución Factible. Rellena FACTURA, FECHA DE VENTA, COSTO VTA y UTILIDAD en una sola corrida.' },
  { icon: ClipboardList, titulo: 'Mantiene el BACKLOG de TRANE',      desc: 'Lee el PDF semanal y actualiza la hoja. Modo de respeto a lo que ya está capturado por humanos.' },
  { icon: ShieldCheck,   titulo: 'No duplica aunque le reenvíes',     desc: 'Si llega el mismo correo dos veces, reconoce la OC o factura ya capturada y te avisa sin duplicar filas.' },
];

export default function CasoAcProyectosPage() {
  return (
    <>
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.22) 0%, transparent 60%)' }} />
        <div className="max-w-5xl mx-auto px-6 relative" style={{ paddingTop: 120, paddingBottom: 90, zIndex: 1 }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Caso real · Segundo cliente PyME recurrente
          </p>
          <h1 className="font-bold leading-[1.08] mb-6" style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)', color: '#fff', maxWidth: 840 }}>
            Primera semana con Nami. 144 operaciones de inventario capturadas sin que Camila abriera Excel.
          </h1>
          <p style={{ fontSize: 'clamp(1.05rem, 1.8vw, 1.2rem)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.7, maxWidth: 720 }}>
            AC Proyectos distribuye equipos TRANE en Monterrey. Camila, administradora de inventarios, lleva una hoja de Excel con cada equipo que entra y sale de bodega. Nami, su empleada digital de inventarios, capturó por correo todo el movimiento operativo de 7 días seguidos. Estos son los números verificables.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
              <Clock size={13} /> 2 al 9 de octubre 2026
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
              Monterrey · B2B · Distribución HVAC
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold" style={{ background: 'rgba(108,59,255,0.25)', color: '#fff' }}>
              Jornada de inventario
            </span>
          </div>
        </div>
      </section>

      {/* Resultados: grid principal */}
      <section style={{ background: C.bg, padding: '80px 24px' }}>
        <div className="max-w-6xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-center" style={{ color: C.accent }}>
              Resultados verificables
            </p>
            <h2 className="font-bold mb-4 text-center" style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)', color: C.text }}>
              Lo que hizo Nami en 7 días
            </h2>
            <p className="text-center mb-12 max-w-2xl mx-auto" style={{ color: C.textSub, fontSize: '1rem', lineHeight: 1.65 }}>
              Datos tomados directo del sistema operativo de Centinelia el 9 de octubre de 2026. Son métricas de producción, no de prueba.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {RESULTADOS.map((r, i) => {
              const Icon = r.icon;
              return (
                <AnimatedSection key={r.label} delay={i * 0.04}>
                  <div className="rounded-2xl p-5 h-full" style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(108,59,255,0.05)' }}>
                    <div className="inline-flex items-center justify-center rounded-xl mb-3" style={{ background: C.accentSoft, width: 36, height: 36 }}>
                      <Icon size={18} color={C.accent} />
                    </div>
                    <p className="font-bold leading-none mb-2" style={{ fontSize: 'clamp(1.6rem, 3vw, 2rem)', color: C.text }}>
                      {r.n}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: C.textSub }}>
                      {r.label}
                    </p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* El reto */}
      <section style={{ background: '#fff', padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              El reto
            </p>
            <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              Un distribuidor HVAC captura ocho veces el mismo equipo
            </h2>
            <div className="space-y-4" style={{ color: C.textSub, fontSize: '1.05rem', lineHeight: 1.75 }}>
              <p>
                AC Proyectos distribuye equipos TRANE a instaladores y constructoras en toda la zona metropolitana de Monterrey. Entre minisplits, condensadoras y evaporadoras, por bodega pasan decenas de modelos distintos al mes, cada uno con un número de serie único que hay que rastrear desde la orden de compra hasta la factura de venta final.
              </p>
              <p>
                Camila lleva ese inventario en una hoja de Excel. Por cada equipo captura el mismo dato hasta ocho veces en pasos distintos: cuando llega la orden de compra desde QuickBooks, cuando TRANE factura con el número de serie real, cuando el equipo entra a bodega, cuando ventas confirma pago, cuando sale con hoja de salida, cuando Solución Factible emite la factura, cuando TRANE pide actualizar el BACKLOG semanal.
              </p>
              <p style={{ color: C.text, fontWeight: 500 }}>
                Una serie mal transcrita significa un equipo que no se puede entregar, una factura que no cuadra con TRANE, o una venta que no se puede cerrar. El Excel es la memoria operativa del negocio. Si se rompe, se rompe la operación.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* La solución: Nami */}
      <section style={{ background: C.bg, padding: '80px 24px', borderTop: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        {/* Meerkat Nami desktop (absolute) */}
        <div className="hidden md:block absolute pointer-events-none" style={{ right: '-40px', top: '60px', width: 260, opacity: 0.92 }}>
          <Image src="/meerkats/nami.png" alt="" width={260} height={260} style={{ width: '100%', height: 'auto' }} />
        </div>

        <div className="max-w-5xl mx-auto relative">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              La solución
            </p>
            <div className="flex items-center gap-4 mb-6 md:mb-4">
              {/* Meerkat Nami mobile (in-flow) */}
              <div className="block md:hidden" style={{ width: 72, height: 72, flexShrink: 0 }}>
                <Image src="/meerkats/nami.png" alt="Nami" width={72} height={72} style={{ width: '100%', height: 'auto' }} />
              </div>
              <h2 className="font-bold" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
                Nami, empleada digital de inventarios
              </h2>
            </div>
            <p className="max-w-2xl mb-10" style={{ color: C.textSub, fontSize: '1.05rem', lineHeight: 1.75 }}>
              Jornada de inventario, 5,000 operaciones de negocio al mes. Trabaja por correo: Camila le reenvía la OC, la factura TRANE, la hoja de salida y la factura de venta. Nami las captura una por una en el Excel y le avisa a Camila qué quedó registrado. También responde en el chat del portal cuando Camila necesita consultar o corregir algo.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            {QUE_HACE.map((item, i) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={item.titulo} delay={i * 0.05}>
                  <div className="rounded-2xl p-5 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ background: C.accentSoft, width: 32, height: 32 }}>
                        <Icon size={16} color={C.accent} />
                      </div>
                      <h3 className="font-semibold" style={{ color: C.text, fontSize: '0.98rem' }}>{item.titulo}</h3>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: C.textSub, paddingLeft: 44 }}>{item.desc}</p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Desglose de las 144 operaciones */}
      <section style={{ background: '#fff', padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3 text-center" style={{ color: C.accent }}>
              Desglose
            </p>
            <h2 className="font-bold mb-10 text-center" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              En qué terminaron las 144 operaciones capturadas
            </h2>
          </AnimatedSection>
          <div className="rounded-3xl overflow-hidden" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            {RESOLUCIONES.map((r, i) => (
              <AnimatedSection key={r.label} delay={i * 0.04}>
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: i < RESOLUCIONES.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <p className="font-medium" style={{ color: C.text, fontSize: '0.98rem' }}>{r.label}</p>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block rounded-full" style={{ width: `${(r.n / 34) * 180}px`, maxWidth: 180, height: 8, background: 'linear-gradient(90deg, rgba(108,59,255,0.3), #6C3BFF)' }} />
                    <p className="font-bold tabular-nums" style={{ color: C.text, fontSize: '1.1rem', minWidth: 32, textAlign: 'right' }}>{r.n}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Lo que esto significa */}
      <section style={{ background: C.bg, padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              Lo que esto significa
            </p>
            <h2 className="font-bold mb-8" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              Qué cambió en la operación de Camila
            </h2>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <AnimatedSection delay={0.0}>
              <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <p className="font-bold mb-2" style={{ color: C.text, fontSize: '1.05rem' }}>Seis de ocho pasos automatizados</p>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                  Los pasos físicos de bodega quedan con Camila. Los pasos de captura, estatus, hoja de salida y facturación los hace Nami cuando Camila le reenvía el documento correspondiente.
                </p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={0.08}>
              <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <p className="font-bold mb-2" style={{ color: C.text, fontSize: '1.05rem' }}>Patrones del Excel aprendidos</p>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                  Nami aprendió los formatos reales de AC Proyectos: CLIENTE en mayúsculas como STOCK mientras no haya venta, UTILIDAD igual al COSTO MX como marcador pre-venta, tipo de cambio sacado directo del XML de la factura, FACTOR respetado como fórmula del Excel.
                </p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={0.16}>
              <div className="rounded-2xl p-6 h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                <p className="font-bold mb-2" style={{ color: C.text, fontSize: '1.05rem' }}>Trece duplicados evitados</p>
                <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                  Camila reenvió el mismo correo con la misma OC trece veces durante la semana. Nami reconoció cada uno como duplicado y no agregó filas repetidas al INVENTARIO.
                </p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Qué sigue */}
      <section style={{ background: '#fff', padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              Qué sigue
            </p>
            <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', color: C.text }}>
              Cuatro meses pagados por adelantado
            </h2>
            <div className="space-y-4" style={{ color: C.textSub, fontSize: '1.05rem', lineHeight: 1.75 }}>
              <p>
                AC Proyectos cerró a Nami con cuatro meses pagados por adelantado. Esta es la primera semana del primer mes. El plan completo cubre hasta inicios de 2027 y la medición continúa semana a semana sobre el mismo tablero.
              </p>
              <p>
                Entre semana Camila le reenvía los documentos del día y Nami los captura en lotes. Lo que antes era ocho pasos y una hoja abierta todo el día, ahora es un correo con un adjunto y una respuesta de Nami en menos de un minuto.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Metodología */}
      <section style={{ background: C.bg, padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
              Cómo medimos
            </p>
            <div className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <ul className="space-y-3 text-sm" style={{ color: C.textSub, lineHeight: 1.7 }}>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>Las cifras salen del sistema operativo de Centinelia (bitácora de mutaciones de inventario y configuración de pool).</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>Periodo medido: 2 al 9 de octubre de 2026, 7 días naturales.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>&ldquo;Operación de inventario&rdquo; incluye cualquier captura, actualización, asignación o cambio de estatus que Nami escribió en la hoja de Excel de AC Proyectos.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>Los duplicados detectados cuentan como una operación lógica porque también requieren leer la OC, buscarla en el INVENTARIO y confirmar que ya está capturada antes de descartar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Calendar size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
                  <span>La medición continúa. Al cierre de mes publicamos los números completos.</span>
                </li>
              </ul>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#0D0520', padding: '90px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: '#fff', lineHeight: 1.2 }}>
              ¿Quieres una primera semana así en tu negocio?
            </h2>
            <p className="mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1rem', lineHeight: 1.65 }}>
              Activa a tu empleado digital en menos de 24 horas. Sin permanencia.
            </p>
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              Contratar mi primer empleado digital <ArrowRight size={15} />
            </Link>
          </AnimatedSection>
        </div>
      </section>

      <IndustryFooter />
    </>
  );
}
