/**
 * Guard estático: verifica que el chequeo de blocklist esté wired en el
 * handler de inbound, antes de account_status y business hours, y con las
 * guardas correctas (phoneNumber truthy + portal_email truthy).
 *
 * Motivación: pedido Ramón (Tortillería Estrella) 2026-10-03 — bot marcador
 * +524812092229 generó 20 llamadas en pocas horas. El hook devuelve 403
 * para que Vapi cuelgue en <1s sin consumir pool. Si alguien borra el bloque
 * por accidente, el bot vuelve a entrar.
 *
 * Static (no invoca handler ni toca DB). Patrón de
 * no-report-notify-wiring.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readInboundSource(): string {
  return readFileSync(
    path.resolve(__dirname, '..', 'route.ts'),
    'utf8',
  );
}

function extractBlocklistBlock(source: string): string {
  const startMarker = 'Blocklist check';
  const endMarker   = 'Agente pausado';
  const s = source.indexOf(startMarker);
  const e = source.indexOf(endMarker, s);
  if (s < 0 || e < 0) {
    throw new Error(`blocklist block markers no encontrados: start=${s}, end=${e}`);
  }
  return source.slice(s, e);
}

describe('inbound wiring: blocklist check', () => {
  const source = readInboundSource();
  const block  = extractBlocklistBlock(source);

  it('el bloque de blocklist existe en el handler (guard contra deletion)', () => {
    expect(block.length).toBeGreaterThan(200);
  });

  it('la guarda requiere phoneNumber Y portal_email (evita falsos positivos)', () => {
    expect(block).toMatch(/if\s*\(\s*phoneNumber\s*&&\s*typedAgent\.portal_email\s*\)/);
  });

  it('normaliza el caller a E.164 antes de buscar (bot puede llegar sin "+")', () => {
    expect(block).toContain('normalizeToE164(phoneNumber)');
  });

  it('consulta blocked_numbers por (portal_email, phone_e164) — scoping org-level', () => {
    expect(block).toContain("from('blocked_numbers')");
    expect(block).toContain("eq('portal_email', typedAgent.portal_email)");
    expect(block).toContain("eq('phone_e164', normalizedCaller)");
  });

  it('devuelve 403 (mismo patrón que suspended) para que Vapi cuelgue sin cobrar pool', () => {
    expect(block).toMatch(/status:\s*403/);
    expect(block).toContain('blocked');
  });

  it('el bloque corre ANTES de account_status check (ahorra 2 queries si está bloqueado)', () => {
    const idxBlocklist  = source.indexOf('Blocklist check');
    const idxAccountStatus = source.indexOf('Check account status');
    expect(idxBlocklist).toBeGreaterThan(0);
    expect(idxAccountStatus).toBeGreaterThan(idxBlocklist);
  });

  it('el bloque corre DESPUÉS de resolver typedAgent (necesita portal_email)', () => {
    const idxTypedAgent = source.indexOf('const typedAgent = agent as VoiceAgent');
    const idxBlocklist  = source.indexOf('Blocklist check');
    expect(idxTypedAgent).toBeGreaterThan(0);
    expect(idxBlocklist).toBeGreaterThan(idxTypedAgent);
  });
});
