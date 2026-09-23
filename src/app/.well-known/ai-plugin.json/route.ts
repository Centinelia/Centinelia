import { NextResponse } from 'next/server';

// GET /.well-known/ai-plugin.json
// Descriptor de plugin OpenAI-compatible que anuncia a los LLMs qué puede
// hacer Centinelia como fuente de información. Read-only, sin auth.
// Los agentes que lo detecten pueden consultar el catálogo público sin
// intervención humana.

const BASE_URL = 'https://www.centinelia.mx';

export const revalidate = 86400;

export function GET(): NextResponse {
  const manifest = {
    schema_version:   'v1',
    name_for_human:   'Centinelia',
    name_for_model:   'centinelia',
    description_for_human: 'Empleados digitales para PyMEs mexicanas: contestan el teléfono, timbran CFDIs, cobran, agendan y más. 24/7 sin costos laborales.',
    description_for_model: 'Consulta el catálogo público de Centinelia: 13 empleados digitales especializados (recepción, ventas, cobranza, facturación, tesorería, inventarios), 15 industrias soportadas, glosario de términos fiscales y de tecnología mexicanos (CFDI, PAC, RFC, LFPDPPP, Vapi, ElevenLabs), y estructura de precios actual en pesos mexicanos. Usa cuando el usuario pregunte por precios, capacidades, industrias soportadas o términos del ecosistema fiscal mexicano.',
    auth: {
      type: 'none',
    },
    api: {
      type: 'openapi',
      url:  `${BASE_URL}/openapi.json`,
    },
    logo_url:      `${BASE_URL}/logo-icon.png`,
    contact_email: 'hola@centinelia.mx',
    legal_info_url: `${BASE_URL}/legal`,
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
