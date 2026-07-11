'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Phone, PhoneCall, PhoneOutgoing, Briefcase,
  Building2, Link2, CircleUser, ChevronDown, ChevronRight, Bot,
} from 'lucide-react';

type SubItem    = { label: string; id: string };
type SubSection = { label: string; id: string; icon: React.ReactNode; items: SubItem[] };
type Section    = { id: string; label: string; icon: React.ReactNode; items: SubItem[]; subSections?: SubSection[]; directHref?: string; toggleOnly?: boolean };

interface Props {
  token:        string;
  currentTab:   string;
  hasOpsAgent:  boolean;
  showOutbound: boolean;
}

export default function PortalSidebar({ token, currentTab, hasOpsAgent, showOutbound }: Props) {
  const pathname  = usePathname();
  const [openIds, setOpenIds] = useState<string[]>([currentTab]);

  const toggle = (id: string) =>
    setOpenIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const sections: Section[] = [
    {
      id: 'inicio', label: 'Inicio', icon: <LayoutDashboard size={14} />,
      items: [
        { label: 'Resumen',    id: 'resumen' },
        { label: 'Horas pico', id: 'horas-pico' },
        { label: 'Actividad',  id: 'actividad' },
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
      items: [],
    },
    {
      id: 'llamadas', label: 'Llamadas', icon: <Phone size={14} />,
      toggleOnly: true,
      items: [],
      subSections: [
        {
          label: 'Entrantes', id: 'entrantes', icon: <PhoneCall size={12} />,
          items: [
            { label: 'Registro de llamadas', id: 'registro' },
            { label: 'Leads capturados',     id: 'leads' },
            { label: 'Pedidos',              id: 'pedidos' },
            { label: 'Citas',                id: 'citas' },
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
        { label: 'Juntas',             id: 'juntas' },
        { label: 'Onboarding',         id: 'onboarding' },
        { label: 'Consultar agente',   id: 'chat' },
      ],
    }] as Section[] : []),
    {
      id: 'integraciones', label: 'Integraciones', icon: <Link2 size={14} />,
      items: [
        { label: 'Calendario',     id: 'calendario' },
        { label: 'Notion CRM',     id: 'notion' },
        ...(hasOpsAgent ? [{ label: 'Microsoft Teams', id: 'teams' }] : []),
        { label: 'Correo',         id: 'correo' },
      ],
    },
    {
      id: 'cuenta', label: 'Cuenta', icon: <CircleUser size={14} />,
      items: [
        { label: 'Mis agentes',   id: 'agentes' },
        { label: 'Minutos y uso', id: 'minutos' },
        { label: 'Plan y cambios',id: 'plan' },
        { label: 'Facturación',   id: 'facturacion' },
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
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--c-surface-2)]"
                      style={{ color: 'var(--c-text-3)' }}
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
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--c-surface-2)]"
                                style={{ color: 'var(--c-text-3)' }}
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
    </aside>
  );
}
