import type { Metadata } from 'next';
import ComparisonPage from '@/lib/vs/ComparisonPage';
import { RETELL_AI } from '@/lib/vs/data';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title:       'Centinelia vs Retell AI: producto vs framework',
  description: 'Retell AI es una API para construir agentes de voz. Centinelia es un equipo de empleados digitales listos con portal, integraciones mexicanas, CFDI y roles predefinidos. Comparativa honesta para negocios mexicanos.',
  keywords: [
    'Centinelia vs Retell AI', 'alternativa Retell AI', 'Retell AI español',
    'agente de voz sin código', 'empleado digital vs framework voz', 'Retell México',
  ],
  alternates: { canonical: `${BASE_URL}/vs/retell-ai` },
  openGraph: {
    title:       'Centinelia vs Retell AI | Empleado digital listo vs framework para developers',
    description: 'Roles listos, portal en español, integraciones mexicanas y CFDI frente a una API que se construye desde cero.',
    url:         `${BASE_URL}/vs/retell-ai`,
    images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

export default function VsRetellAiPage() {
  return <ComparisonPage data={RETELL_AI} />;
}
