'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Phone, PhoneCall, PhoneOutgoing, Briefcase,
  Building2, Link2, CircleUser, ChevronDown, ChevronRight, Bot, CreditCard,
} from 'lucide-react';
import { uColor } from '@/lib/portal/utils';

type SubItem    = { label: string; id: string };
type SubSection = { label: string; id: string; icon: React.ReactNode; items: SubItem[] };
type Section    = { id: string; label: string; icon: React.ReactNode; items: SubItem[]; subSections?: SubSection[]; directHref?: string; toggleOnly?: boolean };

interface Props {
  token:            string;
  currentTab:       string;
  hasOpsAgent:      boolean;
  showOutbound:     boolean;
  hasStripe?:       boolean;
  minutesRemain?:   number;
  minutesIncluded?: number;
  aiOpsUsed?:       number;
  aiOpsLimit?:      number;
}

export default function PortalSidebar({ token, currentTab, hasOpsAgent, showOutbound, hasStripe = false, minutesRemain = 0, minutesIncluded = 0, aiOpsUsed = 0, aiOpsLimit = 0 }: Props) {
  const pathname  = usePathname();
  const [openIds, setOpenIds] = useState<string[]>([currentTab]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingId) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (attempts > 100) { clearInterval(timer); setPendingId(null); return; }
      const el = document.getElementById(pendingId);
      if (!el) return;
      clearInterval(timer);
      setPendingId(null);
      const rect = el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' });
      el.style.transition = 'box-shadow 0.15s';
      el.style.boxShadow = '0 0 0 3px rgba(108,59,255,0.7), inset 0 0 0 9999px rgba(108,59,255,0.15)';
      setTimeout(() => {
        el.style.transition = 'box-shadow 1.5s ease-out';
        el.style.boxShadow = '';
        setTimeout(() => { el.style.transition = ''; }, 1500);
      }, 600);
    }, 50);
    return () => clearInterval(timer);
  }, [pendingId]);

  const toggle = (id: string) =>
    setOpenIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const sections: Section[] = [
    {
      id: 'inicio', label: 'Inicio', icon: <LayoutDashboard size={14} />,
      items: [
        { label: 'Resumen',          id: 'resumen' },
        { label: 'Horas pico',       id: 'horas-pico' },
        { label: 'Actividad',        id: 'actividad' },
        { label: 'Reporte mensual',  id: 'reporte-mensual' },
      ],
    },
    {
      id: 'negocio', label: 'Negocio', icon: <Building2 size={14} />,
      items: [
        { label: 'Logo y branding',      id: 'branding' },
        { label: 'Base de conocimiento', id: 'conocimiento' },
        { label: 'Horarios',             id: 'horarios' },
        { label: 'Sitio web y reseñas',  id: 'sitio' },
      ],
    },
    {
      id: 'agentes', label: 'Agentes', icon: <Bot size={14} />,
      directHref: `/portal/${token}/agentes`,
      items: [
        { label: 'Mis agentes', id: 'lista-agentes' },
      ],
    },
    {
      id: 'llamadas', label: 'Llamadas', icon: <Phone size={14} />,
      toggleOnly: true,
      items: [],
      subSections: [
        {
          label: 'Entrantes', id: 'entrantes', icon: <PhoneCall size={12} />,
          items: [
            { label: 'Registro de llamadas',    id: 'registro' },
            { label: 'Leads / Citas / Pedidos', id: 'leads-citas-pedidos' },
          ],
        },
        ...(showOutbound ? [{
          label: 'Salientes', id: 'salientes', icon: <PhoneOutgoing size={12} />,
          items: [
            { label: 'Llamadas salientes', id: 'llamadas-sal' },
            { label: 'Campañas',           id: 'campanas' },
            { label: 'Contactos',          id: 'contactos' },
          ],
        }] : []),
      ],
    },
    ...(hasOpsAgent ? [{
      id: 'oficina', label: 'Oficina', icon: <Briefcase size={14} />,
      directHref: `/portal/${token}/oficina`,
      items: [
        { label: 'Actividad',          id: '' },
        { label: 'Bandeja de entrada', id: 'bandeja' },
        { label: 'Reportes AI',        id: 'reportes' },
        { label: 'Contratos',          id: 'contratos' },
        { label: 'Documentos',         id: 'documentos' },
        { label: 'Juntas',             id: 'juntas' },
        { label: 'Onboarding',         id: 'onboarding' },
        { label: 'Consultar agente',   id: 'chat' },
      ],
    }] as Section[] : []),
    {
      id: 'integraciones', label: 'Integraciones', icon: <Link2 size={14} />,
      items: [
        { label: 'Correo',         id: 'correo' },
        { label: 'Calendario',     id: 'calendario' },
        { label: 'Notion CRM',     id: 'notion' },
        ...(hasOpsAgent ? [{ label: 'Microsoft Teams', id: 'teams' }] : []),
        { label: 'Políticas',      id: 'politicas' },
      ],
    },
    {
      id: 'cuenta', label: 'Cuenta', icon: <CircleUser size={14} />,
      items: [
        { label: 'Organización',  id: 'organizacion' },
        { label: 'Minutos y uso', id: 'minutos' },
        { label: 'Plan y cambios',id: 'plan' },
        { label: 'Contrato',      id: 'contrato' },
      ],
    },
  ];

  const hasChildren = (s: Section) => s.items.length > 0 || (s.subSections?.length ?? 0) > 0;

  return (
    <aside
      className="hidden md:flex flex-col w-52 shrink-0"
      style={{
        borderRight: '1px solid var(--c-border)',
        background:  'var(--c-modal)',
        position:    'sticky',
        top:         53,
        height:      'calc(100vh - 53px)',
        overflowY:   'auto',
      }}
    >
      <nav className="flex flex-col py-2 px-2">
        {sections.map(section => {
          const isActive = currentTab === section.id;
          const isOpen   = openIds.includes(section.id);
          return (
            <div key={section.id} className="mb-0.5">
              <div className="flex items-center gap-0.5">
                {section.toggleOnly ? (
                  <button
                    onClick={() => toggle(section.id)}
                    className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all text-left"
                    style={{
                      background: isActive ? 'rgba(108,59,255,0.12)' : 'transparent',
                      color:      isActive ? '#9B6DFF' : 'var(--c-text-2)',
                    }}
                  >
                    <span style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }}>{section.icon}</span>
                    <span className="flex-1">{section.label}</span>
                    {isOpen ? <ChevronDown size={11} style={{ color: 'var(--c-text-3)', opacity: 0.7, flexShrink: 0 }} /> : <ChevronRight size={11} style={{ color: 'var(--c-text-3)', opacity: 0.7, flexShrink: 0 }} />}
                  </button>
                ) : (
                  <>
                    <Link
                      href={section.directHref ?? `/portal/${token}?tab=${section.id}`}
                      onClick={() => { if (!openIds.includes(section.id)) setOpenIds(prev => [...prev, section.id]); }}
                      className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: isActive ? 'rgba(108,59,255,0.12)' : 'transparent',
                        color:      isActive ? '#9B6DFF' : 'var(--c-text-2)',
                      }}
                    >
                      <span style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }}>{section.icon}</span>
                      {section.label}
                    </Link>
                    {hasChildren(section) && (
                      <button
                        onClick={() => toggle(section.id)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                        style={{ color: 'var(--c-text-3)', flexShrink: 0 }}
                      >
                        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                    )}
                  </>
                )}
              </div>

              {isOpen && (
                <div className="mt-0.5 mb-1 pl-2 flex flex-col gap-0.5">

                  {/* Flat items (most sections) */}
                  {section.items.map(item => (
                    <Link
                      key={item.id}
                      href={section.id === 'oficina'
                        ? `/portal/${token}/oficina${item.id ? `/${item.id}` : ''}`
                        : `/portal/${token}?tab=${section.id}#${item.id}`}
                      scroll={false}
                      onClick={() => {
                        if (item.id) setPendingId(item.id);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--c-surface-2)]"
                      style={{ color: 'var(--c-text-2)' }}
                    >
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'currentColor', opacity: 0.45 }} />
                      {item.label}
                    </Link>
                  ))}

                  {/* Sub-sections (llamadas: Entrantes / Salientes) */}
                  {section.subSections?.map(sub => {
                    const subHref   = `/portal/${token}/llamadas/${sub.id}`;
                    const isSubActive = pathname === subHref || pathname.startsWith(subHref + '/');
                    const subOpenKey  = `${section.id}-${sub.id}`;
                    const subOpen     = openIds.includes(subOpenKey) || isSubActive;
                    return (
                      <div key={sub.id}>
                        <div className="flex items-center gap-0.5">
                          <Link
                            href={subHref}
                            onClick={() => { if (!openIds.includes(subOpenKey)) setOpenIds(prev => [...prev, subOpenKey]); }}
                            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            style={{
                              background: isSubActive ? 'rgba(108,59,255,0.1)' : 'transparent',
                              color:      isSubActive ? '#9B6DFF' : 'var(--c-text-2)',
                            }}
                          >
                            <span style={{ opacity: isSubActive ? 1 : 0.6, flexShrink: 0 }}>{sub.icon}</span>
                            {sub.label}
                          </Link>
                          <button
                            onClick={() => toggle(subOpenKey)}
                            className="flex items-center justify-center w-6 h-6 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                            style={{ color: 'var(--c-text-3)', flexShrink: 0 }}
                          >
                            {subOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          </button>
                        </div>
                        {subOpen && (
                          <div className="pl-2 flex flex-col gap-0.5 mt-0.5">
                            {sub.items.map(item => (
                              <Link
                                key={item.id}
                                href={`${subHref}#${item.id}`}
                                scroll={false}
                                onClick={() => { if (item.id) setPendingId(item.id); }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--c-surface-2)]"
                                style={{ color: 'var(--c-text-2)' }}
                              >
                                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'currentColor', opacity: 0.45 }} />
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Usage widget */}
      {minutesIncluded > 0 && (() => {
        const minPct  = Math.min(Math.round((1 - minutesRemain / minutesIncluded) * 100), 100);
        const opsPct  = aiOpsLimit > 0 ? Math.min(Math.round((aiOpsUsed / aiOpsLimit) * 100), 100) : 0;
        const opsRemain = Math.max(0, aiOpsLimit - aiOpsUsed);
        return (
          <Link
            href={`/portal/${token}?tab=cuenta#minutos`}
            className="block px-3 py-3 mt-auto shrink-0 hover:opacity-80 transition-opacity"
            style={{ borderTop: '1px solid var(--c-border)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>Uso del mes</p>
            {/* Minutes */}
            <div className="mb-2">
              <div className="flex justify-between mb-1">
                <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Minutos</span>
                <span className="text-[11px] font-medium tabular-nums" style={{ color: uColor(minPct) }}>
                  {minutesRemain} restantes
                </span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'var(--c-border)' }}>
                <div style={{ width: `${minPct}%`, height: '100%', background: uColor(minPct), borderRadius: 9999, transition: 'width 0.4s' }} />
              </div>
            </div>
            {/* Ops */}
            {aiOpsLimit > 0 && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Ops IA</span>
                  <span className="text-[11px] font-medium tabular-nums" style={{ color: uColor(opsPct) }}>
                    {opsRemain} restantes
                  </span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'var(--c-border)' }}>
                  <div style={{ width: `${opsPct}%`, height: '100%', background: uColor(opsPct), borderRadius: 9999, transition: 'width 0.4s' }} />
                </div>
              </div>
            )}
          </Link>
        );
      })()}

      {hasStripe && (
        <div className="px-2 py-3 shrink-0" style={{ borderTop: minutesIncluded > 0 ? 'none' : '1px solid var(--c-border)', marginTop: minutesIncluded > 0 ? 0 : 'auto' }}>
          <a
            href={`/api/billing/portal-session?token=${token}`}
            className="flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 w-full"
            style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', textDecoration: 'none' }}
          >
            <CreditCard size={14} style={{ flexShrink: 0 }} />
            Suscripción
          </a>
        </div>
      )}
    </aside>
  );
}
