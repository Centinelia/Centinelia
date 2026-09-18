// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FAQ from '../FAQ';

describe('FAQ', () => {
  const OBLIGATORIAS = [
    /esto es un chatbot/i,
    /se equivoca/i,
    /aprender mi negocio/i,
    /español/i,
    /whatsapp/i,
    /rol que no está en el catálogo/i,
    /probar antes de pagar/i,
    /crece mi negocio/i,
    /dónde guardan mis datos/i,
  ];

  it.each(OBLIGATORIAS)('incluye pregunta que matchea %s', (re) => {
    render(<FAQ />);
    expect(screen.getByText(re)).toBeInTheDocument();
  });

  it('la respuesta de WhatsApp dice "hoy no"', () => {
    render(<FAQ />);
    expect(screen.getByText(/hoy no/i)).toBeInTheDocument();
  });
});
