// @vitest-environment jsdom

/**
 * Tests para ConfigurarTabs.
 *
 * Cubre el fix de Pasada 2 [#8]: al cambiar de tab, se limpia el hash del
 * anterior para que el scroll effect no salte a un anchor inexistente.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockRouterReplace, mockSearchParams } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
  mockSearchParams:  { toString: () => '', get: (_k: string) => null as string | null },
}));

vi.mock('next/navigation', () => ({
  useRouter:       () => ({ replace: mockRouterReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname:     () => '/portal/token/configurar',
}));

// Mock Tabs — Radix necesita muchos wrappers y no aporta al test.
vi.mock('@/components/portal-ui/overlays/Tabs', () => ({
  default: {
    Root:    ({ children, onValueChange }: {
      children:       React.ReactNode;
      onValueChange:  (v: string) => void;
    }) => (
      <div data-testid="tabs-root">
        {children}
        <button data-testid="switch-to-tools"
                onClick={() => onValueChange('tools')}>switch tools</button>
        <button data-testid="switch-to-conocimiento"
                onClick={() => onValueChange('conocimiento')}>switch conocimiento</button>
      </div>
    ),
    List:    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Trigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <button data-testid={`trigger-${value}`}>{children}</button>
    ),
    Content: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <div data-testid={`content-${value}`}>{children}</div>
    ),
  },
}));

import ConfigurarTabs from '../ConfigurarTabs';

beforeEach(() => {
  vi.clearAllMocks();
  // Set initial URL with hash (simula que el usuario está en #voz del tab personalidad)
  window.history.replaceState(null, '', '/portal/token/configurar?tab=personalidad#voz');
});

describe('ConfigurarTabs — hash drop on tab switch (fix Pasada 2 #8)', () => {
  it('elimina el hash de window.location antes de router.replace', async () => {
    const user = userEvent.setup();
    render(
      <ConfigurarTabs>
        <div>Personalidad content</div>
        <div>Conocimiento content</div>
        <div>Tools content</div>
        <div>Autonomia content</div>
        <div>Bitacora content</div>
      </ConfigurarTabs>,
    );

    // Verifica que empezamos con hash
    expect(window.location.hash).toBe('#voz');

    // Usuario cambia a tab tools
    await user.click(screen.getByTestId('switch-to-tools'));

    // Hash se limpió antes del router.replace
    expect(window.location.hash).toBe('');
    // Y el replace se llamó SIN hash
    expect(mockRouterReplace).toHaveBeenCalledWith(
      expect.stringMatching(/^\/portal\/token\/configurar\?tab=tools$/),
      { scroll: false },
    );
  });

  it('no toca el hash si ya está vacío al cambiar tab', async () => {
    window.history.replaceState(null, '', '/portal/token/configurar?tab=personalidad');
    const user = userEvent.setup();
    render(
      <ConfigurarTabs>
        <div>P</div><div>C</div><div>T</div><div>A</div><div>B</div>
      </ConfigurarTabs>,
    );

    await user.click(screen.getByTestId('switch-to-conocimiento'));

    expect(window.location.hash).toBe('');
    expect(mockRouterReplace).toHaveBeenCalledWith(
      expect.stringMatching(/tab=conocimiento/),
      { scroll: false },
    );
  });
});
