// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Elenco from '../Elenco';
import { PUBLIC_MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

describe('Elenco', () => {
  it('renderiza 8 meerkats por default y expone "Ver todo el equipo"', () => {
    render(<Elenco />);
    const cards = screen.getAllByTestId('meerkat-card');
    expect(cards.length).toBe(8);
    expect(screen.getByRole('button', { name: /ver todo el equipo/i })).toBeInTheDocument();
  });

  it('al hacer click en "Ver todo el equipo" muestra los 13', () => {
    render(<Elenco />);
    fireEvent.click(screen.getByRole('button', { name: /ver todo el equipo/i }));
    const cards = screen.getAllByTestId('meerkat-card');
    expect(cards.length).toBe(PUBLIC_MEERKAT_ROLES.length);
    expect(cards.length).toBe(13);
  });

  it('no incluye Neka ni Nash (internos)', () => {
    render(<Elenco />);
    fireEvent.click(screen.getByRole('button', { name: /ver todo el equipo/i }));
    expect(screen.queryByText(/^Neka$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Nash$/i)).not.toBeInTheDocument();
  });

  it('no incluye Navi (behind feature flag)', () => {
    render(<Elenco />);
    fireEvent.click(screen.getByRole('button', { name: /ver todo el equipo/i }));
    expect(screen.queryByText(/^Navi/i)).not.toBeInTheDocument();
  });
});
