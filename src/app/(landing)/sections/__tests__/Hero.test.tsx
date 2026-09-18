// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Hero from '../Hero';

describe('Hero', () => {
  it('renderiza el headline sin em-dash ni emoji', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    const headline = screen.getByRole('heading', { level: 1 });
    expect(headline.textContent).toContain('Contesta el teléfono');
    expect(headline.textContent).not.toMatch(/[—–]/);
    expect(headline.textContent).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it('CTA primario dice "Deja que Nia te llame"', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    expect(screen.getByRole('button', { name: /deja que nia te llame/i })).toBeInTheDocument();
  });

  it('CTA secundario dice "Conoce al equipo"', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    expect(screen.getByRole('button', { name: /conoce al equipo/i })).toBeInTheDocument();
  });

  it('subheadline menciona "sin contratar" y "próximo lunes"', () => {
    render(<Hero onCallbackClick={() => {}} onElencoClick={() => {}} />);
    expect(screen.getByText(/sin contratar/i)).toBeInTheDocument();
    expect(screen.getByText(/próximo lunes/i)).toBeInTheDocument();
  });
});
