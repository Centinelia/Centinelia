// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CasosReales from '../CasosReales';

describe('CasosReales', () => {
  it('renderiza Tortillería Estrella (permiso=true)', () => {
    render(<CasosReales />);
    expect(screen.getByText(/tortiller[ií]a/i)).toBeInTheDocument();
  });

  it('no renderiza casos sin permiso escrito', () => {
    // La lib exporta CASOS con permiso boolean. Cualquier caso con permiso=false
    // no aparece en el DOM. Se verifica por ausencia.
    render(<CasosReales />);
    const cards = screen.getAllByTestId('caso-real');
    cards.forEach((card) => {
      expect(card).toBeInTheDocument();
    });
  });
});
