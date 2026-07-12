export interface SearchResult {
  title:       string;
  url:         string;
  description: string;
  domain:      string;
}

interface BraveWebResult {
  title:       string;
  url:         string;
  description?: string;
  meta_url?:   { hostname?: string };
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

export async function searchWeb(query: string, count = 10): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(count, 20)));
  url.searchParams.set('country', 'MX');
  url.searchParams.set('search_lang', 'es');
  url.searchParams.set('safesearch', 'moderate');

  const res = await fetch(url.toString(), {
    headers: {
      'Accept':               'application/json',
      'X-Subscription-Token': key,
    },
  });

  if (!res.ok) return [];

  const data = await res.json() as BraveResponse;
  return (data.web?.results ?? []).map(r => ({
    title:       r.title,
    url:         r.url,
    description: r.description ?? '',
    domain:      r.meta_url?.hostname ?? new URL(r.url).hostname,
  }));
}

export type ResearchType = 'leads' | 'competidores' | 'mercado' | 'regulaciones' | 'noticias' | 'general';

export interface BusinessContext {
  name:         string;
  description?: string;
}

export function buildQueries(
  topic:    string,
  location: string,
  type:     ResearchType,
  keywords: string[],
  business?: BusinessContext,
): string[] {
  const kw   = keywords.length ? ` ${keywords.join(' ')}` : '';
  const loc  = location ? ` ${location}` : '';
  const base = `${topic}${loc}${kw}`;

  // Derive a short industry snippet from business description (skip generic openers)
  const SKIP = /^(empresa|negocio|somos|proveedor|prestador)\s+de\s+/i;
  const rawDesc = (business?.description ?? '').trim().replace(SKIP, '');
  const industryWords = rawDesc.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  const industry = industryWords.length >= 3 ? industryWords : '';

  // Exclude the business itself from competitor results
  const notSelf = business?.name ? ` -"${business.name}"` : '';

  switch (type) {
    case 'leads':
      return [
        `${base}`,
        `${base} contacto`,
        industry ? `${industry} ${topic}${loc} directorio` : `${base} directorio`,
        `site:facebook.com "${topic}"${loc}${kw}`,
        `site:linkedin.com "${topic}"${loc}${kw}`,
        `site:mercadolibre.com.mx "${topic}"${loc}${kw}`,
      ];
    case 'competidores':
      return [
        `${base} empresa servicios${notSelf}`,
        `${base} precios${notSelf}`,
        industry ? `"${industry}" empresa${loc}${notSelf}` : `site:linkedin.com/company "${topic}"${loc}`,
        `"${topic}"${loc} quienes somos${notSelf}`,
      ];
    case 'mercado':
      return [
        `${base} mercado tendencias 2025`,
        industry ? `"${industry}" México análisis sector 2025` : `"${topic}" México análisis sector`,
        `${base} oportunidades crecimiento`,
        `"${topic}" estadísticas datos México`,
      ];
    case 'regulaciones':
      return [
        `"${topic}" regulaciones requisitos México`,
        `"${topic}" permisos licencias${loc}`,
        industry ? `"${industry}" regulaciones normativa México` : `"${topic}" ley norma NOM México`,
        `"${topic}" trámites COFEPRIS SAT IMSS${loc}`,
      ];
    case 'noticias':
      return [
        `${base} 2025`,
        industry ? `"${industry}" noticias México 2025` : `"${topic}" México noticias reciente`,
        `${base} novedades`,
      ];
    case 'general':
      return [
        `${base}`,
        `${base} México`,
        `"${topic}"${loc}`,
      ];
  }
}

// Run multiple queries in parallel and deduplicate by URL
export async function searchMultiple(queries: string[], countPerQuery = 8): Promise<SearchResult[]> {
  const results = await Promise.all(queries.map(q => searchWeb(q, countPerQuery)));
  const seen    = new Set<string>();
  const merged: SearchResult[] = [];
  for (const batch of results) {
    for (const r of batch) {
      if (!seen.has(r.url)) {
        seen.add(r.url);
        merged.push(r);
      }
    }
  }
  return merged;
}
