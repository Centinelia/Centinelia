// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Comparativa from '../Comparativa';

describe('Comparativa', () => {
  it('menciona IMSS, aguinaldo, vacaciones, PTU', () => {
    render(<Comparativa />);
    expect(screen.getByText(/IMSS/i)).toBeInTheDocument();
    expect(screen.getByText(/aguinaldo/i)).toBeInTheDocument();
    expect(screen.getByText(/vacaciones/i)).toBeInTheDocument();
    expect(screen.getByText(/utilidades|PTU/i)).toBeInTheDocument();
  });

  it('no compara contra chatbot (comparación laboral solamente)', () => {
    render(<Comparativa />);
    expect(screen.queryByText(/chatbot/i)).not.toBeInTheDocument();
  });

  it('no menciona "IA" ni "GPT" ni "automatización"', () => {
    const { container } = render(<Comparativa />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bIA\b/);
    expect(text).not.toMatch(/GPT/i);
    expect(text).not.toMatch(/automatizaci[oó]n/i);
  });
});
