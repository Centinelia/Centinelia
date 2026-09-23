import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TerminoPage from '@/lib/glosario/TerminoPage';
import { getTerminoBySlug, terminoSlugs } from '@/lib/glosario/data';

const BASE_URL = 'https://www.centinelia.mx';

export function generateStaticParams() {
  return terminoSlugs().map(slug => ({ slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = getTerminoBySlug(slug);
  if (!data) return { title: 'Glosario' };

  const canonicalUrl = `${BASE_URL}/glosario/${data.slug}`;
  const heading      = data.siglas ? `${data.termino} (${data.siglas})` : data.termino;

  return {
    title:       `${heading}: definición para negocios mexicanos`,
    description: data.definicionCorta,
    keywords:    data.keywords,
    alternates:  { canonical: canonicalUrl },
    openGraph: {
      title:       `${heading} | Glosario Centinelia`,
      description: data.definicionCorta,
      url:         canonicalUrl,
      images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
    },
  };
}

export default async function TerminoDetallePage({ params }: Params) {
  const { slug } = await params;
  const data = getTerminoBySlug(slug);
  if (!data) notFound();
  return <TerminoPage data={data} />;
}
