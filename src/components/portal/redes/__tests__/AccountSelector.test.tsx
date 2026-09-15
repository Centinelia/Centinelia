// @vitest-environment jsdom

/**
 * Tests para AccountSelector — combobox de cuentas sociales.
 *
 * Cubre:
 *   1. Renderiza las cuentas en el select con sus @handles
 *   2. onSelect se dispara con el id correcto al cambiar la selección
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent }              from '@testing-library/react';
import AccountSelector                            from '../AccountSelector';

const MOCK_ACCOUNTS = [
  { id: 'acc-1', external_username: 'mi_negocio', status: 'active',       paused: false },
  { id: 'acc-2', external_username: 'otro_negocio', status: 'needs_reauth', paused: false },
];

beforeEach(() => { vi.clearAllMocks(); });

describe('AccountSelector', () => {
  it('renderiza las cuentas con sus @handles en el select', () => {
    render(
      <AccountSelector
        accounts={MOCK_ACCOUNTS}
        currentId={null}
        onSelect={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: /seleccionar cuenta/i });
    expect(select).toBeTruthy();

    // Opción "Todas las cuentas" presente
    expect(screen.getByText(/todas las cuentas/i)).toBeTruthy();

    // Cuentas presentes
    expect(screen.getByText(/@mi_negocio/)).toBeTruthy();
    expect(screen.getByText(/@otro_negocio/)).toBeTruthy();
  });

  it('onSelect se llama con el id al cambiar la selección', () => {
    const onSelect = vi.fn();

    render(
      <AccountSelector
        accounts={MOCK_ACCOUNTS}
        currentId={null}
        onSelect={onSelect}
      />,
    );

    const select = screen.getByRole('combobox', { name: /seleccionar cuenta/i });
    fireEvent.change(select, { target: { value: 'acc-1' } });

    expect(onSelect).toHaveBeenCalledWith('acc-1');
  });
});
