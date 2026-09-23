// Helpers de schema.org JSON-LD para GEO/AEO.
// Centralizado aquí para que los shapes sean consistentes entre páginas.

const BASE_URL = 'https://www.centinelia.mx';

export interface BreadcrumbItem {
  /** texto visible del breadcrumb */
  name: string;
  /** URL completa (con BASE_URL). Se omite para el item final si conviene. */
  url:  string;
}

/**
 * BreadcrumbList schema. LLMs y motores lo usan para entender la jerarquía
 * de una página anidada y armar rutas de navegación al citar.
 */
export function breadcrumbSchema(items: BreadcrumbItem[]): object {
  return {
    '@context':        'https://schema.org',
    '@type':           'BreadcrumbList',
    itemListElement:   items.map((item, i) => ({
      '@type':    'ListItem',
      position:   i + 1,
      name:       item.name,
      item:       item.url,
    })),
  };
}

/**
 * Devuelve la fecha en formato ISO YYYY-MM-DD del día del build.
 * Sirve como señal de "última actualización" para ChatGPT SearchGPT y
 * Perplexity, que priorizan contenido reciente. Se regenera en cada deploy.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convierte texto libre a slug para usar como id de anchor. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')      // quitar diacríticos
    .replace(/[^a-z0-9\s-]/g, '')         // solo alfanum y guiones
    .trim()
    .replace(/\s+/g, '-')                  // espacios → guiones
    .replace(/-+/g, '-');                  // colapsar guiones
}

export { BASE_URL };
