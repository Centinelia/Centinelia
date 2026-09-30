/**
 * Guard estático: verifica que el hook de aviso llamada-sin-reporte esté
 * wired correctamente en el webhook end-of-call-report.
 *
 * Pedido Ramón (Tortillería Estrella) 2026-09-30: cada llamada sin reporte
 * genera 1 correo. La detección + envío vive en notifyIfNoReport, pero la
 * invocación desde el webhook es plumbing (fetch agent + org, mapear campos,
 * pasar callRow). Este test protege contra:
 *   (1) alguien borra el bloque del webhook por accidente
 *   (2) alguien renombra un campo del callRow (id, caller_number, etc.)
 *   (3) alguien mueve el hook a un lugar donde callDbId no exista
 *   (4) alguien cambia la guarda `callDbId && callerNumber`
 *
 * Static (no invoca handler ni toca DB). Sigue el patrón de
 * outcome-schema-drift.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readWebhookSource(): string {
  return readFileSync(
    path.resolve(__dirname, '..', 'route.ts'),
    'utf8',
  );
}

function extractHookBlock(source: string): string {
  // El bloque empieza con el comment identificatorio y termina en el
  // `void (async () => {...})();` — capturamos el rango completo desde
  // el comentario hasta la línea "shouldChargeMinutes".
  const startMarker = 'Aviso llamada sin reporte';
  const endMarker = 'const shouldChargeMinutes';
  const s = source.indexOf(startMarker);
  const e = source.indexOf(endMarker, s);
  if (s < 0 || e < 0) {
    throw new Error(`hook block markers no encontrados: start=${s}, end=${e}`);
  }
  return source.slice(s, e);
}

describe('webhook wiring: notifyIfNoReport hook', () => {
  const source = readWebhookSource();
  const hook = extractHookBlock(source);

  it('el bloque del hook existe en el webhook (guard contra deletion accidental)', () => {
    expect(hook.length).toBeGreaterThan(200);
  });

  it('la guarda requiere callDbId Y callerNumber (evita disparar sin identidad)', () => {
    expect(hook).toMatch(/if\s*\(\s*callDbId\s*&&\s*callerNumber\s*\)/);
  });

  it('fetchea organizations con notify_calls_without_report y directory', () => {
    expect(hook).toContain("from('organizations')");
    expect(hook).toMatch(/select\([^)]*notify_calls_without_report[^)]*directory/);
  });

  it('fetchea voice_agents con los campos que NoReportAgent requiere', () => {
    // Campos exactos que la interfaz NoReportAgent necesita — si alguien
    // renombra uno en no-report-notify.ts sin actualizar el SELECT aquí,
    // el correo saldría con datos incompletos (business_name = undefined,
    // email_domain_verified = undefined → template con "undefined" visible).
    expect(hook).toContain("from('voice_agents')");
    const requiredFields = [
      'id', 'portal_email', 'agent_name', 'business_name',
      'email_from', 'email_domain_verified',
    ];
    for (const f of requiredFields) {
      expect(hook, `SELECT voice_agents debe incluir ${f}`).toContain(f);
    }
  });

  it('importa notifyIfNoReport desde @/lib/incidents/no-report-notify (dynamic)', () => {
    expect(hook).toContain(
      "await import('@/lib/incidents/no-report-notify')",
    );
    expect(hook).toContain('notifyIfNoReport(');
  });

  it('pasa callRow con los 5 campos: id, caller_number, duration_seconds, outcome, summary', () => {
    // NoReportCallRow requiere exactamente estos 5. Cualquier omisión hace
    // que el template renderice datos vacíos o que el skip 'no_caller'
    // dispare erróneamente.
    expect(hook).toMatch(/callRow:\s*\{[^}]*id:\s*callDbId/s);
    expect(hook).toMatch(/callRow:\s*\{[^}]*caller_number:\s*callerNumber/s);
    expect(hook).toMatch(/callRow:\s*\{[^}]*duration_seconds:\s*durationSeconds/s);
    expect(hook).toMatch(/callRow:\s*\{[^}]*outcome[,\s]/s);
    expect(hook).toMatch(/callRow:\s*\{[^}]*summary[,\s]/s);
  });

  it('propaga notify_calls_without_report boolean coerced', () => {
    // El SELECT devuelve unknown en `org.notify_calls_without_report`. Sin
    // el `!!` coercion la interfaz recibe undefined y ejecuta la lógica
    // notify_calls_without_report=undefined (falsy → flag_off). No es bug,
    // pero mantener la coercion documenta la intención.
    expect(hook).toMatch(/notify_calls_without_report:\s*!!/);
  });

  it('normaliza directory a array (defiende contra org.directory=null)', () => {
    // Sin el Array.isArray guard, si directory=null llega a
    // resolveIncidentRecipients y crashea. La normalización previene.
    expect(hook).toContain('Array.isArray(org.directory)');
  });

  it('fire-and-forget: envuelto en after() de next/server (no bloquea la respuesta a Vapi)', () => {
    // Bug 2026-09-30: originalmente usaba `void (async () => {})()` heredado
    // de perfiles_vivos. Vercel corta la ventana de gracia post-response y
    // mataba `consumeAiOp` antes de completar → 2 correos ok pero 0 rows en
    // ai_ops_log (undercharge silencioso, viola pool accuracy). `after()` es
    // la primitiva canonical de Next.js 15 que extiende la ejecución para
    // post-response work.
    expect(hook).toMatch(/after\(async\s*\(\)\s*=>/);
    expect(hook).not.toMatch(/void\s*\(async\s*\(\)/);
  });

  it('captura errores del hook sin propagar (no rompe el webhook si notifyIfNoReport falla)', () => {
    // Try/catch obligatorio: cualquier throw en notifyIfNoReport (network,
    // Supabase down, template error) NO debe cortar el webhook, que aún
    // tiene que cobrar minutos + self-eval + Notion + demás.
    expect(hook).toMatch(/catch\s*\(err\)/);
    expect(hook).toContain('no-report-notify');
  });

  it('está ubicado ANTES de shouldChargeMinutes (aplica también a unanswered)', () => {
    // Colocación importante: unanswered (colgó ≤5s) NO cobra minutos. Si
    // el hook estuviera dentro del bloque de charge-minutes, nunca dispararía
    // para colgadas — que es el caso principal que Ramón pidió.
    const idxHook = source.indexOf('Aviso llamada sin reporte');
    const idxCharge = source.indexOf('const shouldChargeMinutes');
    expect(idxHook).toBeGreaterThan(0);
    expect(idxCharge).toBeGreaterThan(idxHook);
  });
});
