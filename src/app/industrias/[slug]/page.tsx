import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import IndustryPage from '@/lib/industrias/IndustryPage';
import { getIndustryBySlug, industrySlugs } from '@/lib/industrias/data';

const BASE_URL = 'https://www.centinelia.mx';

export function generateStaticParams() {
  return industrySlugs().map(slug => ({ slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = getIndustryBySlug(slug);
  if (!data) return { title: 'Industria' };

  const canonicalUrl = `${BASE_URL}/industrias/${data.slug}`;
  return {
    title:       data.metaTitle,
    description: data.metaDescription,
    keywords:    data.keywords,
    alternates:  { canonical: canonicalUrl },
    openGraph: {
      title:       `${data.metaTitle} | Centinelia`,
      description: data.metaDescription,
      url:         canonicalUrl,
      images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
    },
  };
}

export default async function IndustriaDetallePage({ params }: Params) {
  const { slug } = await params;
  const data = getIndustryBySlug(slug);
  if (!data) notFound();
  return <IndustryPage data={data} />;
}
