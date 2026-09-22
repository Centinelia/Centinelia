import type { Metadata } from 'next';
import ComparisonPage from '@/lib/vs/ComparisonPage';
import { BLAND_AI } from '@/lib/vs/data';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title:       'Centinelia vs Bland AI: cuál conviene para negocios mexicanos',
  description: 'Comparación honesta entre Centinelia y Bland AI. Precio en pesos, español mexicano, timbrado CFDI, portal para el dueño e integraciones locales frente a la plataforma para developers en dólares.',
  keywords: [
    'Centinelia vs Bland AI', 'alternativa Bland AI México', 'Bland AI español',
    'agente de voz México', 'recepcionista virtual México', 'empleado digital vs Bland AI',
  ],
  alternates: { canonical: `${BASE_URL}/vs/bland-ai` },
  openGraph: {
    title:       'Centinelia vs Bland AI | Comparación honesta para negocios mexicanos',
    description: 'Empleados digitales listos con CFDI, español mexicano y precio en pesos, frente a la plataforma para developers de Bland AI.',
    url:         `${BASE_URL}/vs/bland-ai`,
    images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

export default function VsBlandAiPage() {
  return <ComparisonPage data={BLAND_AI} />;
}
