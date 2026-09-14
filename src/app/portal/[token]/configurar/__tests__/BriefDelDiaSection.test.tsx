// @vitest-environment jsdom

/**
 * Tests para BriefDelDiaSection.
 *
 * Cubre el fix de Pasada 1 [#12]: si el GET inicial falla, no cargamos
 * DEFAULT silenciosamente ni permitimos guardar sobre-escribiendo el server.
 * Mostramos error explícito.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'tk1' }),
}));

// Mock Select (usa Radix + fuera de scope)
vi.mock('@/components/ui/select', () => ({
  Select:        ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem:    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue:   ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { BriefDelDiaSection } from '../BriefDelDiaSection';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BriefDelDiaSection — load error handling (fix Pasada 1 #12)', () => {
  it('GET 500 muestra error explícito y NO renderiza el form', async () => {
    global.fetch = vi.fn(async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    ) as unknown as typeof fetch;

    render(<BriefDelDiaSection agentId="a1" />);

    await waitFor(() =>
      expect(screen.getByText(/no pudimos cargar tu configuraci/i)).toBeTruthy(),
    );
    // El form NO renderizó (no hay botón "Guardar")
    expect(screen.queryByText(/^Guardar$/)).toBeNull();
  });

  it('GET 200 renderiza el form con la config del server', async () => {
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({
          config: {
            enabled:  true,
            hour:     9,
            channels: { email: true, whatsapp: false, portal: true },
          },
        }),
      }) as Response,
    ) as unknown as typeof fetch;

    render(<BriefDelDiaSection agentId="a1" />);

    await waitFor(() => expect(screen.getByText(/Guardar/)).toBeTruthy());
    // Toggle principal está marcado
    const toggleInput = screen.getByLabelText(/activar brief diario/i);
    expect(toggleInput).toBeChecked();
  });
});
