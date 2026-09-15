// @vitest-environment jsdom

/**
 * Tests para MediaBandeja — galería de media del cliente.
 *
 * Cubre:
 *   1. Renderiza galería con los items del fetch (filtrados por status visible)
 *   2. El botón "Subir archivo" dispara el input file, que hace POST multipart al endpoint
 *   3. Upload exitoso llama al fetch de listado nuevamente (revalidate)
 *   4. Upload fallido muestra mensaje de error y la lista no cambia
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent }   from '@testing-library/react';
import MediaBandeja                              from '../MediaBandeja';

vi.mock('next/navigation', () => ({
  useParams:   () => ({ token: 'tk-test' }),
  usePathname: () => '/portal/tk-test/oficina/redes/navi-1',
}));

interface MediaItemShape {
  id: string; filename: string; file_url: string; media_type: string;
  file_size: number; status: string; created_at: string;
}

const MOCK_ITEM_AVAILABLE: MediaItemShape = {
  id:         'media-1',
  filename:   'foto-producto.jpg',
  file_url:   'https://example.com/foto-producto.jpg',
  media_type: 'image/jpeg',
  file_size:  204800,
  status:     'available',
  created_at: '2026-09-01T10:00:00Z',
};

const MOCK_ITEM_PROCESSING: MediaItemShape = {
  id:         'media-2',
  filename:   'reel-promo.mp4',
  file_url:   'https://example.com/reel-promo.mp4',
  media_type: 'video/mp4',
  file_size:  10485760,
  status:     'processing',
  created_at: '2026-09-02T11:00:00Z',
};

function mockFetch(handler: (url: string, opts?: RequestInit) => Promise<Response>) {
  global.fetch = handler as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MediaBandeja', () => {
  it('renderiza galería con items de la lista (muestra filename de cada item)', async () => {
    mockFetch(async () => ({
      ok:   true,
      json: async () => ({
        data: [MOCK_ITEM_AVAILABLE, MOCK_ITEM_PROCESSING],
      }),
    } as Response));

    render(<MediaBandeja token="tk-test" naviId="navi-1" />);

    // Estado de carga
    expect(screen.getByText(/cargando archivos/i)).toBeTruthy();

    // Después del fetch, los filenames aparecen
    await waitFor(() =>
      expect(screen.getByText('foto-producto.jpg')).toBeTruthy(),
    );
    expect(screen.getByText('reel-promo.mp4')).toBeTruthy();

    // El item disponible muestra "Disponible"
    expect(screen.getByText('Disponible')).toBeTruthy();

    // El contador de archivos refleja el total
    expect(screen.getByText(/2 archivos disponibles/i)).toBeTruthy();
  });

  it('el botón "Subir archivo" existe y al seleccionar un archivo hace POST multipart', async () => {
    let uploadUrl = '';
    let uploadedForm: FormData | null = null;
    let fetchCallCount = 0;

    mockFetch(async (url: string, opts?: RequestInit) => {
      fetchCallCount++;
      if (opts?.method === 'POST') {
        uploadUrl    = url;
        uploadedForm = opts.body as FormData;
        return {
          ok:   true,
          json: async () => ({ ok: true, data: { ...MOCK_ITEM_AVAILABLE, id: 'media-new' } }),
        } as Response;
      }
      // GET de listado
      return {
        ok:   true,
        json: async () => ({ data: [MOCK_ITEM_AVAILABLE] }),
      } as Response;
    });

    render(<MediaBandeja token="tk-test" naviId="navi-1" />);

    await waitFor(() =>
      expect(screen.getByText(/subir archivo/i)).toBeTruthy(),
    );

    // Disparar cambio en el input file directamente
    const fileInput = screen.getByLabelText('Seleccionar archivo de media');
    const testFile  = new File(['contenido'], 'nueva-imagen.jpg', { type: 'image/jpeg' });

    Object.defineProperty(fileInput, 'files', {
      value:      [testFile],
      writable:   true,
      configurable: true,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(uploadUrl).toContain('/api/portal/tk-test/social/media/upload');
    });

    // El body del POST fue un FormData (no JSON)
    expect(uploadedForm).not.toBeNull();
  });

  it('upload exitoso recarga la lista (fetch llamado al menos 2 veces)', async () => {
    let fetchCallCount = 0;

    mockFetch(async (_url: string, opts?: RequestInit) => {
      fetchCallCount++;
      if (opts?.method === 'POST') {
        return {
          ok:   true,
          json: async () => ({ ok: true, data: { ...MOCK_ITEM_AVAILABLE, id: 'media-nuevo' } }),
        } as Response;
      }
      return {
        ok:   true,
        json: async () => ({ data: [MOCK_ITEM_AVAILABLE] }),
      } as Response;
    });

    render(<MediaBandeja token="tk-test" naviId="navi-1" />);

    // Esperar carga inicial (1 GET)
    await waitFor(() =>
      expect(screen.getByText('foto-producto.jpg')).toBeTruthy(),
    );

    const countBeforeUpload = fetchCallCount;

    // Disparar upload
    const fileInput = screen.getByLabelText('Seleccionar archivo de media');
    const testFile  = new File(['img'], 'nueva.jpg', { type: 'image/jpeg' });

    Object.defineProperty(fileInput, 'files', {
      value:      [testFile],
      writable:   true,
      configurable: true,
    });

    fireEvent.change(fileInput);

    // Después del upload exitoso debe haberse llamado fetch al menos 2 veces más:
    // una para el POST, otra para el GET de revalidación
    await waitFor(() => {
      expect(fetchCallCount).toBeGreaterThan(countBeforeUpload + 1);
    });
  });

  it('upload fallido muestra mensaje de error y la lista permanece sin cambios', async () => {
    mockFetch(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return {
          ok:   false,
          json: async () => ({ error: 'Formato no soportado' }),
        } as Response;
      }
      return {
        ok:   true,
        json: async () => ({ data: [MOCK_ITEM_AVAILABLE] }),
      } as Response;
    });

    render(<MediaBandeja token="tk-test" naviId="navi-1" />);

    await waitFor(() =>
      expect(screen.getByText('foto-producto.jpg')).toBeTruthy(),
    );

    // Disparar upload con archivo inválido
    const fileInput = screen.getByLabelText('Seleccionar archivo de media');
    const badFile   = new File(['datos'], 'doc.pdf', { type: 'application/pdf' });

    Object.defineProperty(fileInput, 'files', {
      value:      [badFile],
      writable:   true,
      configurable: true,
    });

    fireEvent.change(fileInput);

    // El error debe aparecer en la UI
    await waitFor(() =>
      expect(screen.getByText(/formato no soportado/i)).toBeTruthy(),
    );

    // La lista original permanece intacta
    expect(screen.getByText('foto-producto.jpg')).toBeTruthy();
  });
});
