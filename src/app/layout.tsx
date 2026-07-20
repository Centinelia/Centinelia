import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const BASE_URL = 'https://www.centinelia.mx';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  manifest: '/site.webmanifest',

  title: {
    default: 'Centinelia | Construye tu oficina digital',
    template: '%s | Centinelia',
  },
  description:
    'La forma más sencilla de ampliar la capacidad de tu organización. Incorpora empleados digitales que trabajan 24/7 y construye una oficina que nunca se detiene.',
  keywords: [
    'empleados digitales IA', 'oficina digital con IA', 'agentes de voz inteligencia artificial',
    'automatización empresarial México', 'recepcionista virtual 24/7', 'atención telefónica automatizada',
    'asistente IA para negocios', 'llamadas salientes IA', 'agendamiento automático de citas',
    'Centinelia', 'México', 'Monterrey', 'empleado digital',
  ],
  authors: [{ name: 'Centinelia', url: BASE_URL }],
  creator: 'Centinelia',
  publisher: 'Centinelia',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: {
    icon: [
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/favicon-96x96.png',
  },
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    url: BASE_URL,
    siteName: 'Centinelia',
    title: 'Centinelia | Construye tu oficina digital',
    description:
      'La forma más sencilla de ampliar la capacidad de tu organización. Incorpora empleados digitales que trabajan 24/7 y construye una oficina que nunca se detiene.',
    images: [
      {
        url: `${BASE_URL}/og-centinelia.jpg`,
        width: 1950,
        height: 1024,
        alt: 'Centinelia: Construye tu oficina digital',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Centinelia | Construye tu oficina digital',
    description:
      'La forma más sencilla de ampliar la capacidad de tu organización. Incorpora empleados digitales que trabajan 24/7 y construye una oficina que nunca se detiene.',
    images: [`${BASE_URL}/og-centinelia.jpg`],
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Centinelia',
  url: BASE_URL,
  logo: `${BASE_URL}/logo-icon.png`,
  description: 'Centinelia es la plataforma de empleados digitales de IA para organizaciones mexicanas. Empleados especializados que atienden llamadas, administran correos, generan documentos y ejecutan tareas 24/7, sin costos laborales. Desde $2,997/mes.',
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+52-81-1633-3559',
    contactType: 'sales',
    availableLanguage: ['Spanish', 'English'],
    areaServed: 'MX',
  },
  sameAs: [
    'https://www.instagram.com/centinelia.mx/',
    'https://www.linkedin.com/company/centinelia/',
    'https://www.facebook.com/centineliamx/',
  ],
  foundingLocation: { '@type': 'Place', addressCountry: 'MX' },
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Centinelia',
  url: BASE_URL,
  description: 'Plataforma de empleados digitales de IA para organizaciones mexicanas. Incorpora hasta 11 empleados especializados — Nia (recepción), Noah (ventas), Nara (coordinación), Nelia (atención), Nico (cobranza) y más — que trabajan 24/7 sin IMSS, vacaciones ni ausencias. Activo en menos de 24 horas.',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'AIAssistant',
  operatingSystem: 'Web',
  inLanguage: ['es-MX', 'en'],
  availableOnDevice: ['Desktop', 'Mobile'],
  provider: {
    '@type': 'Organization',
    name: 'Centinelia',
    url: BASE_URL,
    areaServed: 'MX',
  },
  offers: [
    { '@type': 'Offer', name: 'Empleado Centinelia — Media Jornada', price: '2997', priceCurrency: 'MXN', description: '300 minutos/mes, 100 operaciones IA, empleado digital activo 24/7. Instalacion unica $14,990 MXN.' },
    { '@type': 'Offer', name: 'Empleado Centinelia — Jornada Completa', price: '5994', priceCurrency: 'MXN', description: '600 minutos/mes, 200 operaciones IA, empleado digital activo 24/7. Plan mas popular.' },
    { '@type': 'Offer', name: 'Empleado Centinelia — Alta Demanda', price: '11988', priceCurrency: 'MXN', description: '1,200 minutos/mes, 300 operaciones IA, para operaciones de alto volumen.' },
  ],
  featureList: [
    'Empleados de IA especializados por rol (Nia, Noah, Nara, Nelia, Nico, Neo, Naia, Nova y mas)',
    'Atencion telefonica entrante y saliente 24/7',
    'Administracion de correos electronicos con respuestas automaticas',
    'Generacion de documentos, propuestas y contratos',
    'Agendamiento de citas y coordinacion de equipos',
    'Captura automatica de leads y prospectos',
    'Toma de pedidos por telefono',
    'Seguimiento de tareas y delegacion entre empleados',
    'Encuestas de satisfaccion telefonica automaticas',
    'Transferencia inteligente entre empleados del equipo',
    'Memoria de cliente entre llamadas',
    'Portal de reportes, estadisticas y actividad en tiempo real',
    'Aprendizaje continuo supervisado por el dueno',
    'Sin IMSS, vacaciones, incapacidades ni reemplazos',
    'Activo en menos de 24 horas',
    'Soporte multiidioma espanol e ingles',
  ],
  screenshot: `${BASE_URL}/og-image.png`,
  countriesSupported: 'MX',
  isAccessibleForFree: false,
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: '¿Suena natural o robótico?', acceptedAnswer: { '@type': 'Answer', text: 'El agente usa voces de ElevenLabs, la misma tecnología que usan estudios de doblaje y plataformas globales. La mayoría de los clientes no notan la diferencia.' } },
    { '@type': 'Question', name: '¿Qué pasa si el agente no sabe responder algo?', acceptedAnswer: { '@type': 'Answer', text: 'El agente reconoce sus límites. Si no tiene la información, lo dice con honestidad y ofrece tomar los datos del cliente para que el equipo le llame de regreso. Nunca inventa respuestas ni da información incorrecta.' } },
    { '@type': 'Question', name: '¿Cuánto tiempo tarda en estar activo?', acceptedAnswer: { '@type': 'Answer', text: 'Menos de 24 horas. Después de contratar, accedes al portal, agregas la información de tu negocio y el agente queda listo. No necesitas saber de tecnología.' } },
    { '@type': 'Question', name: '¿Funciona para mi tipo de negocio?', acceptedAnswer: { '@type': 'Answer', text: 'Funciona para cualquier negocio que reciba llamadas: clínicas, restaurantes, despachos, inmobiliarias, tiendas, academias y más. El agente aprende sobre tu negocio específico, no es un bot genérico.' } },
    { '@type': 'Question', name: '¿Puedo cancelar cuando quiera?', acceptedAnswer: { '@type': 'Answer', text: 'Sí, sin penalizaciones ni trámites. No hay contratos de permanencia. Si decides cancelar, el servicio termina al final del ciclo de facturación.' } },
    { '@type': 'Question', name: '¿Qué pasa si el agente comete un error?', acceptedAnswer: { '@type': 'Answer', text: 'Tienes acceso a las grabaciones y transcripciones de cada llamada desde tu portal. Si algo no quedó bien, lo ajustas en la configuración en tiempo real y el cambio se aplica en minutos.' } },
    { '@type': 'Question', name: '¿Mis clientes van a saber que están hablando con una IA?', acceptedAnswer: { '@type': 'Answer', text: 'El agente habla de forma natural y no menciona proactivamente que es un asistente automatizado. Si algún cliente pregunta directamente, el agente responde con honestidad. Puedes personalizar el nombre y la voz del agente.' } },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${sora.variable} ${dmSans.variable} h-full antialiased`}
    >
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
            />
            <Script
              id="ga4-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA_ID}');`,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
