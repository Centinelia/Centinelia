// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CallbackForm from '../CallbackForm';

describe('CallbackForm', () => {
  it('botón submit está oculto sin consent (hide over disable)', () => {
    render(<CallbackForm onSubmit={async () => ({ ok: true })} />);
    expect(screen.queryByRole('button', { name: /quiero que me llame/i })).not.toBeInTheDocument();
  });

  it('botón aparece cuando marcas consent', () => {
    render(<CallbackForm onSubmit={async () => ({ ok: true })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /quiero que me llame/i })).toBeInTheDocument();
  });

  it('valida que el teléfono sea MX (10 dígitos)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu teléfono/i), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText(/tu tipo de negocio/i), { target: { value: 'tortilleria_abarrotes' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(/teléfono no válido/i)).toBeInTheDocument();
    });
  });

  it('submite con datos válidos', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu teléfono/i), { target: { value: '8112345678' } });
    fireEvent.change(screen.getByLabelText(/tu tipo de negocio/i), { target: { value: 'tortilleria_abarrotes' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ phone: '8112345678', industry: 'tortilleria_abarrotes', consent: true });
    });
  });
});
