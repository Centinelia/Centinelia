#!/usr/bin/env tsx
/**
 * Eval opt-in para extractBrandVoice — corre el prompt real contra 3 fixtures
 * sintéticos de tonos distintos (formal-corporativo, casual-regio, técnico) y
 * imprime la guía extraída para revisión manual.
 *
 * Uso:
 *   npx tsx scripts/eval-brand-voice.ts           # los 3 fixtures
 *   npx tsx scripts/eval-brand-voice.ts formal    # solo uno por nombre
 *
 * Guarda cada llamada en llm_call_log (source=eval_brand_voice) para
 * cerrar el gap de cost tracking. Requiere ANTHROPIC_API_KEY y
 * SUPABASE_SERVICE_ROLE_KEY en el entorno (o en .env.local).
 *
 * Criterios de éxito por fixture (revisión manual):
 *   - La guía debe MENCIONAR el ritmo de oraciones observado.
 *   - Debe listar >= 4 palabras/expresiones frecuentes DEL fixture (no genéricas).
 *   - Debe listar palabras vetadas coherentes con el opuesto del fixture.
 *   - Trato (tú/usted) debe reflejar el que usó el fixture.
 *   - Sin markdown (# o **) — texto plano pegable al system prompt.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logLlmCall } from '@/lib/observability/llm-log';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carga .env.local si existe (Next.js style)
function loadDotEnv() {
  const p = resolve(__dirname, '..', '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY no está definido. Agrégalo a .env.local o al entorno.');
  process.exit(1);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURES = {
  formal: {
    name: 'Formal corporativo (bufete legal / consultoría)',
    samples: [
      `Estimado Lic. Ramírez,\n\nEn atención a su solicitud del pasado 12 de septiembre, adjunto encontrará el análisis preliminar sobre la controversia mercantil planteada. Como se desprende del expediente, la posición de su representada es sólida en cuanto a las cláusulas segunda y tercera del contrato original.\n\nQuedamos a sus órdenes para agendar una reunión y revisar los siguientes pasos con detenimiento.\n\nCordialmente,\nDespacho Herrera & Asociados`,
      `Distinguido cliente,\n\nAcusamos recibo de la documentación remitida el día de ayer. Nuestro equipo se encuentra en proceso de análisis y le confirmaremos observaciones a más tardar el viernes de la presente semana.\n\nAgradecemos de antemano su atención y paciencia.\n\nAtentamente,\nDespacho Herrera & Asociados`,
      `Buenas tardes Sr. Martínez,\n\nLe confirmo la recepción del comprobante de pago correspondiente a los honorarios pactados. En breve le haremos llegar el recibo fiscal correspondiente.\n\nAsimismo, le recordamos que la audiencia se encuentra programada para el próximo miércoles a las 10:00 horas. Le pedimos amablemente presentarse con 15 minutos de anticipación.\n\nQuedamos a su disposición para cualquier duda adicional.\n\nSaludos cordiales.`,
    ],
  },
  regio: {
    name: 'Casual regio (tortillería / negocio familiar)',
    samples: [
      `Qué tal Doña Rosa, ya está su pedido listo. Le mandamos con Chuy la camioneta como a las 4. Traen 30 kilos de maíz y las 10 docenas de tortilla de harina. Cualquier cosa nos avisa. Saludos.`,
      `Hola Marisol! Sí tenemos, checa: hoy tenemos disponibles bolillos, telera, semitas y donas de azúcar. Los precios están igual que la semana pasada. Si quieres te aparto y pasas mañana temprano por ellos, va?`,
      `Buen día Don Pancho, cómo amaneció. Pasando el reporte del día: se vendieron 180 kilos de harina y las tortillas casi se acaban todas. Solo quedaron 3 paquetes. Mañana subimos la producción tantito. Que descanse.`,
    ],
  },
  tecnico: {
    name: 'Técnico directo (SaaS / soporte técnico)',
    samples: [
      `Hola Andrés,\n\nRevisé el ticket. El problema viene del endpoint /api/webhooks/vapi — está devolviendo 401 porque el token de Vapi rotó ayer y no se actualizó en tu env de prod. Solución:\n\n1. Regenera el token en dashboard.vapi.ai → Settings → API Keys\n2. Actualiza VAPI_API_KEY en Vercel → Settings → Environment Variables (Production)\n3. Redeploy\n\nAvísame cuando esté listo y validamos.`,
      `Ok Carlos, hice el diff. El bug era que el cron de reset-minutes corría a las 00:00 UTC pero tu org está en TZ America/Mexico_City. Los últimos 6 horas de facturación se contaban al mes siguiente. Ya está el fix en main (commit 42a1b3c) y voy a correr el backfill manual esta tarde.`,
      `Buenos días. Regarding el issue #142, ya reproduje el error localmente. Root cause: el JOIN entre voice_calls y ops_ledger se rompe cuando outcome=null y direction=inbound. PR abierto: #148. Test regresión incluido. Merge en cuanto pases review.`,
    ],
  },
};

// ─── Prompt (copia del helper voice-guide.ts) ────────────────────────────────

const MAX_SAMPLE_CHARS = 4000;

function buildPrompt(samples) {
  const numbered = samples.map((s, i) => `[Muestra ${i + 1}]\n${s.slice(0, MAX_SAMPLE_CHARS)}`).join('\n\n');
  return `Analiza estas muestras reales de comunicación de un negocio y produce una GUÍA DE TONO reutilizable en español mexicano.

La guía se va a inyectar en el system prompt de un empleado digital (voz + texto) para que hable como este negocio. Sé específico y accionable, no genérico.

Estructura la guía con estos bloques exactos, en español, en menos de 400 palabras totales:

- Ritmo y longitud de oraciones (ejemplo típico observado).
- Palabras o expresiones que este negocio usa recurrentemente (lista 6 a 10).
- Palabras o expresiones que NUNCA usa o evita (lista 3 a 6).
- Trato al cliente (tú/usted, formal/informal, cercano/distante).
- Cómo abre y cómo cierra los mensajes (patrón típico).
- Actitud dominante (por ejemplo: directo, cálido, técnico, empático).

Reglas:
- Basa cada punto en evidencia real de las muestras. No inventes.
- Si una categoría no se puede inferir con confianza, dila más corta o omítela — no rellenes.
- Salida final: texto plano listo para pegar. Sin markdown, sin encabezados con # ni **.

MUESTRAS:

${numbered}`;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runFixture(key: string, fixture: { name: string; samples: string[] }) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${fixture.name}  (key: ${key})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const t0 = Date.now();
  const resp = await client.messages.create({
    model:      'claude-sonnet-5-5',
    max_tokens: 1200,
    messages: [{ role: 'user', content: buildPrompt(fixture.samples) }],
  });
  const ms = Date.now() - t0;
  void logLlmCall({ source: 'eval_brand_voice', model: 'claude-sonnet-5-5', usage: resp.usage, latencyMs: ms, meta: { fixture_key: key, fixture_name: fixture.name } });

  const block = resp.content.find(b => b.type === 'text');
  const guide = block?.type === 'text' ? block.text.trim() : '(sin salida)';

  console.log(guide);
  console.log(`\n[latencia: ${ms}ms | input: ${resp.usage.input_tokens} tokens | output: ${resp.usage.output_tokens} tokens]`);
  return guide;
}

async function main() {
  const arg = process.argv[2];
  const keys = arg ? [arg] : Object.keys(FIXTURES);

  for (const k of keys) {
    if (!FIXTURES[k]) {
      console.error(`Fixture desconocido: ${k}. Disponibles: ${Object.keys(FIXTURES).join(', ')}`);
      process.exit(1);
    }
    await runFixture(k, FIXTURES[k]);
  }
}

main().catch(err => {
  console.error('EVAL FALLÓ:', err.message);
  process.exit(1);
});
