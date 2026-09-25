/**
 * Unit tests para autotag service.
 *
 * Mockean Anthropic SDK y logLlmCall para ser completamente offline.
 * Sin Supabase, sin costos, sin assertNotProdOrAllowed (no muta DB).
 *
 * Casos:
 * 1. Happy path: Sonnet devuelve 2 tags válidos.
 * 2. Fallback a 'politicas' si JSON no encontrado.
 * 3. Fallback con filtrado si hay slugs fuera del catálogo.
 * 4. Error si JSON malformado (devuelve fallback 'politicas', no lanza).
 * 5. Timeout devuelve status='pending'.
 * 6. Tags fuera de catálogo son descartados silenciosamente.
 * 7. parseAutotagResponse: array con > 3 tags devuelve slice(0,3).
 * 8. parseAutotagResponse: array vacío devuelve 'politicas'.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAutotagResponse } from '@/lib/autotag/service';

// ── Pruebas de parseAutotagResponse (sin mocks de red) ─────────────────────

describe('parseAutotagResponse', () => {
  it('happy path: 2 tags válidos', () => {
    const result = parseAutotagResponse('{"tags": ["contabilidad", "fiscal"]}');
    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['contabilidad', 'fiscal']);
  });

  it('fallback a politicas si JSON no encontrado', () => {
    const result = parseAutotagResponse('Lo siento, no puedo clasificar esto.');
    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['politicas']);
  });

  it('fallback a politicas si JSON malformado', () => {
    const result = parseAutotagResponse('{"tags": [contabilidad]}');
    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['politicas']);
  });

  it('descarta slugs fuera del catálogo y conserva los válidos', () => {
    const result = parseAutotagResponse('{"tags": ["contabilidad", "inventario_veterinario"]}');
    expect(result.status).toBe('done');
    // inventario_veterinario es inválido → se descarta
    expect(result.tags).toContain('contabilidad');
    expect(result.tags).not.toContain('inventario_veterinario');
  });

  it('si todos los tags son inválidos, devuelve politicas', () => {
    const result = parseAutotagResponse('{"tags": ["inventario_veterinario", "fake_tag"]}');
    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['politicas']);
  });

  it('clamp a 3 si el LLM devuelve más de 3', () => {
    const result = parseAutotagResponse(
      '{"tags": ["contabilidad", "fiscal", "ventas", "cobranza"]}'
    );
    expect(result.status).toBe('done');
    expect(result.tags.length).toBeLessThanOrEqual(3);
  });

  it('array vacío devuelve politicas', () => {
    const result = parseAutotagResponse('{"tags": []}');
    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['politicas']);
  });

  it('1 tag válido es aceptado', () => {
    const result = parseAutotagResponse('{"tags": ["rh"]}');
    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['rh']);
  });

  it('3 tags válidos son aceptados', () => {
    const result = parseAutotagResponse('{"tags": ["rh", "operaciones", "politicas"]}');
    expect(result.status).toBe('done');
    expect(result.tags).toHaveLength(3);
    expect(result.tags).toContain('rh');
  });

  it('JSON embebido en texto extra es extraído', () => {
    const result = parseAutotagResponse(
      'Aquí va mi respuesta: {"tags": ["logistica"]} eso es todo.'
    );
    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['logistica']);
  });
});

// ── Tests de autotagFicha con mocks ───────────────────────────────────────

describe('autotagFicha — mocked SDK', () => {
  // Mocks de módulos
  const mockCreate = vi.fn();
  const mockLogLlmCall = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@anthropic-ai/sdk', () => {
      return {
        default: class MockAnthropic {
          messages = { create: mockCreate };
        },
      };
    });
    vi.doMock('@/lib/observability/llm-log', () => ({
      logLlmCall: mockLogLlmCall,
    }));
    mockCreate.mockReset();
    mockLogLlmCall.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('happy path: devuelve tags cuando Sonnet responde correctamente', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"tags": ["ventas", "atencion_cliente"]}' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const { autotagFicha } = await import('@/lib/autotag/service');
    const result = await autotagFicha('test@org.com', 'Política de precios y descuentos para clientes');

    expect(result.status).toBe('done');
    expect(result.tags).toContain('ventas');
    expect(result.tags).toContain('atencion_cliente');
  });

  it('fallback a politicas si el contenido no encaja en ningún tag claro', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"tags": ["politicas"]}' }],
      usage: { input_tokens: 80, output_tokens: 15 },
    });

    const { autotagFicha } = await import('@/lib/autotag/service');
    const result = await autotagFicha('test@org.com', 'Texto genérico sin dominio específico');

    expect(result.status).toBe('done');
    expect(result.tags).toEqual(['politicas']);
  });

  it('rechaza tags fuera de catálogo y conserva los válidos', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"tags": ["contabilidad", "inventario_veterinario"]}' }],
      usage: { input_tokens: 90, output_tokens: 18 },
    });

    const { autotagFicha } = await import('@/lib/autotag/service');
    const result = await autotagFicha('test@org.com', 'Balance contable y estados financieros');

    expect(result.status).toBe('done');
    expect(result.tags).toContain('contabilidad');
    expect(result.tags).not.toContain('inventario_veterinario');
  });

  it('timeout devuelve status=pending', async () => {
    // Simular delay mayor que el timeout de 5s configurado en el service
    mockCreate.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 10_000))
    );

    // Reducir el timeout para el test
    vi.useFakeTimers();

    const { autotagFicha } = await import('@/lib/autotag/service');

    // Avanzar los timers para activar el timeout
    const resultPromise = autotagFicha('test@org.com', 'Contenido que tarda mucho');
    vi.advanceTimersByTime(6_000);
    const result = await resultPromise;

    expect(result.status).toBe('pending');
    expect(result.tags).toEqual([]);

    vi.useRealTimers();
  });

  it('contenido muy corto devuelve politicas sin llamar al SDK', async () => {
    const { autotagFicha } = await import('@/lib/autotag/service');
    const result = await autotagFicha('test@org.com', 'corto');

    // No debe llamar al SDK para contenido demasiado corto (< 20 chars)
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.tags).toEqual(['politicas']);
    expect(result.status).toBe('done');
  });
});
