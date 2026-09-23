import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PrecioPage from '@/lib/precios/PrecioPage';
import { getPrecioBySlug, precioSlugs } from '@/lib/precios/data';

const BASE_URL = 'https://www.centinelia.mx';

export function generateStaticParams() {
  return precioSlugs().map(slug => ({ slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = getPrecioBySlug(slug);
  if (!data) return { title: 'Precios' };

  const canonicalUrl = `${BASE_URL}/precios/${data.slug}`;
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

export default async function PrecioComparativaPage({ params }: Params) {
  const { slug } = await params;
  const data = getPrecioBySlug(slug);
  if (!data) notFound();
  return <PrecioPage data={data} />;
}
