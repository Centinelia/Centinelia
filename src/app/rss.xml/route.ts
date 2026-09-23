import { postsSortedByDate } from '@/lib/blog/registry';

// RSS 2.0 feed del blog. Los LLMs y agregadores lo consumen para descubrir
// contenido nuevo. Genera automáticamente desde el registro central.

const BASE_URL = 'https://www.centinelia.mx';

export const dynamic  = 'force-static';
export const revalidate = 3600;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

function pubDate(iso: string): string {
  // RFC 822 (RSS spec). Ej: "Wed, 23 Sep 2026 00:00:00 GMT"
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toUTCString();
}

export function GET(): Response {
  const posts = postsSortedByDate();
  const lastBuildDate = new Date().toUTCString();

  const items = posts.map(p => {
    const url = `${BASE_URL}/blog/${p.slug}`;
    return `
    <item>
      <title>${xmlEscape(p.titulo)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate(p.datePublished)}</pubDate>
      <description>${xmlEscape(p.subtitulo)}</description>
      <category>${xmlEscape(p.categoria)}</category>
      <author>hola@centinelia.mx (${xmlEscape(p.autor)})</author>
    </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Centinelia — Blog</title>
    <link>${BASE_URL}/blog</link>
    <description>Guías prácticas de automatización operativa para PyMEs mexicanas. Costos, industrias, operaciones y diagnósticos.</description>
    <language>es-MX</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <copyright>Centinelia, ${new Date().getFullYear()}</copyright>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status:  200,
    headers: {
      'Content-Type':  'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
