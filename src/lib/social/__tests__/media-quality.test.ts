/**
 * Tests de comportamiento para validateMediaForIG.
 *
 * Cubre los 4 targets (image, reel, story, carousel) con casos válidos
 * e inválidos, verificando razones específicas donde aplica.
 */
import { describe, it, expect } from 'vitest';
import { validateMediaForIG } from '../media-quality';

describe('validateMediaForIG', () => {

  // ─── Reel ─────────────────────────────────────────────────────────────────

  it('acepta video mp4 720p 60s como reel', () => {
    const r = validateMediaForIG(
      { mimeType: 'video/mp4', durationSeconds: 60, width: 720, height: 1280, sizeBytes: 20e6 },
      'reel',
    );
    expect(r.valid).toBe(true);
  });

  it('rechaza video >90s para reel', () => {
    const r = validateMediaForIG(
      { mimeType: 'video/mp4', durationSeconds: 100, width: 720, height: 1280, sizeBytes: 20e6 },
      'reel',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/90 segundos/i);
  });

  it('rechaza resolución <720p para reel', () => {
    const r = validateMediaForIG(
      { mimeType: 'video/mp4', durationSeconds: 30, width: 480, height: 640, sizeBytes: 5e6 },
      'reel',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/resolución/i);
  });

  it('rechaza mimetype no soportado para reel (mkv)', () => {
    const r = validateMediaForIG(
      { mimeType: 'video/mkv', durationSeconds: 30, width: 720, height: 1280, sizeBytes: 5e6 },
      'reel',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/no soportado/i);
  });

  it('rechaza reel que excede 100 MB', () => {
    const r = validateMediaForIG(
      { mimeType: 'video/mp4', durationSeconds: 30, width: 720, height: 1280, sizeBytes: 110 * 1024 * 1024 },
      'reel',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/100 MB/i);
  });

  // ─── Image ────────────────────────────────────────────────────────────────

  it('acepta imagen jpeg dentro del límite de 30 MB como image', () => {
    const r = validateMediaForIG(
      { mimeType: 'image/jpeg', sizeBytes: 10 * 1024 * 1024 },
      'image',
    );
    expect(r.valid).toBe(true);
  });

  it('rechaza imagen que supera 30 MB', () => {
    const r = validateMediaForIG(
      { mimeType: 'image/jpeg', sizeBytes: 35 * 1024 * 1024 },
      'image',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/30 MB/i);
  });

  // ─── Carousel ─────────────────────────────────────────────────────────────

  it('acepta imagen png válida para carrusel', () => {
    const r = validateMediaForIG(
      { mimeType: 'image/png', sizeBytes: 5 * 1024 * 1024 },
      'carousel',
    );
    expect(r.valid).toBe(true);
  });

  it('rechaza mimetype gif para carrusel', () => {
    const r = validateMediaForIG(
      { mimeType: 'image/gif', sizeBytes: 2 * 1024 * 1024 },
      'carousel',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/no soportado/i);
  });

  // ─── Story ────────────────────────────────────────────────────────────────

  it('acepta imagen jpeg para story', () => {
    const r = validateMediaForIG(
      { mimeType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 },
      'story',
    );
    expect(r.valid).toBe(true);
  });

  it('acepta video mp4 para story', () => {
    const r = validateMediaForIG(
      { mimeType: 'video/mp4', durationSeconds: 15, width: 720, height: 1280, sizeBytes: 15 * 1024 * 1024 },
      'story',
    );
    expect(r.valid).toBe(true);
  });

  it('rechaza formato no soportado para story (pdf)', () => {
    const r = validateMediaForIG(
      { mimeType: 'application/pdf', sizeBytes: 1 * 1024 * 1024 },
      'story',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/no soportado/i);
  });

});
