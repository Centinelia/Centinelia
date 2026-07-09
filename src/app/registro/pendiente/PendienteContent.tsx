'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle, Mail, Clock } from 'lucide-react';

export default function PendienteContent() {
  const params = useSearchParams();
  const token  = params.get('token');

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0D0621' }}>
      <div className="w-full max-w-md text-center">

        {/* Success icon */}
        <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{
            background:  'rgba(34,197,94,0.15)',
            border:      '2px solid rgba(34,197,94,0.3)',
            boxShadow:   '0 0 40px rgba(34,197,94,0.2)',
          }}>
          <CheckCircle size={36} color="#22c55e" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">¡Pago confirmado!</h1>
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Tu empleado telefónico IA está siendo configurado. En unos minutos recibirás un correo con acceso a tu portal.
        </p>

        {/* Steps */}
        <div className="rounded-2xl p-5 text-left mb-6"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Próximos pasos
          </p>
          <div className="flex flex-col gap-4">
            <Step n={1} icon={<Mail size={15} />} title="Revisa tu correo" desc="Te enviamos un enlace para configurar tu contraseña de acceso al portal." done />
            <Step n={2} icon={<Clock size={15} />} title="Asignación de número" desc="En las próximas horas habilitamos tu número de teléfono dedicado." />
            <Step n={3} icon={<span className="text-sm">⚡</span>} title="Tu empleado entra en línea" desc="Te avisamos por WhatsApp cuando tu empleado esté listo para atender llamadas." />
          </div>
        </div>

        {/* Direct portal link if token is available */}
        {token && (
          <a
            href={`/portal/${token}/setup`}
            className="block w-full py-3.5 rounded-2xl font-semibold text-sm text-white text-center transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}>
            Configurar mi acceso al portal
          </a>
        )}

        <p className="text-xs mt-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
          ¿Tienes dudas? Escríbenos a <span style={{ color: '#9B6DFF' }}>hola@centinelia.mx</span>
        </p>
      </div>
    </div>
  );
}

function Step({ n, icon, title, desc, done }: {
  n: number; icon: React.ReactNode; title: string; desc: string; done?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: done ? 'rgba(34,197,94,0.2)'    : 'rgba(108,59,255,0.15)',
          border:     `1px solid ${done ? 'rgba(34,197,94,0.4)' : 'rgba(108,59,255,0.3)'}`,
          color:      done ? '#22c55e' : '#9B6DFF',
        }}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: done ? '#22c55e' : '#E2D9FF' }}>{title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
      </div>
    </div>
  );
}
