import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diseña tu oficina digital a la medida',
  description: 'Cuéntanos sobre tu organización y armamos una propuesta personalizada. Múltiples empleados digitales, sucursales, integraciones y flujos a tu medida. Respondemos en menos de 24 h.',
  alternates: {
    canonical: 'https://www.centinelia.mx/cotizar',
  },
  openGraph: {
    title: 'Diseña tu oficina digital a la medida | Centinelia',
    description: 'Múltiples empleados digitales, sucursales, integraciones y flujos personalizados. Cotiza sin compromiso.',
    url: 'https://www.centinelia.mx/cotizar',
  },
};

export default function CotizarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
