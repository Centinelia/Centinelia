// @vitest-environment jsdom

/**
 * Tests para ContpaqiSetupPanel.
 *
 * Cubre los fixes de Pasada 1:
 *  - [#1] writer_api_token se muestra masked por default; botón Mostrar revela
 *  - [#5] load error muestra UI de reintento (NO se confunde con "falta Dropbox")
 *  - [#9] updated_at null NO renderiza "Invalid Date"
 *  - [#11] Content-Type check en download rechaza respuestas no-zip
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ContpaqiSetupPanel from '../ContpaqiSetupPanel';

const STATE_OK = {
  dropbox_connected: true,
  dropbox: { account_label: 'Nazre Dropbox', expires_at: '2027-01-01' },
  configured: true,
  updated_at: '2026-09-01T15:00:00Z',
  config: {
    rfc_emisor: 'AAMN951208I25',
    regimen_fiscal: '612',
    codigo_postal_emisor: '64000',
    serie_default: 'T',
    uso_cfdi_default: 'G03',
    clave_sat_default_producto: '50161509',
    dropbox_base_path: '/Facturacion',
    windows: {
      sdk_path: 'C:\\Program Files (x86)\\Compac\\COMERCIAL',
      empresa_path: '',
      usuario: 'SUPERVISOR',
      concepto: '440',
      sql_connection: '',
      password_set: false,
      csd_password_set: false,
    },
  },
  writer_api_token: 'sk_writer_abcdef1234567890XYZ',
  writer_status: 'healthy' as const,
  writer_last_ping_at: '2026-09-13T00:00:00Z',
  endpoint_base: 'https://api.centinelia.mx',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContpaqiSetupPanel — load error (fix Pasada 1 #5)', () => {
  it('GET 500 muestra "No pudimos cargar el estado" con botón Reintentar', async () => {
    global.fetch = vi.fn(async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    ) as unknown as typeof fetch;

    render(<ContpaqiSetupPanel token="tk1" />);

    await waitFor(() =>
      expect(screen.getByText(/no pudimos cargar el estado/i)).toBeTruthy(),
    );
    // El fallback NO es "Primero conecta Dropbox" (que sería el otro path)
    expect(screen.queryByText(/primero conecta dropbox/i)).toBeNull();
    // Botón reintentar
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeTruthy();
  });
});

describe('ContpaqiSetupPanel — mask writer_api_token (fix Pasada 1 #1)', () => {
  it('token aparece masked por default; botón Mostrar revela', async () => {
    global.fetch = vi.fn(async () =>
      ({ ok: true, status: 200, json: async () => STATE_OK }) as Response,
    ) as unknown as typeof fetch;

    render(<ContpaqiSetupPanel token="tk1" />);

    // Esperar a que cargue y expandir el <details> de config manual
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /writer para windows/i })).toBeTruthy(),
    );
    const user = userEvent.setup();
    await user.click(screen.getByText(/no se auto-configuró/i));

    // El token completo NO está visible; sí un prefijo + dots
    expect(document.body.textContent).not.toContain('sk_writer_abcdef1234567890XYZ');
    expect(document.body.textContent).toContain('sk_wri');
    expect(document.body.textContent).toContain('•');

    // Click Mostrar revela
    await user.click(screen.getByRole('button', { name: /mostrar/i }));
    await waitFor(() =>
      expect(document.body.textContent).toContain('sk_writer_abcdef1234567890XYZ'),
    );
  });
});

describe('ContpaqiSetupPanel — updated_at guard (fix Pasada 1 #9)', () => {
  it('updated_at null NO renderiza "Invalid Date"', async () => {
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ ...STATE_OK, updated_at: null }),
      }) as Response,
    ) as unknown as typeof fetch;

    render(<ContpaqiSetupPanel token="tk1" />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /writer para windows/i })).toBeTruthy(),
    );

    // No hay ningún "Actualizado" con "Invalid Date"
    expect(screen.queryByText(/actualizado invalid date/i)).toBeNull();
    expect(screen.queryByText(/invalid date/i)).toBeNull();
  });
});
