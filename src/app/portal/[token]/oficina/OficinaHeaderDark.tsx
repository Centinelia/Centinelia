import Link from 'next/link';
import BusinessSwitcher from '../BusinessSwitcher';
import NotificationBell from '../NotificationBell';
import PortalLogout    from '../PortalLogout';

interface Props {
  token:            string;
  businessName:     string;
  logoUrl:          string | null;
  businessOptions: { business_name: string; logo_url: string | null; first_token: string }[];
}

/**
 * OficinaHeaderDark — header 48px dark #1A0A3B para el shell V2 de Oficina.
 *
 * Diseño 'workspace mode': compacto, minimalista, con chip 'OFICINA' que
 * comunica que estás en una sección distinta del portal principal. Todos
 * los controles (business switcher, notification, logout) en variante onDark.
 */
export default function OficinaHeaderDark({ token, businessName, logoUrl, businessOptions }: Props) {
  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between gap-3 px-3 sm:px-5"
      style={{
        height:       60,
        background:   '#1A0A3B',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Left — brand + eyebrow + switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={`/portal/${token}?tab=inicio`}
          className="flex items-center gap-3 shrink-0"
          aria-label="Volver al portal"
        >
          <img
            src="/logo-icon.png"
            alt="Centinelia"
            width={46}
            height={46}
            style={{ width: 46, height: 46, objectFit: 'contain', display: 'block' }}
            draggable={false}
          />
          <span
            className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded"
            style={{
              color:      '#C4B5FD',
              background: 'rgba(108,59,255,0.18)',
              border:     '1px solid rgba(108,59,255,0.35)',
            }}
          >
            Oficina
          </span>
        </Link>

        <div className="min-w-0">
          <BusinessSwitcher
            current={{ business_name: businessName, logo_url: logoUrl, first_token: token }}
            options={businessOptions}
            currentBusinessName={businessName}
          />
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <NotificationBell token={token} onDark />
        <PortalLogout onDark />
      </div>
    </div>
  );
}
