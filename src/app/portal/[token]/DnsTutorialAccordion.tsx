'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, HelpCircle } from 'lucide-react';

interface Provider {
  id:    string;
  label: string;
  color: string;
  steps: string[];
  docs?: string;
}

const PROVIDERS: Provider[] = [
  {
    id:    'cloudflare',
    label: 'Cloudflare',
    color: '#F38020',
    steps: [
      'Entra a dash.cloudflare.com → selecciona tu dominio.',
      'Menú lateral: DNS → Records.',
      'Click en "Add record" por cada uno de los registros de arriba. Tipo, Name y Content copiados tal cual.',
      'IMPORTANTE: en Cloudflare el toggle "Proxy status" debe quedar en gris (DNS only). Si sale naranja, tus registros TXT no funcionan.',
    ],
    docs: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
  },
  {
    id:    'godaddy',
    label: 'GoDaddy',
    color: '#00A4A6',
    steps: [
      'Entra a godaddy.com → Mis Productos → Dominios → click en tu dominio.',
      'DNS → Manage Zones (Administrar zonas DNS).',
      'Click en "Add" por cada registro. Type, Host y Value/Points to.',
      'GoDaddy pide el "Host" sin el dominio: si el registro dice "_resend._domainkey.tuempresa.com", en Host pon solo "_resend._domainkey".',
    ],
    docs: 'https://www.godaddy.com/help/add-a-txt-record-19232',
  },
  {
    id:    'namecheap',
    label: 'Namecheap',
    color: '#DE3910',
    steps: [
      'Entra a ap.www.namecheap.com → Domain List → Manage al lado de tu dominio.',
      'Tab "Advanced DNS" → sección "Host Records".',
      'Click "Add New Record". Type, Host y Value tal cual.',
      'Igual que GoDaddy: el "Host" va sin el dominio raíz.',
    ],
    docs: 'https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/',
  },
  {
    id:    'google_domains',
    label: 'Google Domains / Squarespace Domains',
    color: '#4285F4',
    steps: [
      'Google Domains cerró — si compraste ahí, ahora tu dominio vive en Squarespace Domains.',
      'Entra a account.squarespace.com → Domains → click en tu dominio.',
      'DNS → Custom Records → Add Record.',
      'Type, Host y Data (equivalente a Value).',
    ],
    docs: 'https://support.squarespace.com/hc/en-us/articles/205812348',
  },
  {
    id:    'otro',
    label: 'Otro proveedor (Hostgator, Bluehost, hosting propio)',
    color: '#6C3BFF',
    steps: [
      'Busca en el panel de tu proveedor la sección "DNS", "Zone Editor" o "DNS Manager".',
      'Crea 3 registros nuevos, uno por cada renglón de la tabla de arriba.',
      'Tipo (TXT o CNAME), Name/Host, Value/Content — copiados tal cual.',
      'Si tu proveedor pide el "Host" sin el dominio raíz, quita la parte final: "_resend._domainkey.tuempresa.com" → pon "_resend._domainkey".',
      'Si no encuentras dónde, contáctanos y te ayudamos.',
    ],
  },
];

export default function DnsTutorialAccordion() {
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('cloudflare');

  const active = PROVIDERS.find(p => p.id === activeProvider) ?? PROVIDERS[0];

  return (
    <div
      className="rounded-xl mt-4"
      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        style={{ color: '#1A0A3B' }}
      >
        <div className="flex items-center gap-2">
          <HelpCircle size={15} style={{ color: '#6C3BFF' }} />
          <span className="text-[13px] font-semibold">¿Dónde pongo estos registros DNS?</span>
        </div>
        <ChevronDown
          size={16}
          style={{
            color: '#6B6480',
            transition: 'transform 200ms',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </button>

      {open && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid #F0EDF9' }}>
          <p className="text-[12px] mt-3 mb-3 leading-relaxed" style={{ color: '#6B6480' }}>
            Los registros DNS se agregan en el panel del proveedor donde compraste o
            administras tu dominio (Cloudflare, GoDaddy, Namecheap, etc). Elige el tuyo:
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {PROVIDERS.map(p => {
              const isActive = activeProvider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveProvider(p.id)}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: isActive ? p.color : '#fff',
                    color:      isActive ? '#fff'   : '#1A0A3B',
                    border:     isActive ? `1px solid ${p.color}` : '1px solid #E8E3F5',
                    cursor:     'pointer',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-lg px-4 py-3" style={{ background: '#fff', border: '1px solid #F0EDF9' }}>
            <p className="text-[12px] font-semibold mb-2" style={{ color: active.color }}>
              Pasos para {active.label}:
            </p>
            <ol className="text-[12px] leading-relaxed space-y-1.5 list-decimal ml-4" style={{ color: '#1A0A3B' }}>
              {active.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            {active.docs && (
              <a
                href={active.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
                style={{ color: active.color }}
              >
                Documentación oficial de {active.label}
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          <p className="text-[11px] mt-3 leading-relaxed" style={{ color: '#9B8FB5' }}>
            Los registros DNS pueden tardar de unos minutos hasta 24 horas en propagarse.
            Una vez agregados, dale a &quot;Verificar configuración DNS&quot; arriba y
            cuando aparezcan como verificados en Resend, este panel mostrará el badge verde.
          </p>
        </div>
      )}
    </div>
  );
}
