#!/usr/bin/env tsx
/**
 * Prueba la extracción de facts sobre una llamada real (F9.1 día 1).
 *
 * Toma una llamada por id (o la última de un agente), extrae facts con
 * Anthropic, y opcionalmente los persiste al memory graph. Sirve para
 * validar que el prompt de extracción funciona antes de hookearlo al
 * webhook.
 *
 * Uso:
 *   npx tsx scripts/memory/test-extract.ts --call=<uuid>
 *   npx tsx scripts/memory/test-extract.ts --agent=<uuid> --last
 *   npx tsx scripts/memory/test-extract.ts --call=<uuid> --persist
 *
 * Sin --persist solo imprime lo que EXTRAERÍA (dry-run).
 * Con --persist además llama a ingestCall() y persiste al memory graph.
 */
import { createClient } from '@supabase/supabase-js';
import { extractFromTranscript } from '../../src/lib/memory/extract';
import { ingestCall } from '../../src/lib/memory';

const args = new Map<string, string>();
const flags = new Set<string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.+)$/);
  if (m) args.set(m[1], m[2]);
  else if (a.startsWith('--')) flags.add(a.slice(2));
}

const callId  = args.get('call');
const agentId = args.get('agent');
const persist = flags.has('persist');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Falta ANTHROPIC_API_KEY en env.');
  process.exit(1);
}

const supabase = createClient(url, key);

interface CallRow {
  id:         string;
  agent_id:   string;
  transcript: string | null;
  outcome:    string | null;
  duration_seconds: number | null;
}

async function main() {
  let call: CallRow | null = null;

  if (callId) {
    const { data } = await supabase.from('voice_calls').select('id, agent_id, transcript, outcome, duration_seconds').eq('id', callId).single();
    call = data as CallRow | null;
  } else if (agentId && flags.has('last')) {
    const { data } = await supabase
      .from('voice_calls')
      .select('id, agent_id, transcript, outcome, duration_seconds')
      .eq('agent_id', agentId)
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    call = data as CallRow | null;
  } else {
    console.error('Uso: --call=<uuid>  o  --agent=<uuid> --last');
    process.exit(1);
  }

  if (!call || !call.transcript) {
    console.error('Sin llamada válida (o sin transcript).');
    process.exit(0);
  }

  console.log(`Llamada ${call.id} — ${call.duration_seconds ?? '?'}s, outcome: ${call.outcome ?? '?'}`);
  console.log(`Transcript: ${call.transcript.length} chars\n`);

  console.log('Extrayendo facts…\n');
  const started = Date.now();

  if (persist) {
    const result = await ingestCall({
      agentId:    call.agent_id,
      callId:     call.id,
      transcript: call.transcript,
    });
    const ms = Date.now() - started;
    console.log('─ INGESTA (persistida) ─');
    console.log(`  Facts detectados:     ${result.factsFound}`);
    console.log(`  Entities upserted:    ${result.entitiesUpserted}`);
    console.log(`  Facts creados:        ${result.factsCreated}`);
    console.log(`  Duración:             ${(ms / 1000).toFixed(1)}s`);
    console.log(`  Tokens input:         ${result.inputTokens} (${result.cacheReadTokens} de cache · ${result.cacheCreatedTokens} creados)`);
    console.log(`  Tokens output:        ${result.outputTokens}`);
    return;
  }

  // Dry-run
  const { facts, cacheReadTokens, cacheCreatedTokens, inputTokens, outputTokens } = await extractFromTranscript({
    transcript: call.transcript,
  });
  const ms = Date.now() - started;

  console.log('─ FACTS DETECTADOS (dry-run) ─');
  if (facts.length === 0) {
    console.log('  (sin facts verificables)');
  } else {
    for (const f of facts) {
      const objStr = f.object
        ? [
            f.object.text   ? `"${f.object.text}"` : '',
            f.object.number ? `$${f.object.number}` : '',
            f.object.date   ? f.object.date : '',
            f.object.entity ? `→${f.object.entity.name}` : '',
          ].filter(Boolean).join(' ')
        : '';
      console.log(`  ${f.subject.name} (${f.subject.type})  ${f.predicate}  ${objStr}  [conf ${(f.confidence ?? 1).toFixed(2)}]`);
    }
  }

  console.log('');
  console.log(`  Duración:             ${(ms / 1000).toFixed(1)}s`);
  console.log(`  Tokens input:         ${inputTokens} (${cacheReadTokens} de cache · ${cacheCreatedTokens} creados)`);
  console.log(`  Tokens output:        ${outputTokens}`);
  console.log('');
  console.log('  (Corre con --persist para escribir al memory graph.)');
}

main().catch(err => { console.error(err); process.exit(1); });
