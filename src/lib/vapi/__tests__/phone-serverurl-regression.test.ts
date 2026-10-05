/**
 * Guard estático: el serverUrl que seteamos en phone-number de Vapi debe
 * apuntar a /api/voice/inbound, no a /api/voice/webhook.
 *
 * Bug 2026-10-05 (Tortillería): `assignAssistantToPhone` (sync.ts) puso
 * `serverUrl = /api/voice/webhook` cuando debía ser `/api/voice/inbound`.
 * Resultado: inbound/route.ts nunca se ejecutaba en llamadas entrantes.
 * El hook de blocked_numbers del PR #100 estaba muerto. Nelia Tortillería
 * siguió recibiendo al bot +524691269029 aunque estuviera en blocklist.
 *
 * Repercusión más amplia: toda la lógica de inbound (business hours,
 * suspended account, pool exhausted, blocklist) estaba desactivada para
 * los agentes que pasaron por este path.
 *
 * Diferenciar:
 *  - `assistant.serverUrl` → /api/voice/webhook (end-of-call-report) ← ok
 *  - `phone-number.serverUrl` → /api/voice/inbound (assistant-request) ← ok
 * Si cualquiera cambia, el otro suele romperse si no se mira con cuidado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readSyncSource(): string {
  return readFileSync(path.resolve(__dirname, '..', 'sync.ts'), 'utf8');
}
function readProvisionSource(): string {
  return readFileSync(path.resolve(__dirname, '..', 'provision.ts'), 'utf8');
}

function extractAssignAssistantToPhone(source: string): string {
  const startMarker = 'export async function assignAssistantToPhone';
  const s = source.indexOf(startMarker);
  if (s < 0) throw new Error('assignAssistantToPhone no encontrada en sync.ts');
  // leer hasta el próximo export o el fin del archivo
  const nextExport = source.indexOf('\nexport ', s + 1);
  const e = nextExport > 0 ? nextExport : source.length;
  return source.slice(s, e);
}

function extractAssignAssistantFromProvision(source: string): string {
  const startMarker = 'async function assignAssistant';
  const s = source.indexOf(startMarker);
  if (s < 0) throw new Error('assignAssistant no encontrada en provision.ts');
  const nextFn = source.indexOf('\nasync function', s + 1);
  const nextExport = source.indexOf('\nexport ', s + 1);
  const e = Math.min(
    nextFn > 0 ? nextFn : source.length,
    nextExport > 0 ? nextExport : source.length,
  );
  return source.slice(s, e);
}

describe('vapi phone-number.serverUrl regression', () => {
  const sync = readSyncSource();
  const prov = readProvisionSource();

  it('sync.ts assignAssistantToPhone: serverUrl del PHONE apunta a /api/voice/inbound', () => {
    const block = extractAssignAssistantToPhone(sync);
    expect(block).toContain('/api/voice/inbound');
    // El patch debe tener serverUrl: con la URL inbound (no webhook)
    expect(block).toMatch(/serverUrl:\s*inboundUrl/);
  });

  it('sync.ts assignAssistantToPhone: NO debe usar /api/voice/webhook como phone serverUrl', () => {
    const block = extractAssignAssistantToPhone(sync);
    // Permitimos /api/voice/webhook en comentarios (explicación del bug), pero
    // no en código activo. Chequeamos que no haya "serverUrl: webhookUrl" o
    // asignación similar al PATCH.
    expect(block).not.toMatch(/serverUrl:\s*webhookUrl/);
    expect(block).not.toMatch(/serverUrl:\s*`[^`]*\/api\/voice\/webhook/);
  });

  it('provision.ts assignAssistant: serverUrl del PHONE apunta a /api/voice/inbound', () => {
    const block = extractAssignAssistantFromProvision(prov);
    expect(block).toContain('/api/voice/inbound');
    expect(block).not.toMatch(/serverUrl:\s*`[^`]*\/api\/voice\/webhook/);
  });

  it('sync.ts assistant.serverUrl (dentro del assistant config) SÍ debe ser /api/voice/webhook (end-of-call-report)', () => {
    // Verificamos que el otro serverUrl (del assistant, no del phone) siga
    // apuntando a webhook — ese sí es el correcto para end-of-call-report.
    expect(sync).toMatch(/serverUrl:\s*`\$\{process\.env\.NEXT_PUBLIC_APP_URL\}\/api\/voice\/webhook/);
  });
});
