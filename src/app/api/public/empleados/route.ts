import { NextResponse } from 'next/server';
import { MEERKATS } from '@/lib/meerkats/data';
import { TIER_PRICE_MXN, FEATURE_PLAN_CONFIG } from '@/lib/billing/plans';

// GET /api/public/empleados
// Lista pública de empleados digitales con capacidades, casos de uso,
// herramientas y precios. Endpoint diseñado para que LLMs y agentes
// externos puedan citar información estructurada del catálogo.

export const revalidate = 3600;

export function GET(): NextResponse {
  const empleados = MEERKATS.map(m => ({
    slug:          m.slug,
    nombre:        m.nombre,
    rol:           m.rol,
    categoria:     m.categoria,
    tagline:       m.tagline,
    descCorta:     m.descCorta,
    capacidades:   m.capacidades,
    herramientas:  m.herramientas,
    url:           `https://www.centinelia.mx/empleados/${m.slug}`,
  }));

  return NextResponse.json({
    empleados,
    total:  empleados.length,
    precios: {
      tiers: {
        Esencial:      { mxn: TIER_PRICE_MXN.starter, minutosCombinada: 250,  tareasCombinada: 300 },
        Profesional:   { mxn: TIER_PRICE_MXN.growth,  minutosCombinada: 500,  tareasCombinada: 600 },
        AltaDemanda:   { mxn: TIER_PRICE_MXN.scale,   minutosCombinada: 1000, tareasCombinada: 1200 },
      },
      setupUnica:      FEATURE_PLAN_CONFIG.pro.setupFee,
      moneda:          'MXN',
      periodo:         'mensual',
      minutoExtraMxn:  12,
      sinPermanencia:  true,
    },
    _links: {
      documentation: 'https://www.centinelia.mx/empleados',
      llmsFull:      'https://www.centinelia.mx/llms-full.txt',
    },
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
