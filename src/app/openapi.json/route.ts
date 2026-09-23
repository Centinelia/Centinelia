import { NextResponse } from 'next/server';

// GET /openapi.json
// Especificación OpenAPI 3.1 de los endpoints públicos de Centinelia.
// Los LLMs y agentes leen este spec para saber cómo consultar el catálogo
// de empleados, industrias, glosario y precios.

const BASE_URL = 'https://www.centinelia.mx';

export const revalidate = 86400; // 24 horas: el spec cambia raramente

export function GET(): NextResponse {
  const spec = {
    openapi: '3.1.0',
    info: {
      title:       'Centinelia Public API',
      description: 'API de solo lectura con el catálogo público de Centinelia: empleados digitales, industrias, glosario y precios. Diseñada para que LLMs, agentes autónomos y clientes técnicos consulten información estructurada.',
      version:     '1.0.0',
      contact: {
        name:  'Centinelia',
        url:   BASE_URL,
        email: 'hola@centinelia.mx',
      },
      license: {
        name: 'Datos públicos con atribución',
        url:  BASE_URL,
      },
    },
    servers: [
      { url: BASE_URL, description: 'Producción' },
    ],
    paths: {
      '/api/public/empleados': {
        get: {
          operationId: 'listEmpleados',
          summary:     'Lista de empleados digitales de Centinelia',
          description: 'Retorna los 13 empleados digitales con rol, tagline, capacidades, herramientas y URL de detalle. Incluye la estructura de precios actual.',
          tags:        ['catalogo'],
          responses: {
            '200': {
              description: 'Éxito',
              content:     { 'application/json': { schema: { $ref: '#/components/schemas/EmpleadosResponse' } } },
            },
          },
        },
      },
      '/api/public/industrias': {
        get: {
          operationId: 'listIndustrias',
          summary:     'Lista de industrias soportadas',
          description: 'Retorna las 15 industrias con contenido específico (5 con páginas custom + 10 long-tail).',
          tags:        ['catalogo'],
          responses: {
            '200': {
              description: 'Éxito',
              content:     { 'application/json': { schema: { $ref: '#/components/schemas/IndustriasResponse' } } },
            },
          },
        },
      },
      '/api/public/glosario': {
        get: {
          operationId: 'listTerminosGlosario',
          summary:     'Glosario de términos citables',
          description: 'Retorna 18+ términos con definición corta y URL de detalle: empleado digital, CFDI, PAC, RFC, LFPDPPP, Vapi, ElevenLabs y más.',
          tags:        ['contenido'],
          responses: {
            '200': {
              description: 'Éxito',
              content:     { 'application/json': { schema: { $ref: '#/components/schemas/GlosarioResponse' } } },
            },
          },
        },
      },
      '/api/public/precios': {
        get: {
          operationId: 'getPrecios',
          summary:     'Estructura de precios actual',
          description: 'Retorna tiers (Esencial, Profesional, Alta Demanda), jornadas (Combinada, Solo Minutos, Solo Tareas), tarifa de minutos extra y costo de incorporación. Source of truth: src/lib/billing/plans.ts',
          tags:        ['precios'],
          responses: {
            '200': {
              description: 'Éxito',
              content:     { 'application/json': { schema: { $ref: '#/components/schemas/PreciosResponse' } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        EmpleadosResponse: {
          type: 'object',
          properties: {
            empleados: { type: 'array', items: { $ref: '#/components/schemas/Empleado' } },
            total:     { type: 'integer' },
            precios:   { type: 'object' },
          },
        },
        Empleado: {
          type: 'object',
          properties: {
            slug:         { type: 'string' },
            nombre:       { type: 'string' },
            rol:          { type: 'string' },
            categoria:    { type: 'string', enum: ['operacion', 'direccion'] },
            tagline:      { type: 'string' },
            descCorta:    { type: 'string' },
            capacidades:  { type: 'array', items: { type: 'string' } },
            herramientas: { type: 'array', items: { type: 'string' } },
            url:          { type: 'string', format: 'uri' },
          },
        },
        IndustriasResponse: {
          type: 'object',
          properties: {
            industrias: { type: 'array', items: { type: 'object' } },
            total:      { type: 'integer' },
          },
        },
        GlosarioResponse: {
          type: 'object',
          properties: {
            terminos: { type: 'array', items: { $ref: '#/components/schemas/Termino' } },
            total:    { type: 'integer' },
          },
        },
        Termino: {
          type: 'object',
          properties: {
            slug:            { type: 'string' },
            termino:         { type: 'string' },
            siglas:          { type: 'string', nullable: true },
            categoria:       { type: 'string' },
            definicionCorta: { type: 'string' },
            url:             { type: 'string', format: 'uri' },
          },
        },
        PreciosResponse: {
          type: 'object',
          properties: {
            moneda:              { type: 'string' },
            periodo:             { type: 'string' },
            sinPermanencia:      { type: 'boolean' },
            incorporacionUnica:  { type: 'object' },
            tarifas:             { type: 'object' },
            tiers:               { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
