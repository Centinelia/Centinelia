import { NextResponse } from 'next/server';
import { INDUSTRIES } from '@/lib/industrias/data';

// GET /api/public/industrias
// Lista de industrias long-tail soportadas por Centinelia con problemas
// que resuelven, features y meerkats recomendados. Las 5 industrias
// custom (clinicas, restaurantes, despachos, inmobiliarias, tiendas)
// no se enlistan aquí porque tienen páginas con contenido más rico.

export const revalidate = 3600;

const CUSTOM_INDUSTRIES = [
  { slug: 'clinicas',      titulo: 'Clínicas y consultorios',                        categoria: 'Salud' },
  { slug: 'restaurantes',  titulo: 'Restaurantes y cafeterías',                      categoria: 'Alimentos' },
  { slug: 'despachos',     titulo: 'Despachos legales, contables y consultorías',   categoria: 'Servicios jurídicos' },
  { slug: 'inmobiliarias', titulo: 'Inmobiliarias y bienes raíces',                   categoria: 'Bienes raíces' },
  { slug: 'tiendas',       titulo: 'Tiendas retail y negocios de servicio',          categoria: 'Retail' },
];

export function GET(): NextResponse {
  const longTail = INDUSTRIES.map(ind => ({
    slug:                ind.slug,
    titulo:              ind.titulo,
    categoria:           ind.categoria,
    heroSub:             ind.heroSub,
    features:            ind.features,
    meerkatsRelevantes:  ind.meerkatsRelevantes,
    url:                 `https://www.centinelia.mx/industrias/${ind.slug}`,
  }));

  const custom = CUSTOM_INDUSTRIES.map(c => ({
    ...c,
    url: `https://www.centinelia.mx/industrias/${c.slug}`,
  }));

  return NextResponse.json({
    industrias: [...custom, ...longTail],
    total: custom.length + longTail.length,
    _links: {
      documentation: 'https://www.centinelia.mx/industrias',
    },
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
