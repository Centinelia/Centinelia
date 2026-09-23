import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import Script from "next/script";
import WebVitalsReporter from "@/components/WebVitalsReporter";
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
    'Contesta el teléfono, cotiza, factura, cobra y agenda. Sin contratar a nadie. Empleados digitales especializados que trabajan 24/7 y empiezan el próximo lunes. Desde $2,997 al mes más IVA.',
  keywords: [
    'empleados digitales', 'oficina digital', 'recepcionista virtual 24/7',
    'atención telefónica sin contratar', 'automatización empresarial México',
    'asistente virtual para negocios', 'llamadas salientes automatizadas',
    'agendamiento automático de citas', 'facturación CFDI automática',
    'Centinelia', 'México', 'Monterrey',
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
    title: 'Centinelia | Empleados digitales para tu negocio',
    description:
      'Contesta el teléfono, cotiza, factura, cobra y agenda. Sin contratar a nadie. Empleados digitales especializados que trabajan 24/7 y empiezan el próximo lunes.',
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
    title: 'Centinelia | Empleados digitales para tu negocio',
    description:
      'Contesta el teléfono, cotiza, factura, cobra y agenda. Sin contratar a nadie. Empleados digitales especializados que trabajan 24/7 y empiezan el próximo lunes.',
    images: [`${BASE_URL}/og-centinelia.jpg`],
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Centinelia',
  url: BASE_URL,
  logo: `${BASE_URL}/logo-icon.png`,
  description: 'Centinelia es la plataforma de empleados digitales para organizaciones mexicanas. Contestan el teléfono, cotizan, facturan, cobran y agendan 24/7 sin costos laborales de un humano. Desde $2,997 al mes más IVA.',
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

// LocalBusiness schema para señal local en AI Overviews (Gemini), Bing Copilot
// y directorios locales. Referencia geo aproximada: Monterrey centro histórico.
const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${BASE_URL}/#localbusiness`,
  name: 'Centinelia',
  url: BASE_URL,
  image: `${BASE_URL}/logo-icon.png`,
  telephone: '+52-81-1633-3559',
  email: 'hola@centinelia.mx',
  description: 'Empleados digitales que contestan el teléfono, cotizan, facturan, cobran y agendan 24/7 para organizaciones mexicanas.',
  priceRange: '$2,997 MXN - $11,988 MXN mensuales',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Monterrey',
    addressRegion: 'Nuevo León',
    addressCountry: 'MX',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 25.6866,
    longitude: -100.3161,
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
  ],
  areaServed: [
    { '@type': 'Country', name: 'México' },
    { '@type': 'AdministrativeArea', name: 'Nuevo León' },
    { '@type': 'City', name: 'Monterrey' },
    { '@type': 'City', name: 'Ciudad de México' },
    { '@type': 'City', name: 'Guadalajara' },
  ],
  sameAs: [
    'https://www.instagram.com/centinelia.mx/',
    'https://www.linkedin.com/company/centinelia/',
    'https://www.facebook.com/centineliamx/',
  ],
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Centinelia',
  url: BASE_URL,
  description: 'Empleados digitales especializados por rol para organizaciones mexicanas. Nia contesta llamadas, Noah cierra ventas, Nara coordina, Nelia da atención al cliente, Nico cobra, Nala factura CFDIs, Nova despacha equipos en campo, Nalú lleva tesorería, Nami controla inventarios y más. Trabajan 24/7 sin IMSS, aguinaldo ni ausencias. Activo en menos de 24 horas.',
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
    // NOTA: mantener sincronizado con JORNADA_CONFIG.combinada en
    // src/lib/billing/plans.ts (source of truth). Rich snippets de Google
    // muestran estas cifras; si divergen del producto real, expone a queja.
    { '@type': 'Offer', name: 'Empleado Centinelia, Media Jornada', price: '2997', priceCurrency: 'MXN', description: '250 minutos de llamadas y 300 tareas de oficina al mes. Trabaja 24/7. Incorporación única $14,990 más IVA. Precio mensual más IVA.' },
    { '@type': 'Offer', name: 'Empleado Centinelia, Jornada Completa', price: '5994', priceCurrency: 'MXN', description: '500 minutos de llamadas y 600 tareas de oficina al mes. Trabaja 24/7. El plan más popular. Precio mensual más IVA.' },
    { '@type': 'Offer', name: 'Empleado Centinelia, Alta Demanda', price: '11988', priceCurrency: 'MXN', description: '1,000 minutos de llamadas y 1,200 tareas de oficina al mes. Para operaciones de alto volumen. Precio mensual más IVA.' },
  ],
  featureList: [
    'Empleados digitales especializados por rol (Nia, Noah, Nara, Nelia, Nico, Neo, Naia, Nova, Nala, Nalú, Nami y más)',
    'Contesta el teléfono 24/7, entrante y saliente',
    'Administra correo electrónico con respuestas automáticas',
    'Genera documentos, propuestas y contratos',
    'Agenda citas y coordina equipos',
    'Captura leads y prospectos',
    'Toma pedidos por teléfono',
    'Timbra facturas CFDI con PAC del cliente',
    'Concilia banca y entrega reportes financieros diarios',
    'Controla inventarios y dispara reposiciones',
    'Despacha equipos y coordina operaciones en campo',
    'Portal de reportes, estadísticas y actividad en tiempo real',
    'Aprendizaje continuo supervisado por el dueño',
    'Sin IMSS, aguinaldo, vacaciones, PTU ni ausencias',
    'Activo en menos de 24 horas',
    'Español mexicano nativo, inglés opcional',
  ],
  screenshot: `${BASE_URL}/og-image.png`,
  countriesSupported: 'MX',
  isAccessibleForFree: false,
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: '¿Esto es un chatbot?', acceptedAnswer: { '@type': 'Answer', text: 'No. Un chatbot solo responde texto en una ventana. Un empleado digital de Centinelia contesta el teléfono, manda correos y usa tus sistemas como cualquier persona del equipo.' } },
    { '@type': 'Question', name: '¿Suena natural o robótico?', acceptedAnswer: { '@type': 'Answer', text: 'El empleado digital usa voces de calidad profesional. La mayoría de los clientes no notan la diferencia. Puedes probarlo ahora mismo desde la landing: Nia te llama al teléfono en menos de 60 segundos.' } },
    { '@type': 'Question', name: '¿Qué pasa si el empleado digital no sabe responder algo?', acceptedAnswer: { '@type': 'Answer', text: 'Reconoce sus límites. Si no tiene la información, lo dice con honestidad y ofrece tomar los datos del cliente para que el equipo le llame de regreso. Nunca inventa respuestas.' } },
    { '@type': 'Question', name: '¿Cuánto tiempo tarda en estar activo?', acceptedAnswer: { '@type': 'Answer', text: 'Menos de 24 horas. Después de contratar, accedes al portal, capturas la información de tu negocio y tu empleado digital queda listo. No necesitas saber de tecnología.' } },
    { '@type': 'Question', name: '¿Manda WhatsApp?', acceptedAnswer: { '@type': 'Answer', text: 'Por ahora no. Los empleados digitales trabajan por teléfono, chat de portal y correo. WhatsApp saliente al cliente final no está en producto todavía.' } },
    { '@type': 'Question', name: '¿Y si necesito un rol que no está en el catálogo?', acceptedAnswer: { '@type': 'Answer', text: 'Lo diseñamos a la medida. Empezamos con un diagnóstico de tu operación, automatizamos lo que necesita quedar listo antes, y luego incorporamos al empleado. Consultoría y automatización desde $60,000 más IVA.' } },
    { '@type': 'Question', name: '¿Puedo cancelar cuando quiera?', acceptedAnswer: { '@type': 'Answer', text: 'Sí, sin penalizaciones ni trámites. No hay contratos de permanencia. Si decides cancelar, el servicio termina al final del ciclo de facturación.' } },
    { '@type': 'Question', name: '¿Qué pasa si comete un error?', acceptedAnswer: { '@type': 'Answer', text: 'Tienes acceso a las grabaciones y transcripciones de cada llamada desde tu portal. Si algo no quedó bien, lo ajustas en la configuración en tiempo real y el cambio se aplica en minutos. Nox y Niva, los directores digitales, revisan al resto del equipo automáticamente.' } },
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Web Vitals reales (CLS, LCP, INP, FCP, TTFB, FID) → GA4 como
            custom events. Ver src/components/WebVitalsReporter.tsx para
            cómo leer los datos en GA. */}
        {process.env.NEXT_PUBLIC_GA_ID && <WebVitalsReporter />}
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
