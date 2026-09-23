import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostPage from '@/lib/blog/PostPage';
import { getPostBySlug, postSlugs } from '@/lib/blog/registry';

const BASE_URL = 'https://www.centinelia.mx';

export function generateStaticParams() {
  return postSlugs().map(slug => ({ slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = getPostBySlug(slug);
  if (!data) return { title: 'Blog' };

  const canonicalUrl = `${BASE_URL}/blog/${data.slug}`;

  return {
    title:       data.metaTitle,
    description: data.metaDescription,
    keywords:    data.keywords,
    alternates:  { canonical: canonicalUrl },
    openGraph: {
      type:        'article',
      title:       data.metaTitle,
      description: data.metaDescription,
      url:         canonicalUrl,
      images:      [{ url: '/og-image.png?v=2', width: 1200, height: 630 }],
      publishedTime: data.datePublished,
      authors:       [data.autor],
    },
  };
}

export default async function PostDetallePage({ params }: Params) {
  const { slug } = await params;
  const data = getPostBySlug(slug);
  if (!data) notFound();
  return <PostPage data={data} />;
}
