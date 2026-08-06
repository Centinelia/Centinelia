import Link from 'next/link';
import OficinaBusinessChip from './OficinaBusinessChip';
import NotificationBell    from '../NotificationBell';
import PortalLogout        from '../PortalLogout';

interface Props {
  token:            string;
  businessName:     string;
  logoUrl:          string | null;
  businessOptions: { business_name: string; logo_url: string | null; first_token: string }[];
  mobileNav?:       React.ReactNode;
}

/**
 * OficinaHeaderDark — header 60px dark #1A0A3B para el shell V2 de Oficina.
 *
 * Layout co-brand tipo GitHub/Vercel:
 *   [Centinelia icon] × [Business logo/name ⌄]   [OFICINA]      [🔔] [logout]
 *
 * Comunica que Centinelia está trabajando POR el negocio del cliente,
 * separados por '×' (colaboración). BusinessChip clickable actúa como switcher
 * cuando el owner tiene >1 organización.
 */
export default function OficinaHeaderDark({ token, businessName, logoUrl, businessOptions, mobileNav }: Props) {
  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between gap-3 px-3 sm:px-5"
      style={{
        height:       60,
        background:   '#1A0A3B',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Left — co-brand + eyebrow */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {mobileNav}
        <Link
          href={`/portal/${token}?tab=inicio`}
          className="flex items-center gap-3 shrink-0"
          aria-label="Volver al portal Centinelia"
        >
          <img
            src="/logo-icon.png"
            alt="Centinelia"
            width={46}
            height={46}
            style={{ width: 46, height: 46, objectFit: 'contain', display: 'block' }}
            draggable={false}
          />
        </Link>

        {/* Divisor '×' — colaboración */}
        <span
          aria-hidden
          className="text-lg font-light shrink-0 select-none"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          ×
        </span>

        {/* Business del cliente (con switcher si multi-org) */}
        <div className="min-w-0">
          <OficinaBusinessChip
            current={{ business_name: businessName, logo_url: logoUrl, first_token: token }}
            options={businessOptions}
            currentBusinessName={businessName}
          />
        </div>

        {/* Chip OFICINA — visible en sm+ */}
        <span
          className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded shrink-0"
          style={{
            color:      '#C4B5FD',
            background: 'rgba(108,59,255,0.18)',
            border:     '1px solid rgba(108,59,255,0.35)',
          }}
        >
          Oficina
        </span>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <NotificationBell token={token} onDark />
        <PortalLogout onDark />
      </div>
    </div>
  );
}
