import { describe, it, expect } from 'vitest';
import {
  isPostTempModel,
  sonnet55VoiceExtras,
  effectiveMaxTokens,
} from '../model-guards';

describe('isPostTempModel', () => {
  it('true para claude-sonnet-5-5 (alias corto)', () => {
    expect(isPostTempModel('claude-sonnet-5-5')).toBe(true);
  });

  it('true para claude-opus-5-5-20260828 (con fecha)', () => {
    expect(isPostTempModel('claude-opus-5-5-20260828')).toBe(true);
  });

  it('true para claude-haiku-5-0', () => {
    expect(isPostTempModel('claude-haiku-5-0')).toBe(true);
  });

  it('true para claude-fable-5-1', () => {
    expect(isPostTempModel('claude-fable-5-1')).toBe(true);
  });

  it('false para claude-sonnet-4-6', () => {
    expect(isPostTempModel('claude-sonnet-4-6')).toBe(false);
  });

  it('false para claude-haiku-4-5-20251001', () => {
    expect(isPostTempModel('claude-haiku-4-5-20251001')).toBe(false);
  });

  it('false para claude-sonnet-3-5', () => {
    expect(isPostTempModel('claude-sonnet-3-5')).toBe(false);
  });

  it('false para undefined/null/empty', () => {
    expect(isPostTempModel(undefined)).toBe(false);
    expect(isPostTempModel(null)).toBe(false);
    expect(isPostTempModel('')).toBe(false);
  });
});

describe('sonnet55VoiceExtras', () => {
  it('devuelve output_config + thinking para Sonnet 5.5', () => {
    expect(sonnet55VoiceExtras('claude-sonnet-5-5')).toEqual({
      output_config: { effort: 'low' },
      thinking:      { type: 'between_tools' },
    });
  });

  it('devuelve vacío para Sonnet 4.6', () => {
    expect(sonnet55VoiceExtras('claude-sonnet-4-6')).toEqual({});
  });

  it('devuelve vacío para undefined', () => {
    expect(sonnet55VoiceExtras(undefined)).toEqual({});
  });
});

describe('effectiveMaxTokens', () => {
  it('sube a 2000 mínimo para Sonnet 5.5 cuando requested < floor', () => {
    expect(effectiveMaxTokens('claude-sonnet-5-5', 400)).toBe(2000);
    expect(effectiveMaxTokens('claude-sonnet-5-5', 200)).toBe(2000);
  });

  it('respeta requested cuando ya excede floor', () => {
    expect(effectiveMaxTokens('claude-sonnet-5-5', 3000)).toBe(3000);
  });

  it('respeta requested para Sonnet 4.6 aunque sea bajo', () => {
    expect(effectiveMaxTokens('claude-sonnet-4-6', 200)).toBe(200);
  });

  it('acepta floor custom (golden_test usa más tokens de respuesta)', () => {
    expect(effectiveMaxTokens('claude-sonnet-5-5', 500, 3000)).toBe(3000);
    expect(effectiveMaxTokens('claude-sonnet-5-5', 5000, 3000)).toBe(5000);
  });

  it('devuelve undefined si Sonnet 4.6 y requested undefined', () => {
    expect(effectiveMaxTokens('claude-sonnet-4-6', undefined)).toBe(undefined);
  });
});
