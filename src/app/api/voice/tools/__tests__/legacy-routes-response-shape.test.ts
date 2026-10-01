// Shape regression para 11 endpoints legacy migrados a toolResponse() el
// 2026-10-01. Mismo bug que registrar_incidencia: sin el wrap custom-LLM
// `{results:[{toolCallId,result}]}`, Vapi devolvía "No result returned" al
// modelo aunque el server respondiera 200 OK. Este test fuerza por cada
// endpoint un path de error temprano (más fácil de disparar que happy path),
// y verifica que el response SIEMPRE lleva el wrap cuando viene toolCallList.
//
// Si alguien agrega un nuevo return con el formato viejo, este test lo pesca.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vapi/auth', () => ({
  requireVapiAuth: vi.fn(() => true),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single:      vi.fn(() => Promise.resolve({ data: null, error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}));

beforeEach(() => { vi.clearAllMocks(); });

interface Endpoint {
  name:         string;
  modulePath:   string;
  queryUrl:     string;
  guardArgs:    Record<string, unknown>;
}

const ENDPOINTS: Endpoint[] = [
  {
    name:       'qb-registrar-pago',
    modulePath: '../qb-registrar-pago/route',
    queryUrl:   'http://x/api/voice/tools/qb-registrar-pago?agent_id=a1',
    // sin cliente_nombre → cae al guard "Necesito el nombre del cliente..."
    guardArgs:  { monto: 100 },
  },
  {
    name:       'qb-crear-factura',
    modulePath: '../qb-crear-factura/route',
    queryUrl:   'http://x/api/voice/tools/qb-crear-factura?agent_id=a1',
    guardArgs:  { monto: 100 },  // falta cliente_nombre + descripcion
  },
  {
    name:       'qb-buscar-cliente',
    modulePath: '../qb-buscar-cliente/route',
    queryUrl:   'http://x/api/voice/tools/qb-buscar-cliente?agent_id=a1',
    guardArgs:  {},  // sin nombre → "Necesito el nombre del cliente..."
  },
  {
    name:       'generar-punto-acuerdo',
    modulePath: '../generar-punto-acuerdo/route',
    queryUrl:   'http://x/api/voice/tools/generar-punto-acuerdo?agent_id=a1',
    guardArgs:  {},  // sin proposicion/resolutivos
  },
  {
    name:       'crear-reporte',
    modulePath: '../crear-reporte/route',
    queryUrl:   'http://x/api/voice/tools/crear-reporte?agent_id=',  // agent_id vacío
    guardArgs:  {},
  },
  {
    name:       'agendar-cita-externa',
    modulePath: '../agendar-cita-externa/route',
    queryUrl:   'http://x/api/voice/tools/agendar-cita-externa?agent_id=a1',
    guardArgs:  {},  // sin nombre/fecha/hora
  },
  {
    name:       'consultar-disponibilidad',
    modulePath: '../consultar-disponibilidad/route',
    queryUrl:   'http://x/api/voice/tools/consultar-disponibilidad?agent_id=',  // sin agent_id
    guardArgs:  {},
  },
  {
    name:       'verificar-documentos',
    modulePath: '../verificar-documentos/route',
    queryUrl:   'http://x/api/voice/tools/verificar-documentos?agent_id=',
    guardArgs:  {},
  },
  {
    name:       'registrar-documento',
    modulePath: '../registrar-documento/route',
    queryUrl:   'http://x/api/voice/tools/registrar-documento?agent_id=a1',
    guardArgs:  {},  // sin folio/documento
  },
  {
    name:       'consultar-reporte',
    modulePath: '../consultar-reporte/route',
    queryUrl:   'http://x/api/voice/tools/consultar-reporte?agent_id=a1',
    guardArgs:  {},  // sin folio ni numero_ciudadano
  },
  {
    name:       'generar-acta-sesion',
    modulePath: '../generar-acta-sesion/route',
    queryUrl:   'http://x/api/voice/tools/generar-acta-sesion?agent_id=',
    guardArgs:  {},
  },
];

describe('legacy voice tool routes — custom-LLM response wrap', () => {
  for (const ep of ENDPOINTS) {
    it(`${ep.name}: envuelve response en {results:[{toolCallId,result}]} con toolCallList`, async () => {
      const mod = await import(ep.modulePath);
      const req = new NextRequest(ep.queryUrl, {
        method: 'POST',
        body: JSON.stringify({
          message: {
            toolCallList: [{
              id: `call_${ep.name}`,
              function: { arguments: JSON.stringify(ep.guardArgs) },
            }],
          },
        }),
        headers: { 'content-type': 'application/json' },
      });
      const res = await mod.POST(req);
      const json = await res.json();
      expect(json, `${ep.name} debe tener property 'results'`).toHaveProperty('results');
      expect(json.results[0].toolCallId).toBe(`call_${ep.name}`);
      expect(typeof json.results[0].result).toBe('string');
    });

    it(`${ep.name}: cae a formato flat {result} sin toolCallList`, async () => {
      const mod = await import(ep.modulePath);
      const req = new NextRequest(ep.queryUrl, {
        method: 'POST',
        body: JSON.stringify(ep.guardArgs),
        headers: { 'content-type': 'application/json' },
      });
      const res = await mod.POST(req);
      const json = await res.json();
      expect(json, `${ep.name} debe tener property 'result' en fallback flat`).toHaveProperty('result');
      expect(json).not.toHaveProperty('results');
    });
  }
});
