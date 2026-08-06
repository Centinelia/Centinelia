#!/usr/bin/env node
// E2E dry-run del dispatcher. Ejecuta contra la org studio@pneumastudio.mx
// con 4 mensajes sintéticos que cubren los branches (regla To, regla keyword,
// LLM, fallback Sonnet). Imprime resultado + verifica invariantes.
// Uso: node scripts/e2e-dispatcher-dryrun.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV = 'development';

// Cargar .env.local manualmente (evita dependency de dotenv)
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// tsx runtime para importar TS al vuelo
const { register } = await import('tsx/esm/api');
register();

const { dispatchEmail } = await import(pathToFileURL(path.join(root, 'src/lib/email/dispatcher.ts')).href);

const PORTAL = 'studio@pneumastudio.mx';
const ORG    = 'nazre20@gmail.com';

const cases = [
  {
    name: 'A. Regla To: match',
    msg: { id: 'dryrun-A', from: 'ana@corp.com', to: 'noah@empresa.com', subject: 'test', body: 'test' },
    expect: { assignedBy: 'rule', minConfidence: 0.9 },
  },
  {
    name: 'B. Regla keyword ventas',
    msg: { id: 'dryrun-B', from: 'ana@corp.com', subject: 'Cotización para 50 unidades', body: 'Requiero un pedido grande.' },
    expect: { assignedBy: 'rule', minConfidence: 0.8 },
  },
  {
    name: 'C. Regla keyword recepcion',
    msg: { id: 'dryrun-C', from: 'ana@corp.com', subject: 'Agendar cita el jueves', body: '¿A qué hora tienen disponibilidad?' },
    expect: { assignedBy: 'rule', minConfidence: 0.8 },
  },
  {
    name: 'D. Ambiguo → LLM decide',
    msg: { id: 'dryrun-D', from: 'ana@corp.com', subject: 'Hola equipo', body: 'Quería saludarlos y ver si podemos platicar en algún momento.' },
    expect: { assignedByOneOf: ['llm', 'fallback'] },
  },
];

let ok = 0, fail = 0;
for (const c of cases) {
  process.stdout.write(`\n[${c.name}]\n`);
  const result = await dispatchEmail({
    portalEmail: PORTAL,
    orgEmail:    ORG,
    // Sin pivotAgentId para NO consumir ops en el dry-run
    message:     c.msg,
  });
  console.log(`  agentId=${result.agentId}`);
  console.log(`  assignedBy=${result.assignedBy}  confidence=${result.confidence}`);
  console.log(`  metadata=${JSON.stringify(result.metadata)}`);

  const invariants = [];
  if (c.expect.assignedBy && result.assignedBy !== c.expect.assignedBy) {
    invariants.push(`expected assignedBy=${c.expect.assignedBy}, got ${result.assignedBy}`);
  }
  if (c.expect.assignedByOneOf && !c.expect.assignedByOneOf.includes(result.assignedBy)) {
    invariants.push(`expected assignedBy in ${c.expect.assignedByOneOf}, got ${result.assignedBy}`);
  }
  if (c.expect.minConfidence && result.confidence < c.expect.minConfidence) {
    invariants.push(`expected confidence >= ${c.expect.minConfidence}, got ${result.confidence}`);
  }
  if (invariants.length) {
    console.log(`  ❌ FAIL: ${invariants.join('; ')}`);
    fail++;
  } else {
    console.log(`  ✓ OK`);
    ok++;
  }
}

console.log(`\n────────────────────────`);
console.log(`Resultado: ${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
