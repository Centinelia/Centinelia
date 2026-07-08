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
    default: 'Centinelia: Tu negocio nunca pierde una llamada',
    template: '%s | Centinelia',
  },
  description:
    'Agentes de voz con IA que atienden las llamadas de tu negocio 24/7. Agenda citas, captura leads y realiza llamadas salientes, sin que tú estés presente. Desde $2,997/mes.',
  keywords: [
    'agente de voz IA', 'inteligencia artificial para negocios', 'recepcionista virtual',
    'atención telefónica automatizada', 'chatbot de voz', 'agenda citas automática',
    'captura de leads por teléfono', 'llamadas salientes IA', 'Centinelia', 'México',
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
    title: 'Centinelia: Tu negocio nunca pierde una llamada',
    description:
      'Agentes de voz con IA que atienden las llamadas de tu negocio 24/7. Agenda citas, captura leads y realiza llamadas salientes, desde $2,997/mes.',
    images: [
      {
        url: '/og-image.png?v=2',
        width: 1200,
        height: 630,
        alt: 'Centinelia: Agentes de voz con IA para tu negocio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Centinelia: Tu negocio nunca pierde una llamada',
    description:
      'Agentes de voz con IA que atienden las llamadas de tu negocio 24/7. Entrantes y salientes, desde $2,997/mes.',
    images: ['/og-image.png?v=2'],
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Centinelia',
  url: BASE_URL,
  logo: `${BASE_URL}/logo-icon.png`,
  description: 'Agentes de voz con inteligencia artificial que atienden las llamadas de tu negocio 24/7. Captura leads, agenda citas, toma pedidos y realiza llamadas salientes, desde $2,997/mes.',
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
