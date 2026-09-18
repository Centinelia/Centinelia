// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import PricingSection from '../PricingSection';

// jsdom no incluye IntersectionObserver; AnimatedSection lo necesita para useInView.
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.IntersectionObserver) {
    window.IntersectionObserver = class IntersectionObserver {
      root = null;
      rootMargin = '';
      thresholds = [];
      observe()    {}
      unobserve()  {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
    };
  }
});

describe('PricingSection', () => {
  it('muestra el setup fee $14,990 sin énfasis', () => {
    render(<PricingSection />);
    // El precio $14,990 aparece en el bloque Paso 1 y en la nota de pie;
    // verificamos que al menos un elemento lo contiene.
    const priceMatches = screen.getAllByText(/\$14,990/);
    expect(priceMatches.length).toBeGreaterThanOrEqual(1);
    // La nota de pie menciona "incorporación de $14,990 + IVA"
    const noteMatch = screen.getAllByText(/incorporación/i);
    expect(noteMatch.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra franja "empleado a la medida" con $60,000 + IVA', () => {
    render(<PricingSection />);
    expect(screen.getByText(/rol.*catálogo/i)).toBeInTheDocument();
    expect(screen.getByText(/\$60,000/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /agenda tu diagnóstico/i })).toHaveAttribute('href', expect.stringContaining('cotizar'));
  });

  it('menciona minutos extra $12/min', () => {
    render(<PricingSection />);
    expect(screen.getByText(/\$12.*minuto/i)).toBeInTheDocument();
  });
});
