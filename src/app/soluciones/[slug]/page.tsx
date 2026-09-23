import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SolucionPage from '@/lib/soluciones/SolucionPage';
import { getSolucionBySlug, solucionSlugs } from '@/lib/soluciones/data';

const BASE_URL = 'https://www.centinelia.mx';

export function generateStaticParams() {
  return solucionSlugs().map(slug => ({ slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = getSolucionBySlug(slug);
  if (!data) return { title: 'Soluciones' };

  const canonicalUrl = `${BASE_URL}/soluciones/${data.slug}`;
  return {
    title:       data.metaTitle,
    description: data.metaDescription,
    keywords:    data.keywords,
    alternates:  { canonical: canonicalUrl },
    openGraph: {
      title:       data.metaTitle,
      description: data.metaDescription,
      url:         canonicalUrl,
      images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
    },
  };
}

export default async function SolucionDetallePage({ params }: Params) {
  const { slug } = await params;
  const data = getSolucionBySlug(slug);
  if (!data) notFound();
  return <SolucionPage data={data} />;
}
