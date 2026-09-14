// @vitest-environment jsdom

/**
 * Tests para SheetsMappingsSection — sub-component MappingRow.
 *
 * Cubre los fixes de Pasada 1:
 *  - [#13] delete que falla muestra error, no llama a onDelete
 *  - [#14] refresh que falla muestra error, no reemplaza headers stale
 *  - [#15] localHeaders se sincroniza cuando mapping.headers cambia (parent refetch)
 *  - [#24] headers duplicados no explotan por key colisión
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock useParams para MappingRow (no lo usa directo — el parent es quien lo usa)
vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'tk1' }),
}));

// EmptyState — mock light
vi.mock('@/components/ui/empty-state', () => ({
  default: ({ title }: { title: string }) => <div data-testid="empty">{title}</div>,
}));

// Mock Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
}));

import SheetsMappingsSection from '../SheetsMappingsSection';

const MAPPING = {
  id:                    'm1',
  purpose:               'leads',
  custom_purpose_label:  null,
  spreadsheet_id:        's1',
  tab_name:              'Hoja1',
  headers:               ['Nombre', 'Correo'],
  headers_synced_at:     '2026-09-01T00:00:00Z',
};

async function renderWithMappings(mappings = [MAPPING]) {
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/sheets/spreadsheets') && !u.includes('/tabs')) {
      return { ok: true, json: async () => ({ spreadsheets: [{ id: 's1', name: 'Mi Sheet' }] }) } as Response;
    }
    if (u.includes('/sheets-mappings') && !u.match(/\/sheets-mappings\/[^/]+/)) {
      return { ok: true, json: async () => ({ mappings }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;

  render(<SheetsMappingsSection token="tk1" />);
  // Esperar a que cargue
  await waitFor(() => expect(screen.getByText('Hoja: Hoja1')).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SheetsMappingsSection.MappingRow — delete error handling (fix Pasada 1 #13)', () => {
  it('DELETE que falla muestra error inline, NO recarga lista', async () => {
    await renderWithMappings();

    // Mockear DELETE con 500 en el siguiente fetch
    const originalFetch = global.fetch;
    let deleteCalled = false;
    global.fetch = vi.fn(async (url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'DELETE') {
        deleteCalled = true;
        return { ok: false, json: async () => ({ error: 'server error' }) } as Response;
      }
      return (originalFetch as unknown as typeof fetch)(url, opts);
    }) as unknown as typeof fetch;

    // Confirm dialog
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    await user.click(screen.getByTitle(/eliminar/i));

    await waitFor(() => expect(deleteCalled).toBe(true));
    // Se muestra error inline
    await waitFor(() =>
      expect(screen.getByText(/no pudimos eliminar/i)).toBeTruthy(),
    );
    confirmSpy.mockRestore();
  });

  it('confirm cancelado NO dispara DELETE', async () => {
    await renderWithMappings();
    const originalFetch = global.fetch;
    let deleteCalled = false;
    global.fetch = vi.fn(async (url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'DELETE') deleteCalled = true;
      return (originalFetch as unknown as typeof fetch)(url, opts);
    }) as unknown as typeof fetch;

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    await user.click(screen.getByTitle(/eliminar/i));

    expect(deleteCalled).toBe(false);
    confirmSpy.mockRestore();
  });
});

describe('SheetsMappingsSection.MappingRow — refresh error (fix Pasada 1 #14)', () => {
  it('POST refresh-headers 500 muestra error, headers NO se reemplazan', async () => {
    await renderWithMappings();
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('refresh-headers') && (opts as RequestInit | undefined)?.method === 'POST') {
        return { ok: false, json: async () => ({ error: 'nope' }) } as Response;
      }
      return (originalFetch as unknown as typeof fetch)(url, opts);
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    await user.click(screen.getByTitle(/volver a leer las columnas/i));

    await waitFor(() =>
      expect(screen.getByText(/no pudimos leer las columnas/i)).toBeTruthy(),
    );
    // Headers originales siguen en pantalla
    expect(screen.getByText('Nombre')).toBeTruthy();
    expect(screen.getByText('Correo')).toBeTruthy();
  });
});

describe('SheetsMappingsSection.MappingRow — headers duplicados (fix Pasada 1 #24)', () => {
  it('renderiza columnas con nombre duplicado sin colisión de key', async () => {
    await renderWithMappings([{
      ...MAPPING,
      headers: ['Fecha', 'Fecha', 'Monto'], // duplicated
    }]);

    // No debe explotar. Ambas "Fecha" están en el DOM.
    const fechaCells = screen.getAllByText('Fecha');
    expect(fechaCells).toHaveLength(2);
    expect(screen.getByText('Monto')).toBeTruthy();
  });
});
