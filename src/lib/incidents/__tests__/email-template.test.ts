import { describe, it, expect } from 'vitest';
import { renderIncidentCardEmail } from '../email-template';

describe('renderIncidentCardEmail', () => {
  const base = {
    businessName: 'ABARROTES CHARRO',
    contactName: 'HECTOR CORONEL',
    contactPhone: '+528126752468',
    address: 'MAYA 766 X CON ATOMI, FRACC. LOS MORALES 2DO SECTOR, SAN NICOLAS',
    motivo: 'Iba el vendedor 3 veces a la semana y ahora solo 1, se queda sin producto.',
    capturedAt: new Date('2026-08-27T10:07:00-06:00'),
    agentDisplayName: 'Nia · Tortillería Estrella',
  };

  it('subject includes business + fecha', () => {
    const { subject } = renderIncidentCardEmail(base);
    expect(subject).toContain('ABARROTES CHARRO');
    expect(subject).toMatch(/27.*ago.*26|2026-08-27/);
  });

  it('html contains all 6 fields', () => {
    const { html } = renderIncidentCardEmail(base);
    expect(html).toContain('FECHA');
    expect(html).toContain('HORA');
    expect(html).toContain('NOMBRE DEL NEGOCIO');
    expect(html).toContain('DIRECCIÓN');
    expect(html).toContain('MOTIVO');
    expect(html).toContain('CONTACTO');
    expect(html).toContain('ABARROTES CHARRO');
    expect(html).toContain('HECTOR CORONEL');
    expect(html).toContain('8126752468');
    expect(html).toContain('MAYA 766');
  });

  it('html has yellow header cells (matches screenshots)', () => {
    const { html } = renderIncidentCardEmail(base);
    expect(html).toMatch(/background(-color)?:\s*#f9e04c|#ffe066|#fff566/i);
  });

  it('handles null contactName', () => {
    const { html } = renderIncidentCardEmail({ ...base, contactName: null });
    expect(html).toContain('+528126752468');
    expect(html).not.toContain('null');
  });
});
