import { describe, it, expect } from 'vitest';
import { expandForSpeech } from './tts-normalize';

describe('expandForSpeech', () => {
  it('expande Ave / Ave.', () => {
    expect(expandForSpeech('Ave Test 123')).toBe('Avenida Test 123');
    expect(expandForSpeech('Ave. Constitución 500')).toBe('Avenida Constitución 500');
  });

  it('expande Blvd', () => {
    expect(expandForSpeech('Blvd. Solidaridad 1000')).toBe('Boulevard Solidaridad 1000');
  });

  it('expande Col. Fracc. Depto.', () => {
    expect(expandForSpeech('Col. Centro, Fracc. Los Pinos, Depto. 4B')).toBe(
      'Colonia Centro, Fraccionamiento Los Pinos, departamento 4B'
    );
  });

  it('expande abreviaturas de numeración', () => {
    expect(expandForSpeech('No. 123')).toBe('número 123');
    expect(expandForSpeech('Núm. 45')).toBe('número 45');
    expect(expandForSpeech('# 8')).toBe('número 8');
    expect(expandForSpeech('C.P. 66470')).toBe('código postal 66470');
    expect(expandForSpeech('km 15 carretera')).toBe('kilómetro 15 carretera');
  });

  it('no destruye palabras que empiezan igual', () => {
    expect(expandForSpeech('Avelina no vive aquí')).toBe('Avelina no vive aquí');
    expect(expandForSpeech('Colossal Building')).toBe('Colossal Building');
  });

  it('maneja input vacío o null', () => {
    expect(expandForSpeech('')).toBe('');
    expect(expandForSpeech(null)).toBe('');
    expect(expandForSpeech(undefined)).toBe('');
  });

  it('caso real del test-followup', () => {
    const raw = 'hace unos días registró un pedido de 5 kilos de tortilla de maíz para entrega a domicilio a Ave. Test 123, Col. Prueba, Monterrey y quisiera saber si ya lo recibió';
    const out = expandForSpeech(raw);
    expect(out).toContain('Avenida Test 123');
    expect(out).toContain('Colonia Prueba');
    expect(out).not.toContain('Ave.');
    expect(out).not.toContain('Col.');
  });
});
