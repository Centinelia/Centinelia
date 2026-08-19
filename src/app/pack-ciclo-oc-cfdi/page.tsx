export const dynamic = 'force-static';

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, CheckCircle, FileText, PenLine, DollarSign, Send,
  Package, Stamp, Archive, Sparkles, Building2, ArrowDown,
} from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';

export const metadata: Metadata = {
  title:       { absolute: 'Ciclo OC-CFDI automatizado | Centinelia' },
  description: 'Empleados digitales que cierran el ciclo completo de compras: cotización del proveedor → Orden de Compra en QuickBooks → firma digitalizada → pago → CFDI al cliente → archivado. Para constructoras, comercializadoras y PYMEs industriales.',
  alternates:  { canonical: 'https://www.centinelia.mx/pack-ciclo-oc-cfdi' },
  openGraph: {
    title:       'Ciclo OC-CFDI automatizado | Centinelia',
    description: 'De la cotización del proveedor al CFDI del cliente sin intervención manual. Nala y Nox coordinan los 11 pasos del ciclo con QuickBooks, tu PAC y tu archivo local.',
    url:         'https://www.centinelia.mx/pack-ciclo-oc-cfdi',
  },
};

const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  border:  'rgba(108,59,255,0.12)',
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  accent:  '#6C3BFF',
  amber:   '#a16207',
  teal:    '#0d9488',
};

const STEPS: Array<{
  n:      number;
  title:  string;
  by:     'Nala' | 'Nox' | 'Humano';
  desc:   string;
  icon:   React.FC<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
}> = [
  { n:  1, title: 'Llega cotización del proveedor',        by: 'Humano', icon: FileText, desc: 'Correo con PDF, imagen o texto — Nala lo recibe.' },
  { n:  2, title: 'Vision AI extrae proveedor y partidas', by: 'Nala',   icon: Sparkles, desc: 'Sin capturar nada a mano: proveedor, items, precios, RFC.' },
  { n:  3, title: 'Crea Orden de Compra en QuickBooks',    by: 'Nala',   icon: Package,  desc: 'Con vendor lookup automático (o create si no existe).' },
  { n:  4, title: 'Descarga PDF de la OC',                 by: 'Nala',   icon: FileText, desc: 'Directo de QB, listo para firmar y archivar.' },
  { n:  5, title: 'Firma digitalizada automática',         by: 'Nala',   icon: PenLine,  desc: 'Si pasa las reglas (monto ≤ tope + datos completos + no duplicado), Nala aplica la firma. Si no, Nox escala al humano autorizado.' },
  { n:  6, title: 'Envía OC firmada al depto de pagos',    by: 'Nala',   icon: Send,     desc: 'Correo con PDF firmado + datos bancarios del proveedor.' },
  { n:  7, title: 'El depto de pagos hace la transferencia', by: 'Humano', icon: DollarSign, desc: 'Devuelven el comprobante a Nala por correo.' },
  { n:  8, title: 'Nala registra el comprobante de pago',  by: 'Nala',   icon: CheckCircle, desc: 'Sube el comprobante, transiciona el expediente a "pagada".' },
  { n:  9, title: 'Envía OC + comprobante al proveedor',   by: 'Nala',   icon: Send,     desc: 'Con signed URL de ambos archivos. El proveedor libera la mercancía.' },
  { n: 10, title: 'Timbra CFDI al cliente',                by: 'Nala',   icon: Stamp,    desc: 'Copia los conceptos de la OC tal cual (sin markup), timbra en tu PAC.' },
  { n: 11, title: 'Archiva XML + PDF + acuse',             by: 'Nala',   icon: Archive,  desc: 'Al destino que configuraste: Dropbox, servidor local SMB o carpeta local (via Windows agent). Nomenclatura configurable.' },
];

const BENEFICIOS = [
  { titulo: 'Cero captura manual entre pasos', desc: 'Los 11 pasos se coordinan automáticamente. El humano solo aprueba lo que rebasa el tope y hace la transferencia bancaria.' },
  { titulo: 'Sin markup accidental',           desc: 'Constraint SQL que asegura que el monto del CFDI empata exactamente el monto de la OC. Un error de captura no genera factura fantasma.' },
  { titulo: 'Firma con reglas explícitas',     desc: 'Tú defines el monto tope. Nala firma sola solo si el monto cumple + los datos están completos + no es duplicado en las últimas 48 horas.' },
  { titulo: 'Audit trail fiscal',              desc: 'Cada transición queda registrada con actor (Nala / Nox / humano), timestamp y detalle. Reconstruible ante auditoría.' },
  { titulo: 'Archivado según tu convención',   desc: 'Placeholders configurables: {año}/{mes}/{proveedor}/{folio}_{fecha}.pdf. Se aplica idéntico para todos los CFDIs.' },
  { titulo: 'Cancelación con safeguard',       desc: 'Nala puede cancelar CFDIs ante el SAT — pero solo si tú activaste el permiso. Motivo 01 exige uuid sustituto obligatorio.' },
];

const REQUISITOS = [
  { titulo: 'QuickBooks Online',       desc: 'Conectado al portal via OAuth. Nala crea la OC ahí.' },
  { titulo: 'PAC (Solución Factible)', desc: 'Credenciales + CSD cargados en el portal. Nala timbra con tu emisor.' },
  { titulo: 'Un correo para el proveedor', desc: 'Donde llegan cotizaciones (Nala lee) y donde se le manda OC firmada + comprobante.' },
  { titulo: 'Destino de archivado',    desc: 'Dropbox, servidor SMB local, o agente Windows en la máquina de contabilidad.' },
];

export default function PackCicloOcCfdiPage() {
  return (
    <>
      <LandingNav />
      <main style={{ background: C.bg, minHeight: '100vh', paddingTop: 80 }}>

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section style={{ padding: 'clamp(64px, 10vw, 128px) clamp(20px, 5vw, 48px) clamp(40px, 6vw, 72px)' }}>
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.amber, marginBottom: 16 }}>
                Pack ciclo OC-CFDI
              </p>
              <h1 style={{
                fontSize: 'clamp(2.4rem, 5.2vw, 4rem)', fontWeight: 800,
                color: C.text, lineHeight: 1.02, letterSpacing: '-0.035em',
                marginBottom: 24,
              }}>
                Del correo del proveedor al CFDI del cliente, sin capturar nada a mano.
              </h1>
              <p style={{ color: C.textSub, fontSize: 'clamp(1.05rem, 2vw, 1.25rem)', lineHeight: 1.6, marginBottom: 36 }}>
                Nala y Nox coordinan los 11 pasos del ciclo: cotización → OC → firma → pago → envío al proveedor → CFDI al cliente → archivo local. Para constructoras, comercializadoras y PYMEs industriales que ya usan QuickBooks + un PAC.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/pedir-rol"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                  style={{ background: `linear-gradient(135deg, ${C.amber}, #f59e0b)`, color: '#fff' }}
                >
                  Cotizar para mi empresa <ArrowRight size={14} />
                </Link>
                <Link
                  href="#como-funciona"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl text-sm font-bold transition-all"
                  style={{ background: '#fff', color: C.text, border: `1px solid ${C.border}` }}
                >
                  Cómo funciona <ArrowDown size={14} />
                </Link>
              </div>
            </div>

            {/* Nala protagonista */}
            <div className="relative flex justify-center">
              <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(circle at 50% 55%, rgba(217,119,6,0.16) 0%, transparent 65%)`,
              }} />
              <div className="relative" style={{ maxWidth: 460, width: '100%', aspectRatio: '3/4' }}>
                <Image
                  src="/meerkats/nala.png"
                  alt="Nala, empleada digital de facturación"
                  fill
                  sizes="(max-width: 1024px) 80vw, 460px"
                  style={{ objectFit: 'contain', objectPosition: 'bottom center' }}
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── COMO FUNCIONA (timeline) ─────────────────────────────────── */}
        <section id="como-funciona" style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: 'clamp(64px, 8vw, 112px) clamp(20px, 5vw, 48px)' }}>
          <div className="max-w-4xl mx-auto">
            <AnimatedSection>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: 14, textAlign: 'center' }}>
                Cómo funciona
              </p>
              <h2 style={{
                fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: C.text,
                lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 20, textAlign: 'center',
              }}>
                Los 11 pasos del ciclo completo
              </h2>
              <p style={{ color: C.textSub, fontSize: 'clamp(0.98rem, 1.8vw, 1.1rem)', lineHeight: 1.65, textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
                Nala (facturista) y Nox (coordinador) se encargan de la mayoría. El humano solo aprueba lo que rebasa el tope y ejecuta la transferencia bancaria.
              </p>
            </AnimatedSection>

            <div className="flex flex-col gap-2">
              {STEPS.map(step => {
                const Icon = step.icon;
                const isHuman = step.by === 'Humano';
                const color = step.by === 'Nala' ? C.amber : step.by === 'Nox' ? C.teal : '#6B6480';
                return (
                  <AnimatedSection key={step.n}>
                    <div className="flex items-start gap-4 p-5 rounded-2xl transition-shadow"
                      style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <div className="rounded-full flex items-center justify-center font-bold text-xs"
                          style={{
                            width: 36, height: 36,
                            background: `${color}12`,
                            color, border: `1px solid ${color}45`,
                          }}>
                          {String(step.n).padStart(2, '0')}
                        </div>
                        <Icon size={13} style={{ color }} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{step.title}</h3>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{
                              background: isHuman ? '#F5F2FB' : `${color}12`,
                              color: isHuman ? '#6B6480' : color,
                              border: `1px solid ${isHuman ? C.border : color + '35'}`,
                            }}>
                            {step.by}
                          </span>
                        </div>
                        <p style={{ color: C.textSub, fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  </AnimatedSection>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── BENEFICIOS ─────────────────────────────────────────────── */}
        <section style={{ padding: 'clamp(64px, 8vw, 112px) clamp(20px, 5vw, 48px)' }}>
          <div className="max-w-5xl mx-auto">
            <AnimatedSection>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: 14, textAlign: 'center' }}>
                Por qué funciona
              </p>
              <h2 style={{
                fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: C.text,
                lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 56, textAlign: 'center',
              }}>
                Reglas duras, no promesas suaves
              </h2>
            </AnimatedSection>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {BENEFICIOS.map(b => (
                <AnimatedSection key={b.titulo}>
                  <div className="p-6 rounded-2xl h-full" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                    <div className="flex items-start gap-3">
                      <CheckCircle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{b.titulo}</h3>
                        <p style={{ color: C.textSub, fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{b.desc}</p>
                      </div>
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── REQUISITOS ─────────────────────────────────────────────── */}
        <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: 'clamp(64px, 8vw, 112px) clamp(20px, 5vw, 48px)' }}>
          <div className="max-w-5xl mx-auto">
            <AnimatedSection>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: 14, textAlign: 'center' }}>
                Requisitos
              </p>
              <h2 style={{
                fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: C.text,
                lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 20, textAlign: 'center',
              }}>
                Lo que necesitas para arrancar
              </h2>
              <p style={{ color: C.textSub, fontSize: 'clamp(0.98rem, 1.8vw, 1.1rem)', lineHeight: 1.65, textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
                Este pack asume que ya tienes tu contabilidad en marcha. Nala se conecta a lo que ya usas.
              </p>
            </AnimatedSection>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {REQUISITOS.map(r => (
                <AnimatedSection key={r.titulo}>
                  <div className="p-6 rounded-2xl flex items-start gap-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: `${C.accent}12`, border: `1px solid ${C.accent}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Building2 size={16} style={{ color: C.accent }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{r.titulo}</h3>
                      <p style={{ color: C.textSub, fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{r.desc}</p>
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ─────────────────────────────────────────────── */}
        <section style={{ background: '#1A0A3B', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute', width: 900, height: 700,
              top: -80, left: '50%', transform: 'translateX(-50%)',
              background: 'radial-gradient(circle, rgba(217,119,6,0.18) 0%, transparent 65%)',
            }} />
          </div>
          <div className="relative max-w-3xl mx-auto text-center" style={{ padding: 'clamp(80px, 10vw, 128px) clamp(20px, 5vw, 48px)', zIndex: 1 }}>
            <AnimatedSection>
              <p style={{ color: 'rgba(245,158,11,0.85)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 20 }}>
                Cotización directa
              </p>
              <h2 style={{
                color: '#fff', fontWeight: 800,
                fontSize: 'clamp(2rem, 4.5vw, 3.4rem)',
                lineHeight: 1.08, letterSpacing: '-0.025em', marginBottom: 24,
              }}>
                Si tu empresa mueve órdenes de compra a diario, Nala ya está lista.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', lineHeight: 1.65, marginBottom: 40, maxWidth: 560, margin: '0 auto 40px' }}>
                Cuéntanos de tu operación y te mandamos cotización específica (kickstart + mensualidad) en menos de 48 horas.
              </p>
              <Link
                href="/pedir-rol"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${C.amber}, #f59e0b)`, color: '#fff' }}
              >
                Cotizar para mi empresa <ArrowRight size={14} />
              </Link>
            </AnimatedSection>
          </div>
        </section>

        <IndustryFooter />
      </main>
    </>
  );
}
