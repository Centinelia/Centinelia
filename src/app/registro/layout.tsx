import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contrata tu agente de voz con IA',
  description: 'Activa un agente de voz con IA para tu negocio en menos de 24 horas. Plan Comercial desde $8,990 instalación + paquetes mensuales desde $2,997. Sin contratos largos.',
  alternates: {
    canonical: 'https://www.centinelia.mx/registro',
  },
  openGraph: {
    title: 'Contrata tu agente de voz con IA | Centinelia',
    description: 'Activa un agente de voz con IA para tu negocio en menos de 24 horas. Plan Comercial desde $8,990 instalación + paquetes mensuales desde $2,997.',
    url: 'https://www.centinelia.mx/registro',
  },
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
