// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CTAFinal from '../CTAFinal';

describe('CTAFinal', () => {
  it('dispara onCallbackClick al hacer click en primario', () => {
    const cb = vi.fn();
    render(<CTAFinal onCallbackClick={cb} />);
    fireEvent.click(screen.getByRole('button', { name: /deja que nia te llame/i }));
    expect(cb).toHaveBeenCalled();
  });

  it('el CTA secundario apunta a /cotizar o /agendar', () => {
    render(<CTAFinal onCallbackClick={() => {}} />);
    const link = screen.getByRole('link', { name: /llamada humana/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/cotizar|agendar/));
  });
});
