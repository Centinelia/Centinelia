// @vitest-environment jsdom

/**
 * Tests para DraftPreview — componente presentacional de borradores.
 *
 * Cubre: renderizado con imagen, renderizado con video, hashtags, sin media.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import DraftPreview, { type ContentDraft } from '../DraftPreview';

describe('DraftPreview — renderizado', () => {
  it('muestra caption e imagen cuando el draft tiene media de imagen', () => {
    const draft: ContentDraft = {
      id:          'draft-img-1',
      caption:     'Prueba de publicación con imagen',
      hashtags:    ['verano', 'playa'],
      media_urls:  ['https://example.com/foto.jpg'],
      status:      'pending_approval',
      scheduled_for: null,
    };

    render(<DraftPreview draft={draft} />);

    // Caption visible
    expect(screen.getByText('Prueba de publicación con imagen')).toBeTruthy();

    // Hashtags visibles (sin el #)
    expect(screen.getByText('verano')).toBeTruthy();
    expect(screen.getByText('playa')).toBeTruthy();

    // Badge de estado visible
    expect(screen.getByText('Pendiente')).toBeTruthy();

    // La imagen debe renderizarse (alt="Vista previa")
    const img = screen.getByAltText('Vista previa');
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toContain('foto.jpg');
  });

  it('muestra etiqueta "Video" cuando el draft tiene media de video', () => {
    const draft: ContentDraft = {
      id:          'draft-vid-1',
      caption:     'Reel de producto',
      hashtags:    [],
      media_urls:  ['https://cdn.example.com/reel.mp4'],
      status:      'scheduled',
      scheduled_for: '2026-10-01T15:00:00Z',
    };

    render(<DraftPreview draft={draft} />);

    // La etiqueta "Video" aparece dentro del thumbnail
    expect(screen.getByText('Video')).toBeTruthy();

    // Caption visible
    expect(screen.getByText('Reel de producto')).toBeTruthy();

    // Estado "Programado"
    expect(screen.getByText('Programado')).toBeTruthy();
  });

  it('muestra placeholder cuando no hay media', () => {
    const draft: ContentDraft = {
      id:         'draft-nomedia',
      caption:    'Solo texto sin imagen',
      status:     'pending_approval',
      media_urls: [],
    };

    render(<DraftPreview draft={draft} />);

    // No debe haber imagen con alt "Vista previa"
    expect(screen.queryByAltText('Vista previa')).toBeNull();

    // Caption y estado
    expect(screen.getByText('Solo texto sin imagen')).toBeTruthy();
    expect(screen.getByText('Pendiente')).toBeTruthy();
  });

  it('oculta el badge de estado cuando showStatus es false', () => {
    const draft: ContentDraft = {
      id:     'draft-nostatus',
      status: 'approved',
    };

    render(<DraftPreview draft={draft} showStatus={false} />);

    // No debe haber badge "Aprobado"
    expect(screen.queryByText('Aprobado')).toBeNull();
  });
});
