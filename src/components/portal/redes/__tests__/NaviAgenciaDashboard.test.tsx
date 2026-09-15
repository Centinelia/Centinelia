// @vitest-environment jsdom

/**
 * Tests para NaviAgenciaDashboard — dashboard portfolio de cuentas IG.
 *
 * Cubre:
 *   1. Renderiza la tabla con columnas @handle, Estado, Acciones tras fetch exitoso
 *   2. Muestra engagement y pendientes en las columnas correctas
 *   3. KillSwitchToggle está presente por cada fila de la tabla
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor }               from '@testing-library/react';
import NaviAgenciaDashboard                       from '../NaviAgenciaDashboard';

vi.mock('next/navigation', () => ({
  useRouter:   () => ({ push: vi.fn() }),
  usePathname: () => '/portal/tk-test/oficina/redes/navi-1',
  useParams:   () => ({ token: 'tk-test', naviId: 'navi-1' }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const MOCK_ACCOUNTS = [
  {
    id:                'acc-1',
    external_username: 'negocio_uno',
    status:            'active',
    paused:            false,
    pending_count:     3,
    likes_7d:          120,
    comments_7d:       8,
  },
  {
    id:                'acc-2',
    external_username: 'negocio_dos',
    status:            'needs_reauth',
    paused:            false,
    pending_count:     0,
    likes_7d:          null,
    comments_7d:       null,
  },
];

function mockFetch(data: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok:   true,
    json: async () => ({ data }),
  }) as unknown as typeof fetch;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('NaviAgenciaDashboard', () => {
  it('renderiza tabla con filas por cuenta tras fetch exitoso', async () => {
    mockFetch(MOCK_ACCOUNTS);

    render(<NaviAgenciaDashboard token="tk-test" naviId="navi-1" agentName="Agencia Demo" />);

    // Cargando inicialmente
    expect(screen.getByText(/cargando cuentas/i)).toBeTruthy();

    // Tras fetch: handles en la tabla (pueden aparecer en dropdown + tabla, usar getAllByText)
    await waitFor(() => expect(screen.getAllByText('@negocio_uno').length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText('@negocio_dos').length).toBeGreaterThanOrEqual(1);

    // Chips de estado
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('Reconectar')).toBeTruthy();
  });

  it('muestra engagement 7d y pendientes en las filas', async () => {
    mockFetch(MOCK_ACCOUNTS);

    render(<NaviAgenciaDashboard token="tk-test" naviId="navi-1" agentName="Demo" />);

    await waitFor(() => expect(screen.getAllByText('@negocio_uno').length).toBeGreaterThanOrEqual(1));

    // Cuenta 1: tiene likes y pendientes
    expect(screen.getByText(/120/)).toBeTruthy();          // likes_7d
    expect(screen.getByText('3')).toBeTruthy();             // pending_count

    // Cuenta 2: sin datos -> guiones
    const dashElements = screen.getAllByText('—');
    expect(dashElements.length).toBeGreaterThanOrEqual(1);
  });

  it('incluye un KillSwitchToggle por cada cuenta de la tabla', async () => {
    mockFetch(MOCK_ACCOUNTS);

    render(<NaviAgenciaDashboard token="tk-test" naviId="navi-1" agentName="Demo" />);

    await waitFor(() => expect(screen.getAllByText('@negocio_uno').length).toBeGreaterThanOrEqual(1));

    // Cada fila tiene un botón de pausa/reactivación
    const pauseButtons = screen.getAllByRole('button', { name: /pausar publicaciones|reactivar publicaciones/i });
    expect(pauseButtons.length).toBe(MOCK_ACCOUNTS.length);
  });
});
