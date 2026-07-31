#!/usr/bin/env tsx
/**
 * Golden tests para pedir_a_humano tool.
 *
 * Corre 10 fixtures contra Anthropic real. Valida que Haiku:
 * - LLAME a pedir_a_humano en casos should_call=true (recall >= 90%)
 * - NO LLAME en casos should_call=false (precision >= 85%)
 *
 * Uso:
 *   npx tsx scripts/eval/run-pedir-a-humano.ts
 *   npx tsx scripts/eval/run-pedir-a-humano.ts --skip-thresholds
 *
 * Exit code:
 *   0 si pasa thresholds (o --skip-thresholds)
 *   1 si falla
 *
 * Requiere ANTHROPIC_API_KEY en env (auto-carga .env.local).
 */

import '../_bootstrap';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

interface FixtureEmail {
  from: string;
  subject: string;
  body: string;
}

interface Fixture {
  id: string;
  description: string;
  should_call_tool: boolean;
  email: FixtureEmail;
  expected_tool_args?: {
    type?: string;
    target?: string;
  };
  alternate_tool?: string;
  context: string;
}

interface Result {
  id: string;
  description: string;
  should_call_tool: boolean;
  actual_called: boolean;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  reason?: string;
  passed: boolean;
}

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.+))?$/);
  if (m) args.set(m[1], m[2] ?? 'true');
}

const skipThresholds = args.get('skip-thresholds') === 'true';
const casesDir = 'scripts/eval/cases/pedir-a-humano';

const THRESHOLDS = {
  recall_should_call: 0.90,      // >= 90% recall en should_call=true
  precision_should_not_call: 0.85, // >= 85% precision en should_call=false (no false positives)
};

function loadFixtures(dir: string): Fixture[] {
  if (!fs.existsSync(dir)) {
    console.error(`Directorio de fixtures no existe: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const fixtures: Fixture[] = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    const fixture = JSON.parse(raw) as Fixture;
    fixtures.push(fixture);
  }

  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

async function runFixture(fixture: Fixture): Promise<Result> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `Eres un empleado de oficina que procesa emails.

Tu correo es de: ${fixture.email.from}
Asunto: ${fixture.email.subject}

Cuerpo del email:
${fixture.email.body}

Contexto del negocio: ${fixture.context}

DECISIÓN: ¿Necesitas llamar a pedir_a_humano?

Disponibles herramientas:
- search_files: buscar en Drive
- read_file: leer archivos
- buscar_en_web: buscar internet
- trigger_outbound_call: hacer llamadas si tienes minutos
- pedir_a_humano: pedir ayuda a humano cuando realmente no puedas resolver

CRITERIOS para llamar pedir_a_humano (en orden de decisión):
1. ¿Requiere acción FÍSICA que solo humano puede hacer? (revisar/firmar documento físico, buscar en archivos físicos, recopilar info de terceros, hacer entrega física)
   → SÍ: LLAMA pedir_a_humano (type='action', target='owner')

2. ¿Requiere INFORMACIÓN que no está disponible en Drive, búsqueda web, QB o información que tienes?
   → SÍ: INTENTA search_files primero. Si no encuentras, LLAMA pedir_a_humano (type='info', target='approver')

3. ¿Requiere APROBACIÓN para decisión fuera de tu autoridad? (descuento grande, acuerdo comercial)
   → SÍ: LLAMA pedir_a_humano (type='approval', target='approver')

4. ¿Cliente pide hablar por TELÉFONO?
   - ¿Tienes minutos disponibles? → USA trigger_outbound_call
   - ¿Sin minutos? → LLAMA pedir_a_humano (type='action', target='approver')

NO llames pedir_a_humano si:
- Info obtenible con search_files, read_file, buscar_en_web
- Puedes hacer llamada (tienes minutos)
- Preguntas rutinarias que ya sabes

Analiza este email y decide: ¿necesitas llamar a pedir_a_humano?`;

  const tools: Anthropic.Tool[] = [
    {
      name: 'search_files',
      description: 'Busca documentos en Google Drive',
      input_schema: {
        type: 'object' as const,
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'read_file',
      description: 'Lee el contenido de un archivo',
      input_schema: {
        type: 'object' as const,
        properties: { file_id: { type: 'string' }, file_name: { type: 'string' } },
        required: ['file_id', 'file_name'],
      },
    },
    {
      name: 'buscar_en_web',
      description: 'Busca información en internet',
      input_schema: {
        type: 'object' as const,
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'trigger_outbound_call',
      description: 'Programa una llamada saliente',
      input_schema: {
        type: 'object' as const,
        properties: {
          phone_number: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['phone_number', 'message'],
      },
    },
    {
      name: 'pedir_a_humano',
      description: `Pide ayuda a un humano del negocio para:
- Información que no tienes en Drive ni puedes obtener con otras tools
- Acciones físicas que solo humanos pueden hacer
- Aprobaciones que exceden tu autoridad

NO la uses si:
- La info está disponible (Drive, búsqueda web, QB)
- Puedes hacer tú la llamada (tienes minutos)
- Otro agente puede ayudar (usa delegate_task)`,
      input_schema: {
        type: 'object' as const,
        properties: {
          type: { type: 'string', enum: ['info', 'action', 'approval'] },
          target: { type: 'string', enum: ['approver', 'owner', 'specific'] },
          target_email: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          urgency: { type: 'string', enum: ['baja', 'media', 'alta'] },
          needed_by: { type: 'string' },
        },
        required: ['type', 'target', 'title', 'description'],
      },
    },
  ];

  const start = Date.now();
  let actualCalled = false;
  let toolName: string | undefined;
  let toolArgs: Record<string, unknown> | undefined;
  let reason: string | undefined;

  try {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Analiza este email y decide si necesitas pedir_a_humano.' },
    ];

    const MAX_ITER = 3;
    for (let i = 0; i < MAX_ITER; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools,
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (textBlock?.type === 'text') reason = textBlock.text.trim();

      if (response.stop_reason !== 'tool_use') break;

      // Check for pedir_a_humano in tool uses
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      for (const block of toolBlocks) {
        if (block.name === 'pedir_a_humano') {
          actualCalled = true;
          toolName = 'pedir_a_humano';
          toolArgs = block.input as Record<string, unknown>;
          break;
        }
      }

      if (actualCalled) break;

      // Continue conversation with tool results (mock)
      const toolResults = toolBlocks.map(b => ({
        type: 'tool_result' as const,
        tool_use_id: b.id,
        content: JSON.stringify({ ok: true, data: 'Mock result' }),
      }));

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }
  } catch (err) {
    reason = `Error: ${String(err)}`;
  }

  const dur = Date.now() - start;

  const passed =
    (fixture.should_call_tool && actualCalled) ||
    (!fixture.should_call_tool && !actualCalled);

  const statusIcon = passed ? '✓' : '✗';
  console.log(
    `[${dur}ms] ${statusIcon} ${fixture.id}: ${fixture.should_call_tool ? 'should call' : 'should NOT call'} → ${actualCalled ? 'called' : 'not called'}`,
  );

  if (!passed) {
    console.error(`        Description: ${fixture.description}`);
    if (actualCalled) {
      console.error(`        Tool: ${toolName}`);
      console.error(`        Args: ${JSON.stringify(toolArgs, null, 2)}`);
    }
    if (reason) {
      console.error(`        Reason: ${reason.slice(0, 200)}`);
    }
  }

  return {
    id: fixture.id,
    description: fixture.description,
    should_call_tool: fixture.should_call_tool,
    actual_called: actualCalled,
    tool_name: toolName,
    tool_args: toolArgs,
    reason,
    passed,
  };
}

async function main() {
  const fixtures = loadFixtures(casesDir);

  if (fixtures.length === 0) {
    console.error(`Sin fixtures en ${casesDir}`);
    process.exit(1);
  }

  console.log(`Corriendo ${fixtures.length} fixtures de pedir_a_humano\n`);

  const results: Result[] = [];
  for (const fixture of fixtures) {
    const result = await runFixture(fixture);
    results.push(result);
  }

  // ── Métricas ────────────────────────────────────────────────────────────────

  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.length - totalPassed;

  // Recall en should_call: ¿cuántos de los casos should_call=true fueron detectados?
  const shouldCallCases = results.filter(r => r.should_call_tool);
  const shouldCallCorrect = shouldCallCases.filter(r => r.passed).length;
  const recallShouldCall = shouldCallCases.length > 0 ? shouldCallCorrect / shouldCallCases.length : 1;

  // Precision en should_NOT_call: ¿cuántos de los casos should_call=false NO llamaron?
  const shouldNotCallCases = results.filter(r => !r.should_call_tool);
  const shouldNotCallCorrect = shouldNotCallCases.filter(r => r.passed).length;
  const precisionShouldNotCall = shouldNotCallCases.length > 0 ? shouldNotCallCorrect / shouldNotCallCases.length : 1;

  console.log(`\n─── RESULTADOS ───`);
  console.log(`Total: ${totalPassed}/${results.length} pasaron`);
  console.log(`Fallos: ${totalFailed}`);

  console.log(`\n─── MÉTRICAS ───`);
  console.log(
    `Recall (should_call):     ${(recallShouldCall * 100).toFixed(1)}% (${shouldCallCorrect}/${shouldCallCases.length})`,
  );
  console.log(
    `Precision (should_NOT_call): ${(precisionShouldNotCall * 100).toFixed(1)}% (${shouldNotCallCorrect}/${shouldNotCallCases.length})`,
  );

  console.log(`\n─── UMBRALES ───`);
  const recallOk = recallShouldCall >= THRESHOLDS.recall_should_call;
  const precisionOk = precisionShouldNotCall >= THRESHOLDS.precision_should_not_call;

  console.log(`Recall >= ${(THRESHOLDS.recall_should_call * 100).toFixed(0)}%: ${recallOk ? '✓ PASS' : '✗ FAIL'}`);
  console.log(
    `Precision >= ${(THRESHOLDS.precision_should_not_call * 100).toFixed(0)}%: ${precisionOk ? '✓ PASS' : '✗ FAIL'}`,
  );

  if (skipThresholds) {
    console.log(`\n[--skip-thresholds] Reportando solo, no fallando.\n`);
    process.exit(0);
  }

  if (recallOk && precisionOk) {
    console.log(`\n✓ Todos los umbrales pasados!\n`);
    process.exit(0);
  } else {
    console.log(`\n✗ Umbrales no alcanzados.\n`);
    process.exit(1);
  }
}

void main();
