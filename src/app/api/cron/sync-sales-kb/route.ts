import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { logLlmCall } from '@/lib/observability/llm-log';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

const LANDING_URL   = 'https://www.centinelia.mx';
const LANDING_HASH_KEY = 'sync_sales_kb_landing_hash';

async function scrapeLanding(): Promise<string> {
  const res = await fetch(LANDING_URL, {
    signal:  AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Centinelia-Internal/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<(script|style|head|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14000);
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  let landingText: string;
  try {
    landingText = await scrapeLanding();
  } catch (err) {
    return NextResponse.json({ error: `Scrape failed: ${String(err)}` }, { status: 500 });
  }

  const supabase = createAdminClient();
  const force = req.nextUrl.searchParams.get('force') === '1';

  const landingHash = createHash('sha256').update(landingText).digest('hex');
  const { data: hashRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', LANDING_HASH_KEY)
    .maybeSingle();
  const previousHash = hashRow?.value ?? null;

  if (!force && previousHash === landingHash) {
    console.log('[sync-sales-kb] SKIP — landing content unchanged since last run');
    return NextResponse.json({
      ok: true,
      skipped_reason: 'landing_content_unchanged',
      scraped_chars: landingText.length,
    });
  }

  const today = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  let msg;
  try {
    msg = await client.messages.create({
    model:      __m,
    max_tokens: 1400,
    messages: [{
      role: 'user',
      content: `Analiza el texto de la landing page de Centinelia y extrae la información clave de forma precisa. Solo incluye lo que realmente aparece en el texto — no inventes nada.

TEXTO DE LA LANDING PAGE:
${landingText}

Responde con este formato exacto:

## Terminología vigente (${today})

**Términos correctos — usa siempre:**
[lista los términos que usa la página para referirse al producto, empleados, funciones, planes]

**Términos prohibidos — nunca uses:**
[lista los términos técnicos, desactualizados o que la página evita — ej: agente, agente IA, bot, ops, operaciones IA, knowledge base, Agente Comercial, Ejecutivo Senior, Starter, Growth, Scale]

## Precios y planes actuales
[extrae los nombres de planes, precios y lo que incluye cada uno tal como aparece en la página]

## Propuesta de valor central
[2-3 frases que resumen el mensaje principal de Centinelia según la página]

## Mensajes y frases clave
[bullet list de los mensajes más importantes, frases de la landing que reflejan la narrativa]`,
    }],
  });
    void logLlmCall({ source: 'sync_sales_kb', model: __m, usage: msg.usage, latencyMs: Date.now() - __t });
  } catch (err) {
    void logLlmCall({ source: 'sync_sales_kb', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const extracted = ((msg.content[0] as { type: string; text?: string }).text ?? '').trim();
  if (!extracted) {
    return NextResponse.json({ error: 'Extraction returned empty' }, { status: 500 });
  }

  const records = [
    {
      key:   'kb_sales',
      value: `${extracted}\n\n---\nFuente: centinelia.mx. Usa esta información para corregir cualquier término desactualizado en tus respuestas y asegurarte de que el lenguaje refleje la narrativa actual de la marca.`,
    },
    {
      key:   'kb_portal',
      value: extracted,
    },
    {
      key:   LANDING_HASH_KEY,
      value: landingHash,
    },
  ];

  const errors: string[] = [];
  for (const record of records) {
    const { error } = await supabase
      .from('platform_settings')
      .upsert(record, { onConflict: 'key' });
    if (error) errors.push(`${record.key}: ${error.message}`);
  }

  if (errors.length) {
    console.error('[sync-sales-kb] upsert errors:', errors);
    return NextResponse.json({ ok: false, errors }, { status: 500 });
  }

  console.log(`[sync-sales-kb] OK — ${landingText.length} chars scraped, ${extracted.length} chars extracted`);
  return NextResponse.json({ ok: true, scraped_chars: landingText.length, extracted_chars: extracted.length });
}
