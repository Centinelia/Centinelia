import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MeerkatPage from '@/lib/meerkats/MeerkatPage';
import { getMeerkatBySlug, meerkatSlugs } from '@/lib/meerkats/data';

const BASE_URL = 'https://www.centinelia.mx';

export function generateStaticParams() {
  return meerkatSlugs().map(slug => ({ slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = getMeerkatBySlug(slug);
  if (!data) return { title: 'Empleado digital' };

  const canonicalUrl = `${BASE_URL}/empleados/${data.slug}`;
  const title       = `${data.nombre}, ${data.rol.toLowerCase()} digital | Centinelia`;
  const description = data.descCorta;

  return {
    title,
    description,
    keywords: data.keywords,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url:    canonicalUrl,
      images: [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
    },
  };
}

export default async function EmpleadoDetallePage({ params }: Params) {
  const { slug } = await params;
  const data = getMeerkatBySlug(slug);
  if (!data) notFound();
  return <MeerkatPage data={data} />;
}
