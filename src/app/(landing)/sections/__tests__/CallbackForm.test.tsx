// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CallbackForm from '../CallbackForm';

// Mock fetch global para handleOtpVerify
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CallbackForm — stage: form', () => {
  it('boton submit esta oculto sin consent (hide over disable)', () => {
    render(<CallbackForm onSubmit={async () => ({ ok: true })} />);
    expect(screen.queryByRole('button', { name: /quiero que me llame/i })).not.toBeInTheDocument();
  });

  it('boton aparece cuando marcas consent', () => {
    render(<CallbackForm onSubmit={async () => ({ ok: true })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /quiero que me llame/i })).toBeInTheDocument();
  });

  it('valida que el telefono sea MX (10 digitos)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu tel[eé]fono/i), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText(/tu tipo de negocio/i), { target: { value: 'tortilleria_abarrotes' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(/tel[eé]fono no v[aá]lido/i)).toBeInTheDocument();
    });
  });

  it('submite con datos validos y avanza a stage otp cuando ok + requestId', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, requestId: 'test-req-id' });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu tel[eé]fono/i), { target: { value: '8112345678' } });
    fireEvent.change(screen.getByLabelText(/tu tipo de negocio/i), { target: { value: 'tortilleria_abarrotes' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ phone: '8112345678', industry: 'tortilleria_abarrotes', consent: true });
      expect(screen.getByText(/c[oó]digo de verificaci[oó]n/i)).toBeInTheDocument();
    });
  });

  it('muestra error cuando onSubmit retorna ok: false', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, message: 'Error de prueba' });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu tel[eé]fono/i), { target: { value: '8112345678' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(screen.getByText(/error de prueba/i)).toBeInTheDocument();
    });
  });
});

describe('CallbackForm — stage: otp', () => {
  async function renderOtpStage() {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, requestId: 'req-123' });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu tel[eé]fono/i), { target: { value: '8112345678' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => {
      expect(screen.getByText(/c[oó]digo de verificaci[oó]n/i)).toBeInTheDocument();
    });
  }

  it('muestra input de codigo y boton verificar', async () => {
    await renderOtpStage();
    expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verificar c[oó]digo/i })).toBeInTheDocument();
  });

  it('boton verificar deshabilitado si codigo tiene menos de 6 digitos', async () => {
    await renderOtpStage();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /verificar c[oó]digo/i })).toBeDisabled();
  });

  it('avanza a stage dialing cuando verify responde dialing', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, callStatus: 'dialing' }),
    });
    await renderOtpStage();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar c[oó]digo/i }));
    await waitFor(() => {
      expect(screen.getByText(/nia te est[aá] llamando/i)).toBeInTheDocument();
    });
  });

  it('avanza a stage fallback cuando verify responde fallback_manual', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, callStatus: 'fallback_manual', reason: 'out_of_hours' }),
    });
    await renderOtpStage();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar c[oó]digo/i }));
    await waitFor(() => {
      expect(screen.getByText(/se nos complic[oó]/i)).toBeInTheDocument();
    });
  });

  it('muestra error cuando OTP es incorrecto', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: false, error: 'wrong_code' }),
    });
    await renderOtpStage();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar c[oó]digo/i }));
    await waitFor(() => {
      expect(screen.getByText('wrong_code')).toBeInTheDocument();
    });
  });
});

describe('CallbackForm — stage: dialing', () => {
  it('muestra mensaje de que Nia esta llamando', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, callStatus: 'dialing' }),
    });
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, requestId: 'req-abc' });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu tel[eé]fono/i), { target: { value: '8112345678' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => screen.getByText(/c[oó]digo de verificaci[oó]n/i));
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar c[oó]digo/i }));
    await waitFor(() => {
      expect(screen.getByText(/nia te est[aá] llamando/i)).toBeInTheDocument();
    });
  });
});

describe('CallbackForm — stage: fallback', () => {
  it('muestra mensaje de callback manual', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, callStatus: 'fallback_manual' }),
    });
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, requestId: 'req-abc' });
    render(<CallbackForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/tu tel[eé]fono/i), { target: { value: '8112345678' } });
    fireEvent.click(screen.getByRole('button', { name: /quiero que me llame/i }));
    await waitFor(() => screen.getByText(/c[oó]digo de verificaci[oó]n/i));
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar c[oó]digo/i }));
    await waitFor(() => {
      expect(screen.getByText(/se nos complic[oó]/i)).toBeInTheDocument();
    });
  });
});
