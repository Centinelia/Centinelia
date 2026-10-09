// @vitest-environment jsdom

/**
 * Tests para CallForwardingSection — selector de modo.
 *
 * Cubre:
 *  - Modo "primer timbre" (immediate) + modo "20 segundos" (noanswer)
 *  - GSM (Telcel, AT&T, Movistar): códigos *21/*61 + cancel ##21/##61
 *  - Telmex fijo: códigos *68/*67 + cancel #68/#67
 *  - Cambio dinámico de códigos al togglear modo y al cambiar operadora
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CallForwardingSection from '../CallForwardingSection';

const PHONE = '+528121887969';
const NUM10 = '8121887969';

function renderDefault() {
  return render(<CallForwardingSection phoneNumber={PHONE} agentName="Nelia" />);
}

describe('CallForwardingSection — GSM (Telcel default)', () => {
  it('modo "primer timbre" muestra *21*número# y cancel ##21#', () => {
    renderDefault();
    expect(screen.getByText(`*21*${NUM10}#`)).toBeTruthy();
    expect(screen.getByText('##21#')).toBeTruthy();
  });

  it('al cambiar a modo "20 segundos" muestra *61*número*11*20# y cancel ##61#', async () => {
    const user = userEvent.setup();
    renderDefault();

    await user.click(screen.getByRole('button', { name: /20 segundos/i }));

    expect(screen.getByText(`*61*${NUM10}*11*20#`)).toBeTruthy();
    expect(screen.getByText('##61#')).toBeTruthy();
  });

  it('al volver a "primer timbre" vuelve a mostrar *21*número#', async () => {
    const user = userEvent.setup();
    renderDefault();

    await user.click(screen.getByRole('button', { name: /20 segundos/i }));
    await user.click(screen.getByRole('button', { name: /primer timbre/i }));

    expect(screen.getByText(`*21*${NUM10}#`)).toBeTruthy();
  });
});

describe('CallForwardingSection — Telmex fijo', () => {
  async function selectTelmex() {
    const user = userEvent.setup();
    renderDefault();
    await user.click(screen.getByRole('button', { name: /telmex/i }));
    return user;
  }

  it('modo "primer timbre" muestra *68 número # y cancel #68#', async () => {
    await selectTelmex();
    expect(screen.getByText(`*68 ${NUM10} #`)).toBeTruthy();
    expect(screen.getByText('#68#')).toBeTruthy();
  });

  it('modo "20 segundos" muestra *67 número # y cancel #67#', async () => {
    const user = await selectTelmex();
    await user.click(screen.getByRole('button', { name: /20 segundos/i }));
    expect(screen.getByText(`*67 ${NUM10} #`)).toBeTruthy();
    expect(screen.getByText('#67#')).toBeTruthy();
  });

  it('ya NO muestra el 800-123-2222 (bug anterior: mandaba a llamar al call center)', async () => {
    await selectTelmex();
    expect(screen.queryByText(/800[-\s]?123[-\s]?2222/)).toBeNull();
  });

  it('muestra fallback al 050 si los códigos no responden', async () => {
    await selectTelmex();
    expect(screen.getByText(/050/)).toBeTruthy();
  });
});

describe('CallForwardingSection — mode selector siempre visible', () => {
  it('renderiza los 2 botones de modo', () => {
    renderDefault();
    expect(screen.getByRole('button', { name: /primer timbre/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /20 segundos/i })).toBeTruthy();
  });

  it('por default el modo seleccionado es "primer timbre"', () => {
    renderDefault();
    const btn = screen.getByRole('button', { name: /primer timbre/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
