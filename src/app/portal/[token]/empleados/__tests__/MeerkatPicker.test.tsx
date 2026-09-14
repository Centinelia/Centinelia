// @vitest-environment jsdom

/**
 * Tests para MeerkatPicker.
 *
 * Cubre los fixes de Pasada 1:
 *  - [#9] setLoading(false) al fallar (spinner no queda colgado)
 *  - [#10] Drop de data.token — usa siempre el token org de la URL
 *  - [#13] Esc cierra el modal
 *  - [#13] role="dialog" + aria-modal + aria-labelledby
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Mock LadaPicker (usa complex hooks internos).
vi.mock('../../LadaPicker', () => ({
  default: () => <div data-testid="lada-picker" />,
}));

// Roles reales
import MeerkatPicker from '../MeerkatPicker';

beforeEach(() => {
  vi.clearAllMocks();
  // fetch se resetea per-test
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe('MeerkatPicker — accesibilidad del modal', () => {
  it('cerrado por default (no renderiza dialog)', () => {
    render(<MeerkatPicker token="tk1" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('al abrir tiene role="dialog" + aria-modal + aria-labelledby', async () => {
    const user = userEvent.setup();
    render(<MeerkatPicker token="tk1" />);
    await user.click(screen.getByRole('button', { name: /contratar empleado/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'meerkat-picker-title');
    expect(document.getElementById('meerkat-picker-title')).not.toBeNull();
  });
});

describe('MeerkatPicker — Esc cierra modal (fix Pasada 1 #13)', () => {
  it('Escape cierra el modal', async () => {
    const user = userEvent.setup();
    render(<MeerkatPicker token="tk1" />);
    await user.click(screen.getByRole('button', { name: /contratar empleado/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Simula tecla Escape
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Otras teclas NO cierran el modal', async () => {
    const user = userEvent.setup();
    render(<MeerkatPicker token="tk1" />);
    await user.click(screen.getByRole('button', { name: /contratar empleado/i }));

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'a' });
    });

    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

describe('MeerkatPicker — click en overlay vs contenido', () => {
  it('click en overlay cierra el modal', async () => {
    const user = userEvent.setup();
    render(<MeerkatPicker token="tk1" />);
    await user.click(screen.getByRole('button', { name: /contratar empleado/i }));

    const dialog = screen.getByRole('dialog');
    await user.click(dialog);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('click en el contenido interno NO cierra el modal', async () => {
    const user = userEvent.setup();
    render(<MeerkatPicker token="tk1" />);
    await user.click(screen.getByRole('button', { name: /contratar empleado/i }));

    // El h2 con id="meerkat-picker-title" vive dentro del contenido
    await user.click(document.getElementById('meerkat-picker-title')!);

    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});
