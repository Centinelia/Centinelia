// @vitest-environment jsdom

/**
 * Tests para CrossAccountReplicator — formulario de replicación multi-cuenta.
 *
 * Cubre:
 *   1. Renderiza checkboxes por cada cuenta activa del portfolio
 *   2. Submit llama POST /replicate con body correcto (agent_id, source_media_id, target_account_ids)
 *   3. Muestra error inline cuando el API devuelve ACCOUNT_NOT_MANAGED
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent }    from '@testing-library/react';
import CrossAccountReplicator                     from '../CrossAccountReplicator';

vi.mock('next/navigation', () => ({
  useRouter:   () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

const MOCK_ACCOUNTS = [
  { id: 'acc-1', external_username: 'cuenta_a', status: 'active', paused: false },
  { id: 'acc-2', external_username: 'cuenta_b', status: 'active', paused: false },
];

function mockFetch(handler: (_url: string, opts?: RequestInit) => Promise<Response>) {
  global.fetch = handler as unknown as typeof fetch;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('CrossAccountReplicator', () => {
  it('renderiza checkboxes por cada cuenta activa del portfolio', () => {
    render(
      <CrossAccountReplicator token="tk-test" naviId="navi-1" accounts={MOCK_ACCOUNTS} />,
    );

    // Checkbox para cada cuenta
    expect(screen.getByLabelText(/cuenta cuenta_a/i)).toBeTruthy();
    expect(screen.getByLabelText(/cuenta cuenta_b/i)).toBeTruthy();

    // Input de media id
    expect(screen.getByLabelText(/id o url del contenido origen/i)).toBeTruthy();

    // Botón submit
    expect(screen.getByRole('button', { name: /replicar/i })).toBeTruthy();
  });

  it('submit llama POST /replicate con el body correcto', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    mockFetch(async (_url: string, opts?: RequestInit) => {
      capturedBody = JSON.parse(opts?.body as string) as Record<string, unknown>;
      return {
        ok:   true,
        json: async () => ({ ok: true, drafts: [] }),
      } as Response;
    });

    render(
      <CrossAccountReplicator token="tk-test" naviId="navi-1" accounts={MOCK_ACCOUNTS} />,
    );

    // Llenar media id
    fireEvent.change(screen.getByLabelText(/id o url del contenido origen/i), {
      target: { value: 'media-123' },
    });

    // Seleccionar cuenta acc-1
    fireEvent.click(screen.getByLabelText(/cuenta cuenta_a/i));

    // Submit
    const submitBtn = screen.getByRole('button', { name: /replicar en/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.agent_id).toBe('navi-1');
      expect(capturedBody!.source_media_id).toBe('media-123');
      expect((capturedBody!.target_account_ids as string[])).toContain('acc-1');
    });
  });

  it('muestra error inline cuando el API devuelve error ACCOUNT_NOT_MANAGED', async () => {
    mockFetch(async () => ({
      ok:   false,
      json: async () => ({ error: 'ACCOUNT_NOT_MANAGED: cuenta no gestionada', code: 'ACCOUNT_NOT_MANAGED' }),
    } as Response));

    render(
      <CrossAccountReplicator token="tk-test" naviId="navi-1" accounts={MOCK_ACCOUNTS} />,
    );

    // Llenar campos y seleccionar cuenta
    fireEvent.change(screen.getByLabelText(/id o url del contenido origen/i), {
      target: { value: 'media-xyz' },
    });
    fireEvent.click(screen.getByLabelText(/cuenta cuenta_a/i));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /replicar en/i }));

    // Error visible
    await waitFor(() =>
      expect(screen.getByText(/account_not_managed/i)).toBeTruthy(),
    );
  });
});
