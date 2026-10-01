// Regression 2026-09-30: antes del fix, el FAB mostraba el genérico "Ocurrió
// un error. Intenta de nuevo." aunque el server respondía con
// {error:'ops_limit_reached', used, limit}. Camila no sabía que faltaba pool.

import { describe, it, expect } from 'vitest';
import { formatAgentChatError } from '../chat-error';

describe('formatAgentChatError', () => {
  it('ops_limit_reached con used+limit → mensaje específico con contador', () => {
    const msg = formatAgentChatError({ error: 'ops_limit_reached', used: 480, limit: 500 });
    expect(msg).toBe('Se acabaron las tareas de este mes (480/500). Contacta a Centinelia para agregar más.');
  });

  it('ops_limit_reached sin counts → mensaje específico sin paréntesis', () => {
    const msg = formatAgentChatError({ error: 'ops_limit_reached' });
    expect(msg).toBe('Se acabaron las tareas de este mes. Contacta a Centinelia para agregar más.');
  });

  it('ops_limit_reached con used=0 (edge) → contador se muestra', () => {
    const msg = formatAgentChatError({ error: 'ops_limit_reached', used: 0, limit: 500 });
    expect(msg).toContain('(0/500)');
  });

  it('body null → mensaje genérico', () => {
    expect(formatAgentChatError(null)).toBe('Ocurrió un error. Intenta de nuevo.');
  });

  it('body sin error field → mensaje genérico', () => {
    expect(formatAgentChatError({ used: 100 })).toBe('Ocurrió un error. Intenta de nuevo.');
  });

  it('error desconocido → mensaje genérico (no leak de códigos server-side)', () => {
    expect(formatAgentChatError({ error: 'internal_sfu_crash' })).toBe('Ocurrió un error. Intenta de nuevo.');
  });
});
