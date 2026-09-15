// @vitest-environment jsdom

/**
 * Tests para AccountsGrid — tabla CRUD portfolio de cuentas IG.
 *
 * Cubre:
 *   1. Renderiza todas las cuentas incluyendo las desconectadas (retención histórica)
 *   2. Click Eliminar en cuenta activa dispara DELETE con confirm dialog
 *   3. Click "Agregar cuenta IG" (empty state) navega al OAuth initiator
 *   4. Cuenta con status='needs_reauth' muestra CTA "Reconectar" via label Reconectar
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent }    from '@testing-library/react';
import AccountsGrid                              from '../AccountsGrid';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const MOCK_ACCOUNTS = [
  {
    id:                'acc-1',
    external_username: 'cuenta_activa',
    status:            'active',
    paused:            false,
    paused_reason:     null,
    created_at:        '2026-09-01T00:00:00Z',
  },
  {
    id:                'acc-2',
    external_username: 'cuenta_desconectada',
    status:            'disconnected',
    paused:            true,
    paused_reason:     null,
    created_at:        '2026-08-15T00:00:00Z',
  },
  {
    id:                'acc-3',
    external_username: 'cuenta_reauth',
    status:            'needs_reauth',
    paused:            false,
    paused_reason:     null,
    created_at:        '2026-09-10T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Restaurar window.confirm a un stub que aprueba por defecto
  vi.stubGlobal('confirm', vi.fn(() => true));
  // Limpiar fetch
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe('AccountsGrid', () => {
  it('renderiza todas las cuentas incluyendo las desconectadas (retención histórica)', () => {
    render(
      <AccountsGrid
        token="tk-test"
        naviId="navi-1"
        initialAccounts={MOCK_ACCOUNTS}
        connectUrl="/api/portal/tk-test/social/accounts/connect?provider=meta&agentId=navi-1"
      />,
    );

    // Las tres cuentas deben aparecer en pantalla
    expect(screen.getByText('@cuenta_activa')).toBeTruthy();
    expect(screen.getByText('@cuenta_desconectada')).toBeTruthy();
    expect(screen.getByText('@cuenta_reauth')).toBeTruthy();

    // La desconectada muestra su label de estado
    expect(screen.getByText('Desconectada')).toBeTruthy();
  });

  it('click Eliminar en cuenta activa dispara DELETE al endpoint correcto con confirm', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({}),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(
      <AccountsGrid
        token="tk-test"
        naviId="navi-1"
        initialAccounts={MOCK_ACCOUNTS}
        connectUrl="/api/portal/tk-test/social/accounts/connect?provider=meta&agentId=navi-1"
      />,
    );

    // El botón de eliminar solo existe para cuentas no desconectadas
    const deleteBtn = screen.getByRole('button', { name: /desconectar cuenta cuenta_activa/i });
    fireEvent.click(deleteBtn);

    // confirm debe haberse llamado
    expect(window.confirm).toHaveBeenCalledOnce();

    // fetch debe haberse llamado con DELETE al endpoint correcto
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/portal/tk-test/social/accounts/acc-1',
        { method: 'DELETE' },
      );
    });

    // Tras el delete, la cuenta pasa a Desconectada localmente (sin refetch)
    await waitFor(() => {
      // Ahora hay dos filas desconectadas
      const desconectadas = screen.getAllByText('Desconectada');
      expect(desconectadas.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('click Agregar cuenta IG en empty state apunta al URL OAuth initiator con provider=meta', () => {
    render(
      <AccountsGrid
        token="tk-test"
        naviId="navi-1"
        initialAccounts={[]}
        connectUrl="/api/portal/tk-test/social/accounts/connect?provider=meta&agentId=navi-1"
      />,
    );

    // Empty state visible
    expect(screen.getByText(/sin cuentas en el portfolio/i)).toBeTruthy();

    // El enlace apunta al URL OAuth con provider=meta
    const connectLink = screen.getByRole('link', { name: /conectar instagram/i });
    expect(connectLink).toBeTruthy();
    const href = connectLink.getAttribute('href') ?? '';
    expect(href).toContain('provider=meta');
    expect(href).toContain('agentId=navi-1');
  });

  it('cuenta con status needs_reauth muestra etiqueta Token vencido', () => {
    render(
      <AccountsGrid
        token="tk-test"
        naviId="navi-1"
        initialAccounts={MOCK_ACCOUNTS}
        connectUrl="/api/portal/tk-test/social/accounts/connect?provider=meta&agentId=navi-1"
      />,
    );

    // La cuenta con needs_reauth muestra el label de estado "Token vencido"
    expect(screen.getByText('Token vencido')).toBeTruthy();

    // El botón de eliminar existe para la cuenta needs_reauth (no está desconectada)
    const deleteBtn = screen.getByRole('button', { name: /desconectar cuenta cuenta_reauth/i });
    expect(deleteBtn).toBeTruthy();
  });
});
