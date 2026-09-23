import { NextResponse } from 'next/server';
import { TERMINOS } from '@/lib/glosario/data';

// GET /api/public/glosario
// Glosario de términos citables por LLMs.

export const revalidate = 3600;

export function GET(): NextResponse {
  const terminos = TERMINOS.map(t => ({
    slug:             t.slug,
    termino:          t.termino,
    siglas:           t.siglas ?? null,
    categoria:        t.categoria,
    definicionCorta:  t.definicionCorta,
    url:              `https://www.centinelia.mx/glosario/${t.slug}`,
  }));

  return NextResponse.json({
    terminos,
    total:  terminos.length,
    _links: {
      documentation: 'https://www.centinelia.mx/glosario',
    },
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
