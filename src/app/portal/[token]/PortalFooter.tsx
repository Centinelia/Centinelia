import { Mail, MessageCircle, Star } from 'lucide-react';
import BugReportButton from './BugReportButton';

interface Props {
  noSidebar?: boolean;
  token?:     string;
}

export default async function PortalFooter({ noSidebar = false, token }: Props) {
  const wa         = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '+52 811 633 3559').replace(/\D/g, '');
  const email      = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
  const reviewUrl  = process.env.NEXT_PUBLIC_CENTINELIA_REVIEW_URL ?? '';

  // Reportes de fallas: siempre disponibles (2026-08-06). No consumen
  // tareas ni minutos y el ciclo de feedback es crítico.
  const showBugReport = !!token;

  const contactoBlock = (
    <div className="flex flex-col gap-1">
      <p className="text-[10px]" style={{ color: '#9B8FB5' }}>Contacto</p>
      <div className="flex items-center gap-2">
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <MessageCircle size={12} />
          WhatsApp
        </a>
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          <Mail size={12} />
          Correo
        </a>
      </div>
    </div>
  );

  const poweredByBlock = (
    <span className="text-xs" style={{ color: '#9B8FB5' }}>
      Powered by{' '}
      <a
        href="https://pneumastudio.mx"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:opacity-80 transition-opacity"
        style={{ color: '#9B8FB5' }}
      >
        Pneuma Studio
      </a>
    </span>
  );

  return (
    <div
      className="mt-auto px-4 sm:px-6 pt-3 pb-24 md:pb-6 shrink-0 relative"
      style={{ borderTop: '1px solid #E8E3F5' }}
    >
      {/* Mobile layout: Contacto ↔ Reportar falla en su posición natural.
          Powered by absolute anclado al footer, alineado con el centro de los FABs. */}
      <div className="sm:hidden">
        <div className="flex items-start justify-between gap-3">
          {contactoBlock}
          {showBugReport && token && (
            <div className="pt-4">
              <BugReportButton token={token} variant="link" />
            </div>
          )}
        </div>
      </div>
      <div className="sm:hidden absolute inset-x-0 bottom-9 flex justify-center">
        {poweredByBlock}
      </div>

      {/* Desktop layout: 3-col grid (contacto · review+bug · powered by) */}
      <div className="hidden sm:grid grid-cols-3 items-center">
        {/* Left — contact */}
        <div className={noSidebar ? 'ml-20 md:ml-72' : 'ml-20'}>
          {contactoBlock}
        </div>

        {/* Center — review CTA + bug report */}
        <div className="flex flex-row items-center justify-center gap-6">
          {reviewUrl && (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
            >
              <div className="flex items-center gap-0.5">
                {[0,1,2,3,4].map(i => <Star key={i} size={11} fill="#FBBF24" color="#FBBF24" />)}
              </div>
              <p className="text-[10px]" style={{ color: '#9B8FB5' }}>¿Te gusta Centinelia?</p>
              <p className="text-[10px] font-semibold" style={{ color: '#9B6DFF' }}>Déjanos una reseña</p>
            </a>
          )}
          {showBugReport && token && (
            <BugReportButton token={token} variant="link" />
          )}
        </div>

        {/* Right — powered by */}
        <div className="flex justify-end mr-20 self-end">
          {poweredByBlock}
        </div>
      </div>
    </div>
  );
}
