'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Palette, ChevronDown } from 'lucide-react';

interface Props {
  token:               string;
  logoUrl:             string | null;
  businessName:        string;
  agentName:           string;
  initialColor:        string;
  initialColorSecondary: string;
  initialWebsite:      string;
  initialAddress:      string;
  initialPhone:        string;
  initialFooter:       string;
}

const PRESET_COLORS = [
  '#6C3BFF', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
  '#000000', '#475569',
];

export default function BrandKitEditor({
  token, logoUrl, businessName, agentName,
  initialColor, initialColorSecondary, initialWebsite, initialAddress, initialPhone, initialFooter,
}: Props) {
  const [color,    setColor]    = useState(initialColor          || '#6C3BFF');
  const [color2,   setColor2]   = useState(initialColorSecondary || '');
  const [website,  setWebsite]  = useState(initialWebsite        || '');
  const [phone,    setPhone]    = useState(initialPhone          || '');
  const [address,  setAddress]  = useState(initialAddress        || '');
  const [footer,   setFooter]   = useState(initialFooter         || '');
  const [colorOpen,  setColorOpen]  = useState(false);
  const [color2Open, setColor2Open] = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [saving,   startSave]   = useTransition();

  function save() {
    setSaved(false);
    startSave(async () => {
      await fetch(`/api/portal/${token}/brand`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email_brand_color:     color,
          brand_color_secondary: color2  || null,
          email_footer_text:     footer  || null,
          brand_website:         website || null,
          brand_address:         address || null,
          brand_phone:           phone   || null,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Color de marca ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
        <button
          type="button"
          onClick={() => setColorOpen(p => !p)}
          className="flex items-center gap-2.5 w-full text-left px-4 py-3 transition-colors hover:bg-[#F5F2FB]"
        >
          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: '0 1px 2px rgba(26,10,59,0.08)' }} />
          <p className="text-[11px] font-medium tracking-widest uppercase flex-1" style={{ color: '#9B8FB5' }}>
            Color de marca
          </p>
          <code className="text-[12px] font-medium" style={{ color: '#1A0A3B' }}>{color}</code>
          <ChevronDown size={14} style={{ color: '#9B8FB5', transform: colorOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        </button>
        {colorOpen && (
          <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid #F0EDF9' }}>
            <div className="flex flex-wrap gap-2 mt-3">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  title={c}
                  className="w-8 h-8 rounded-lg transition-transform hover:scale-110 flex-shrink-0"
                  style={{
                    background:  c,
                    outline:     color === c ? `2.5px solid ${c}` : 'none',
                    outlineOffset: '2px',
                    border:      '1px solid rgba(0,0,0,0.08)',
                  }}
                />
              ))}
              <label
                title="Color personalizado"
                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform flex-shrink-0"
                style={{ border: '1.5px dashed #E8E3F5', background: '#ffffff' }}>
                <Palette size={13} style={{ color: '#6B6480' }} />
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="sr-only" />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ── Color secundario ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
        <button
          type="button"
          onClick={() => setColor2Open(p => !p)}
          className="flex items-center gap-2.5 w-full text-left px-4 py-3 transition-colors hover:bg-[#F5F2FB]"
        >
          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: color2 || 'transparent', border: color2 ? 'none' : '1.5px dashed #9B8FB5' }} />
          <p className="text-[11px] font-medium tracking-widest uppercase flex-1" style={{ color: '#9B8FB5' }}>
            Color secundario <span className="normal-case font-normal ml-1">(opcional)</span>
          </p>
          {color2
            ? <code className="text-[12px] font-medium" style={{ color: '#1A0A3B' }}>{color2}</code>
            : <span className="text-[12px]" style={{ color: '#9B8FB5' }}>ninguno</span>
          }
          <ChevronDown size={14} style={{ color: '#9B8FB5', transform: color2Open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        </button>
        {color2Open && (
          <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid #F0EDF9' }}>
            <div className="flex flex-wrap gap-2 mt-3">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor2(color2 === c ? '' : c)}
                  title={c}
                  className="w-8 h-8 rounded-lg transition-transform hover:scale-110 flex-shrink-0"
                  style={{
                    background:    c,
                    outline:       color2 === c ? `2.5px solid ${c}` : 'none',
                    outlineOffset: '2px',
                    border:        '1px solid rgba(0,0,0,0.08)',
                  }}
                />
              ))}
              <label
                title="Color personalizado"
                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform flex-shrink-0"
                style={{ border: '1.5px dashed #E8E3F5', background: '#ffffff' }}>
                <Palette size={13} style={{ color: '#6B6480' }} />
                <input type="color" value={color2 || '#000000'} onChange={e => setColor2(e.target.value)}
                  className="sr-only" />
              </label>
            </div>
            {color2 && (
              <button onClick={() => setColor2('')} className="text-[11px] mt-3" style={{ color: '#6B6480' }}>Quitar color secundario</button>
            )}
          </div>
        )}
      </div>

      {/* ── Datos de contacto ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
            Sitio web
          </label>
          <input
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="https://tuempresa.mx"
            className="w-full text-[13px] rounded-lg px-3 py-2 outline-none"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
            Teléfono de contacto
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="81 1234 5678"
            className="w-full text-[13px] rounded-lg px-3 py-2 outline-none"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
            Dirección física
          </label>
          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Av. Principal 123, Ciudad"
            className="w-full text-[13px] rounded-lg px-3 py-2 outline-none"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          Pie de página de documentos y correos
        </label>
        <input
          type="text"
          value={footer}
          onChange={e => setFooter(e.target.value)}
          placeholder="Horario: Lun a Vie 9am a 6pm. Tel: 81 1234 5678"
          className="w-full text-[13px] rounded-lg px-3 py-2 outline-none"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
        />
      </div>

      {/* ── Preview ── */}
      <EmailPreview
        logoUrl={logoUrl}
        businessName={businessName}
        agentName={agentName}
        color={color}
        color2={color2}
        address={address}
        website={website}
        footer={footer}
      />

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
          style={{ background: color, color: '#fff', boxShadow: `0 1px 2px ${color}3d` }}>
          {saving
            ? <Loader2 size={14} className="animate-spin" />
            : saved
            ? <Check size={14} />
            : null}
          {saving ? 'Guardando' : saved ? 'Guardado' : 'Guardar branding'}
        </button>
      </div>

    </div>
  );
}

// ── Inline email preview ────────────────────────────────────────────────────

function EmailPreview({ logoUrl, businessName, agentName, color, color2, address, website, footer }: {
  logoUrl:      string | null;
  businessName: string;
  agentName:    string;
  color:        string;
  color2:       string;
  address:      string;
  website:      string;
  footer:       string;
}) {
  const accent = color2 || color;
  const BORDER = `${color}22`;
  const TEXT   = '#1A0A3B';
  const SUB    = 'rgba(26,10,59,0.55)';

  return (
    <div>
      <p className="text-xs mb-2 font-semibold tracking-widest uppercase" style={{ color: '#6B6480' }}>
        Vista previa del email
      </p>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #F0EDF9', background: '#F8F7FF', fontSize: 12 }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', textAlign: 'center', borderBottom: `1px solid ${BORDER}` }}>
          {logoUrl
            ? <img src={logoUrl} alt={businessName} style={{ maxHeight: 40, maxWidth: 160, display: 'inline-block', objectFit: 'contain' }} />
            : <span style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{businessName}</span>
          }
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{ display: 'inline-block', background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 20, padding: '4px 12px', color, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Cita confirmada
            </span>
          </div>
          <p style={{ color: TEXT, fontSize: 14, fontWeight: 700, margin: '0 0 4px', textAlign: 'center' }}>Hola, María</p>
          <p style={{ color: SUB, fontSize: 12, margin: '0 0 14px', textAlign: 'center' }}>Tu cita en <strong>{businessName}</strong> quedó registrada.</p>
          <div style={{ background: `${accent}08`, border: `1px solid ${accent}18`, borderRadius: 10, padding: '10px 16px', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ color: SUB, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Fecha</span>
              <span style={{ color: TEXT, fontWeight: 600 }}>Lunes 14 de julio, 2026</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: SUB, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Servicio</span>
              <span style={{ color: TEXT }}>Consulta general</span>
            </div>
          </div>
          <p style={{ color: 'rgba(26,10,59,0.3)', fontSize: 11, margin: '14px 0 0' }}>
            {agentName}, {businessName}
          </p>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 24px', textAlign: 'center' }}>
          {footer && <p style={{ color: 'rgba(26,10,59,0.4)', fontSize: 10, margin: '0 0 2px', lineHeight: 1.6 }}>{footer}</p>}
          {(address || website) && (
            <p style={{ color: 'rgba(26,10,59,0.3)', fontSize: 10, margin: 0, lineHeight: 1.6 }}>
              {[address, website].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
