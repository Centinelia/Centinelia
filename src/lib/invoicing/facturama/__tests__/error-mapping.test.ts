import { describe, it, expect } from 'vitest';
import { mapFacturamaError, extractErrorMessage } from '../error-mapping';

describe('mapFacturamaError', () => {
  it('marca 429 como retryable', () => {
    expect(mapFacturamaError(429)).toEqual({ retryable: true });
  });
  it('marca 5xx como retryable', () => {
    expect(mapFacturamaError(500)).toEqual({ retryable: true });
    expect(mapFacturamaError(503)).toEqual({ retryable: true });
  });
  it('marca 4xx (excepto 429) como no-retryable', () => {
    expect(mapFacturamaError(400)).toEqual({ retryable: false });
    expect(mapFacturamaError(401)).toEqual({ retryable: false });
    expect(mapFacturamaError(404)).toEqual({ retryable: false });
  });
});

describe('extractErrorMessage', () => {
  it('formatea ModelState con detalles por campo', () => {
    const err = {
      Message: 'Model validation failed',
      ModelState: {
        'Receiver.Rfc': ['RFC inválido'],
        'Complemento.Payments[0].Amount': ['Monto debe ser mayor a 0'],
      },
    };
    const msg = extractErrorMessage(err, '');
    expect(msg).toContain('Model validation failed');
    expect(msg).toContain('Receiver.Rfc: RFC inválido');
    expect(msg).toContain('Amount: Monto debe ser mayor a 0');
  });

  it('devuelve Message cuando no hay ModelState', () => {
    expect(extractErrorMessage({ Message: 'Simple error' }, '')).toBe('Simple error');
  });

  it('cae a raw truncado cuando no hay JSON parseable', () => {
    const raw = 'X'.repeat(500);
    expect(extractErrorMessage(null, raw).length).toBeLessThanOrEqual(300);
  });
});
