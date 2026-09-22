import type { Metadata } from 'next';
import ComparisonPage from '@/lib/vs/ComparisonPage';
import { VAPI } from '@/lib/vs/data';

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  title:       'Centinelia vs Vapi.ai: infraestructura vs producto terminado',
  description: 'Vapi.ai es la infraestructura de voz que Centinelia usa por debajo. Encima construimos portal, roles, CFDI, integraciones mexicanas y coordinación multi-empleado. Comparativa honesta sobre cuándo conviene cada uno.',
  keywords: [
    'Centinelia vs Vapi', 'alternativa Vapi México', 'Vapi español',
    'agente de voz México sin código', 'empleado digital vs Vapi',
  ],
  alternates: { canonical: `${BASE_URL}/vs/vapi` },
  openGraph: {
    title:       'Centinelia vs Vapi.ai | Producto de empleados digitales vs infraestructura de voz',
    description: 'Portal, roles listos, integraciones mexicanas, timbrado CFDI y coordinación multi-empleado sobre la orquestación de voz de Vapi.',
    url:         `${BASE_URL}/vs/vapi`,
    images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
  },
};

export default function VsVapiPage() {
  return <ComparisonPage data={VAPI} />;
}
