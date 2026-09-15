// @vitest-environment jsdom

/**
 * Tests para CrossAccountView — calendario mensual con dots por cuenta.
 *
 * Cubre:
 *   1. Renderiza calendar grid con dots coloreados por social_account_id
 *      (N cuentas -> N colores distintos en la leyenda)
 *   2. Accounts array se propaga correctamente: leyenda muestra handles de todas las cuentas
 *   3. Empty drafts (fetch retorna []) muestra el calendario sin dots (empty state del mes)
 *   4. Múltiples drafts en el mismo día se agrupan por cuenta al seleccionar el día
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent }             from '@testing-library/react';
import CrossAccountView                          from '../CrossAccountView';

const MOCK_ACCOUNTS = [
  { id: 'acc-1', external_username: 'cuenta_uno',  status: 'active', paused: false },
  { id: 'acc-2', external_username: 'cuenta_dos',  status: 'active', paused: false },
  { id: 'acc-3', external_username: 'cuenta_tres', status: 'active', paused: false },
];

const CURRENT_MONTH = '2026-09'; // mes fijo para tests deterministas

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CrossAccountView', () => {
  it('renderiza leyenda con un color distinto por cuenta (N cuentas -> N entradas)', () => {
    render(
      <CrossAccountView
        accounts={MOCK_ACCOUNTS}
        drafts={[]}
        currentMonth={CURRENT_MONTH}
      />,
    );

    // La leyenda muestra el handle de cada cuenta
    expect(screen.getByText(/@cuenta_uno/)).toBeTruthy();
    expect(screen.getByText(/@cuenta_dos/)).toBeTruthy();
    expect(screen.getByText(/@cuenta_tres/)).toBeTruthy();

    // Hay exactamente 3 dots de leyenda (spans con background en style)
    // Los dots de leyenda son spans con clase w-2.5 h-2.5 rounded-full
    const legendDots = document.querySelectorAll('span.w-2\\.5.h-2\\.5.rounded-full');
    expect(legendDots.length).toBe(MOCK_ACCOUNTS.length);

    // Cada dot tiene un color distinto (verificar via style.background)
    const colors = Array.from(legendDots).map(el => (el as HTMLElement).style.background);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(MOCK_ACCOUNTS.length);
  });

  it('propaga el array de accounts: leyenda incluye todos los handles', () => {
    render(
      <CrossAccountView
        accounts={MOCK_ACCOUNTS}
        drafts={[]}
        currentMonth={CURRENT_MONTH}
      />,
    );

    // Verificar que la leyenda contiene las 3 cuentas, no más ni menos
    const accountHandles = screen.getAllByText(/@cuenta_/);
    expect(accountHandles.length).toBe(MOCK_ACCOUNTS.length);
  });

  it('calendario vacío (sin drafts) renderiza el grid sin dots de contenido', () => {
    render(
      <CrossAccountView
        accounts={MOCK_ACCOUNTS}
        drafts={[]}
        currentMonth={CURRENT_MONTH}
      />,
    );

    // El header del mes debe mostrarse
    expect(screen.getByText(/septiembre 2026/i)).toBeTruthy();

    // Los headers de días de la semana deben estar presentes
    expect(screen.getByText('Dom')).toBeTruthy();
    expect(screen.getByText('Lun')).toBeTruthy();

    // Sin drafts, no debe haber dots de contenido (spans w-1.5 h-1.5)
    const contentDots = document.querySelectorAll('span.w-1\\.5.h-1\\.5.rounded-full');
    expect(contentDots.length).toBe(0);

    // Sin día seleccionado, no hay panel de detalle
    expect(screen.queryByText(/sin publicaciones programadas/i)).toBeNull();
  });

  it('múltiples drafts en el mismo día se muestran agrupados por cuenta al seleccionar el día', () => {
    // Dos drafts el 15 de septiembre de 2026, de dos cuentas distintas
    const drafts = [
      {
        id:                'draft-1',
        scheduled_for:     '2026-09-15T10:00:00Z',
        caption:           'Post de cuenta uno',
        status:            'approved',
        social_account_id: 'acc-1',
      },
      {
        id:                'draft-2',
        scheduled_for:     '2026-09-15T14:00:00Z',
        caption:           'Post de cuenta dos',
        status:            'scheduled',
        social_account_id: 'acc-2',
      },
    ];

    render(
      <CrossAccountView
        accounts={MOCK_ACCOUNTS}
        drafts={drafts}
        currentMonth={CURRENT_MONTH}
      />,
    );

    // Hay dots de contenido en el calendario (los 2 drafts del día 15)
    const contentDots = document.querySelectorAll('span.w-1\\.5.h-1\\.5.rounded-full');
    expect(contentDots.length).toBe(2);

    // Hacer click en el día 15 para ver el detalle agrupado
    const day15Btn = screen.getByRole('button', { name: /2026-09-15 — 2 publicaciones/i });
    fireEvent.click(day15Btn);

    // El panel de detalle debe mostrar ambos handles de cuenta
    // (pueden aparecer también en la leyenda, por eso usamos getAllByText)
    expect(screen.getAllByText('@cuenta_uno').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('@cuenta_dos').length).toBeGreaterThanOrEqual(2);

    // Y las captions de los dos drafts
    expect(screen.getByText(/post de cuenta uno/i)).toBeTruthy();
    expect(screen.getByText(/post de cuenta dos/i)).toBeTruthy();
  });
});
