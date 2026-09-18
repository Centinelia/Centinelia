// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComoFunciona from '../ComoFunciona';

describe('ComoFunciona', () => {
  it('muestra los 3 pasos', () => {
    render(<ComoFunciona />);
    expect(screen.getByText(/eliges qué empleado/i)).toBeInTheDocument();
    expect(screen.getByText(/llamada de 30 minutos lo capacitamos/i)).toBeInTheDocument();
    expect(screen.getByText(/próximo lunes/i)).toBeInTheDocument();
  });

  it('menciona "sin instalar" y "sin cambiar sistemas"', () => {
    render(<ComoFunciona />);
    expect(screen.getByText(/sin instalar/i)).toBeInTheDocument();
    expect(screen.getByText(/sin cambiar tus sistemas/i)).toBeInTheDocument();
  });
});
