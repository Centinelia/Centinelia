import { describe, it, expect } from 'vitest';
import { validateDraft } from '../draft-validator';

describe('validateDraft — hallucinations reales demo AC 2026-10-07', () => {
  const base = {
    agentName: 'Nami',
    teamHumanNames: ['Camila Rodarte', 'Victoria Acosta', 'Angeles Ugarte', 'Mayra Baeza'],
    toolsActuallyInvoked: [] as string[],
  };

  it('CAZA: "El Google Sheet de OC no está configurado"', () => {
    const r = validateDraft({
      ...base,
      summary: 'Victoria pide registrar la OC 6203. El Google Sheet de OC no está configurado.',
      draft:   'Hola Victoria, no puedo registrar porque el Google Sheet no está configurado.',
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some(v => v.kind === 'nonexistent_integration')).toBe(true);
    expect(r.violations.some(v => /Google.?Sheet/i.test(v.excerpt))).toBe(true);
  });

  it('CAZA: "Intenté avisar a un humano con pedir_a_humano y las tres solicitudes fallaron"', () => {
    const r = validateDraft({
      ...base,
      summary: 'Victoria pide registrar. Intenté avisar a un humano con pedir_a_humano y las tres solicitudes fallaron, por lo que el equipo no está enterado.',
      draft:   'Hola Victoria, aún no he logrado avisar al equipo.',
      toolsActuallyInvoked: ['buscar_correo_enviado'],  // pedir_a_humano NO está
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some(v => v.kind === 'tool_claim_without_invocation')).toBe(true);
    expect(r.violations.some(v => /pedir_a_humano/i.test(v.reason))).toBe(true);
  });

  it('CAZA: "no tengo conectado el archivo inventarios nami"', () => {
    const r = validateDraft({
      ...base,
      summary: 'Nami no tiene acceso al Excel.',
      draft:   'Hola Victoria, no tengo conectado el archivo inventarios nami 2026. Por favor conecta el Excel en Integraciones del portal.',
    });
    expect(r.ok).toBe(false);
    // Debe caer en 2 patrones: "no tengo conectado" + "conecta el Excel" + "Integraciones del portal"
    expect(r.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('CAZA: firma como Camila Rodarte (suplantación)', () => {
    const r = validateDraft({
      ...base,
      summary: 'Angeles confirma el proyecto W Chihuahua.',
      draft: `Hola Angeles,

Gracias por la referencia. Anoto que los dos equipos son para el Proyecto W Chihuahua.

Saludos,
Camila Rodarte
Coordinadora de Almacén
Aire Acondicionado Proyectos, S.A. de C.V.`,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some(v => v.kind === 'impersonation')).toBe(true);
    expect(r.violations.some(v => /Camila/i.test(v.reason))).toBe(true);
  });

  it('PASA: firma correcta como Nami', () => {
    const r = validateDraft({
      ...base,
      summary: 'Angeles confirma el proyecto W Chihuahua.',
      draft: `Hola Angeles,

Anoto que los dos equipos (TWE12043AAAP01H, TWA12043AAAE02P) son para el Proyecto W Chihuahua. ¿Necesitas algo más?

Saludos,
Nami — Asistente de inventario, AC Proyectos`,
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('PASA: draft que menciona pedir_a_humano cuando SÍ la invocó', () => {
    const r = validateDraft({
      ...base,
      summary: 'Pedí info al equipo.',
      draft:   'Hola Victoria, invoqué pedir_a_humano para que el equipo revise.',
      toolsActuallyInvoked: ['pedir_a_humano'],
    });
    expect(r.ok).toBe(true);
  });

  it('PASA: draft sin frases prohibidas', () => {
    const r = validateDraft({
      ...base,
      summary: 'OC 6203 procesada: 5 piezas registradas.',
      draft: 'Hola Victoria, ya registré las 5 piezas de la OC 6203 en el inventario. Saludos, Nami.',
      toolsActuallyInvoked: ['inv_procesar_oc_qb'],
    });
    expect(r.ok).toBe(true);
  });

  it('retryPrompt incluye todas las violations con fix explícito', () => {
    const r = validateDraft({
      ...base,
      summary: 'Google Sheet no configurado.',
      draft: 'Intenté usar pedir_a_humano pero falló. Saludos, Camila Rodarte, Coordinadora.',
      toolsActuallyInvoked: [],
    });
    expect(r.ok).toBe(false);
    expect(r.retryPrompt).toBeTruthy();
    expect(r.retryPrompt).toContain('Google');
    expect(r.retryPrompt).toContain('pedir_a_humano');
    expect(r.retryPrompt).toContain('Camila');
    expect(r.retryPrompt).toContain('Nami');  // identidad correcta
  });

  it('NO flagea tool mencionada en texto si NO parece claim ("usar X" sin "intenté/ejecuté/usé")', () => {
    const r = validateDraft({
      ...base,
      summary: 'OC procesada.',
      draft:   'Para registrar en el futuro, puedo usar inv_procesar_oc_qb cuando llegue el PDF.',
      toolsActuallyInvoked: [],
    });
    // "puedo usar" es futuro condicional, no claim de que la invocó. Debe pasar.
    expect(r.ok).toBe(true);
  });

  it('CAZA incluso si el summary está limpio pero el draft tiene violation', () => {
    const r = validateDraft({
      ...base,
      summary: 'Correo de Victoria sobre OC.',
      draft:   'Hola Victoria, el Google Sheet no está mapeado para OC. Saludos, Nami.',
    });
    expect(r.ok).toBe(false);
  });

  it('CAZA incluso si el draft está limpio pero el summary tiene violation', () => {
    const r = validateDraft({
      ...base,
      summary: 'Intenté usar inv_procesar_oc_qb pero el Excel no está conectado.',
      draft:   null,
    });
    expect(r.ok).toBe(false);
    // Debe caer por "inv_procesar_oc_qb no invocada" + "no está conectado"
  });
});
