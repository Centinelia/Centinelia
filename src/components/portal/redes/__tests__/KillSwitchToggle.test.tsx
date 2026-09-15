// @vitest-environment jsdom

/**
 * Tests para KillSwitchToggle — control de pausa/reactivación de publicaciones.
 *
 * Cubre:
 *   1. Estado inicial cuando currentlyPaused=false (activo) y =true (pausado)
 *   2. Click abre el diálogo de confirmación
 *   3. Cancelar cierra el diálogo sin llamar al API
 *   4. POST /pause con body { agent_id, reason } al confirmar (scope=navi)
 *   5. POST /resume con body { social_account_id } al reactivar (scope=account)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent }   from '@testing-library/react';
import KillSwitchToggle                          from '../KillSwitchToggle';

vi.mock('next/navigation', () => ({
  useParams:   () => ({}),
  usePathname: () => '/',
}));

function mockFetch(handler: (_url: string, opts?: RequestInit) => Promise<Response>) {
  global.fetch = handler as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KillSwitchToggle — estado inicial', () => {
  it('muestra "Publicaciones activas" cuando currentlyPaused es false', () => {
    render(
      <KillSwitchToggle token="tk-test" scope="navi" id="agent-uuid" currentlyPaused={false} />,
    );
    expect(screen.getByText('Publicaciones activas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /pausar publicaciones/i })).toBeTruthy();
  });

  it('muestra "Publicaciones pausadas" y el motivo cuando currentlyPaused es true', () => {
    render(
      <KillSwitchToggle
        token="tk-test"
        scope="navi"
        id="agent-uuid"
        currentlyPaused={true}
        reason="Vacaciones"
      />,
    );
    expect(screen.getByText('Publicaciones pausadas')).toBeTruthy();
    expect(screen.getByText('Motivo: Vacaciones')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reactivar publicaciones/i })).toBeTruthy();
  });
});

describe('KillSwitchToggle — diálogo de confirmación', () => {
  it('click en "Pausar" abre el diálogo con rol=dialog', async () => {
    render(
      <KillSwitchToggle token="tk-test" scope="navi" id="agent-uuid" currentlyPaused={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /pausar publicaciones/i }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    // Botones de Cancelar y Pausar presentes dentro del diálogo
    expect(screen.getByText('Cancelar')).toBeTruthy();
    // El botón de confirmar con texto "Pausar" (dentro del diálogo)
    const allPauseButtons = screen.getAllByText(/^pausar$/i);
    expect(allPauseButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('cancelar cierra el diálogo sin llamar al API', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <KillSwitchToggle token="tk-test" scope="account" id="account-uuid" currentlyPaused={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /pausar publicaciones/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    fireEvent.click(screen.getByText('Cancelar'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Sin llamadas a fetch
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('KillSwitchToggle — llamadas al API', () => {
  it('POST /pause con { agent_id, reason } al confirmar pausa (scope=navi)', async () => {
    let postedBody: Record<string, string> | null = null;
    let calledUrl = '';

    mockFetch(async (url: string, opts?: RequestInit) => {
      calledUrl  = url;
      postedBody = JSON.parse(opts?.body as string) as Record<string, string>;
      return { ok: true, json: async () => ({ ok: true, paused: 1 }) } as Response;
    });

    const onToggle = vi.fn();

    render(
      <KillSwitchToggle
        token="tk-test"
        scope="navi"
        id="agent-uuid-123"
        currentlyPaused={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /pausar publicaciones/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    // Escribir motivo en el campo opcional
    const reasonInput = screen.getByLabelText(/motivo/i);
    fireEvent.change(reasonInput, { target: { value: 'Mantenimiento temporal' } });

    // Confirmar pausa — el botón "Pausar" dentro del diálogo
    // El diálogo tiene aria-label "Confirmar pausa"
    const dialog = screen.getByRole('dialog');
    const confirmBtns = dialog.querySelectorAll('button');
    // El último botón en el diálogo es el de confirmación (Cancelar, Pausar)
    const confirmBtn = confirmBtns[confirmBtns.length - 1];
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(postedBody).not.toBeNull();
      expect(postedBody!.agent_id).toBe('agent-uuid-123');
      expect(postedBody!.reason).toBe('Mantenimiento temporal');
    });

    expect(calledUrl).toContain('/pause');
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(true));
  });

  it('POST /resume con { social_account_id } al reactivar (scope=account)', async () => {
    let postedBody: Record<string, string> | null = null;
    let calledUrl = '';

    mockFetch(async (url: string, opts?: RequestInit) => {
      calledUrl  = url;
      postedBody = JSON.parse(opts?.body as string) as Record<string, string>;
      return { ok: true, json: async () => ({ ok: true, paused: 0 }) } as Response;
    });

    render(
      <KillSwitchToggle
        token="tk-test"
        scope="account"
        id="account-uuid-456"
        currentlyPaused={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reactivar publicaciones/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    // Confirmar reactivación
    const confirmBtn = screen.getByRole('button', { name: /^reactivar$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(postedBody).not.toBeNull();
      expect(postedBody!.social_account_id).toBe('account-uuid-456');
    });

    expect(calledUrl).toContain('/resume');
  });
});
