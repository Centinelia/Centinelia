// @vitest-environment jsdom

/**
 * Tests para CalendarioEditorial — calendario mensual de borradores programados.
 *
 * Cubre:
 *   1. Renderiza grid del mes y popula slots desde el calendar fetch
 *   2. Clicking "Aprobar calendario del mes" hace POST al endpoint correcto
 *   3. Calendario vacío (fetch devuelve slots=[]) muestra empty state
 *   4. Navegación al mes anterior/siguiente actualiza el mes visible
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent }   from '@testing-library/react';
import CalendarioEditorial                       from '../CalendarioEditorial';

vi.mock('next/navigation', () => ({
  useParams:   () => ({ token: 'tk-test' }),
  usePathname: () => '/portal/tk-test/oficina/redes/navi-1',
}));

const MOCK_SLOT = {
  id:   'slot-abc',
  date: '2026-09-10',
  status: 'pending_approval',
  content_draft: {
    id:       'draft-xyz',
    caption:  'Publicación de septiembre',
    hashtags: ['septiembre'],
    media_urls: [],
    status:   'pending_approval',
    scheduled_for: null,
  },
};

function mockFetch(handler: (url: string, opts?: RequestInit) => Promise<Response>) {
  global.fetch = handler as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CalendarioEditorial', () => {
  it('renderiza grid del mes y muestra botón de día con publicación tras carga exitosa', async () => {
    mockFetch(async () => ({
      ok:   true,
      json: async () => ({
        data: { slots: [MOCK_SLOT], approved: false },
      }),
    } as Response));

    render(
      <CalendarioEditorial
        token="tk-test"
        naviId="navi-1"
        month="2026-09"
      />,
    );

    // Estado inicial de carga
    expect(screen.getByText(/cargando calendario/i)).toBeTruthy();

    // Después del fetch el nombre del mes aparece en el encabezado
    await waitFor(() =>
      expect(screen.getByText(/septiembre 2026/i)).toBeTruthy(),
    );

    // El contador de publicaciones muestra "1 publicaciones programadas"
    await waitFor(() =>
      expect(screen.getByText(/1 publicaciones programadas/i)).toBeTruthy(),
    );

    // Los nombres de los días de la semana están presentes
    expect(screen.getByText('Lun')).toBeTruthy();
    expect(screen.getByText('Vie')).toBeTruthy();

    // El día 10 tiene un botón con aria-label que menciona "tiene publicación"
    const dia10 = screen.getByLabelText(/día 10.*tiene publicación/i);
    expect(dia10).toBeTruthy();
  });

  it('clicking "Aprobar calendario del mes" hace POST al endpoint correcto', async () => {
    let postUrl  = '';
    let postBody: Record<string, string> | null = null;

    mockFetch(async (url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        postUrl  = url;
        postBody = JSON.parse(opts.body as string) as Record<string, string>;
        return {
          ok:   true,
          json: async () => ({ ok: true }),
        } as Response;
      }
      // GET inicial
      return {
        ok:   true,
        json: async () => ({
          data: { slots: [MOCK_SLOT], approved: false },
        }),
      } as Response;
    });

    render(
      <CalendarioEditorial
        token="tk-test"
        naviId="navi-1"
        month="2026-09"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/aprobar calendario del mes/i)).toBeTruthy(),
    );

    fireEvent.click(screen.getByText(/aprobar calendario del mes/i));

    await waitFor(() => {
      expect(postBody).not.toBeNull();
      expect(postBody!.agent_id).toBe('navi-1');
    });

    expect(postUrl).toContain('/api/portal/tk-test/social/calendar/2026-09/approve');

    // Después de aprobar aparece el estado "Calendario aprobado"
    await waitFor(() =>
      expect(screen.getByText(/calendario aprobado/i)).toBeTruthy(),
    );
  });

  it('muestra estado vacío cuando el fetch devuelve slots=[] (sin publicaciones)', async () => {
    mockFetch(async () => ({
      ok:   true,
      json: async () => ({
        data: { slots: [], approved: false },
      }),
    } as Response));

    render(
      <CalendarioEditorial
        token="tk-test"
        naviId="navi-1"
        month="2026-09"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/0 publicaciones programadas/i)).toBeTruthy(),
    );

    // El botón "Aprobar calendario del mes" NO debe aparecer cuando no hay slots
    expect(screen.queryByText(/aprobar calendario del mes/i)).toBeNull();

    // El grid del mes sí se renderiza (nombre del mes presente)
    expect(screen.getByText(/septiembre 2026/i)).toBeTruthy();
  });

  it('navegación al mes siguiente actualiza el encabezado al mes correcto', async () => {
    const fetchedMonths: string[] = [];

    mockFetch(async (url: string) => {
      // Capturar el mes de cada GET
      const match = url.match(/calendar\/(\d{4}-\d{2})/);
      if (match) fetchedMonths.push(match[1]);
      return {
        ok:   true,
        json: async () => ({
          data: { slots: [], approved: false },
        }),
      } as Response;
    });

    render(
      <CalendarioEditorial
        token="tk-test"
        naviId="navi-1"
        month="2026-09"
      />,
    );

    // Esperar la carga inicial
    await waitFor(() =>
      expect(screen.getByText(/septiembre 2026/i)).toBeTruthy(),
    );

    // Clic en "Mes siguiente"
    fireEvent.click(screen.getByLabelText('Mes siguiente'));

    // El encabezado debe cambiar a Octubre 2026
    await waitFor(() =>
      expect(screen.getByText(/octubre 2026/i)).toBeTruthy(),
    );

    // El fetch fue llamado con el mes correcto (2026-10)
    expect(fetchedMonths).toContain('2026-10');

    // Clic en "Mes anterior" regresa a Septiembre
    fireEvent.click(screen.getByLabelText('Mes anterior'));

    await waitFor(() =>
      expect(screen.getByText(/septiembre 2026/i)).toBeTruthy(),
    );

    expect(fetchedMonths).toContain('2026-09');
  });
});
