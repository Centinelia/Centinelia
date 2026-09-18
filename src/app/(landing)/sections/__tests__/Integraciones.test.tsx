// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Integraciones from '../Integraciones';

describe('Integraciones', () => {
  it('incluye Gmail, Sheets, QuickBooks Online, Facturama', () => {
    render(<Integraciones />);
    expect(screen.getByText(/gmail/i)).toBeInTheDocument();
    expect(screen.getByText(/sheets/i)).toBeInTheDocument();
    expect(screen.getByText(/quickbooks/i)).toBeInTheDocument();
    expect(screen.getByText(/facturama/i)).toBeInTheDocument();
  });

  it('NO incluye WhatsApp, Vapi, Supabase, Anthropic, Twilio', () => {
    const { container } = render(<Integraciones />);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('whatsapp');
    expect(text).not.toContain('vapi');
    expect(text).not.toContain('supabase');
    expect(text).not.toContain('anthropic');
    expect(text).not.toContain('twilio');
  });
});
