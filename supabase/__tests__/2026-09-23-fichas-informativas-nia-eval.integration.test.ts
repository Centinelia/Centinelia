/**
 * Smoke integration para Nia + fichas_informativas del Municipio de Santiago NL.
 *
 * Lee data real de Supabase (voice_agent Nia + nara_fichas_informativas + chunks) y
 * simula 3 llamadas de ciudadano con Claude Sonnet 4.6. Valida:
 *   1. Nia invoca consultar_fichas (1 vez por turno).
 *   2. La respuesta contiene datos exactos de la ficha (correo, extensión).
 *   3. Cumple reglas de estilo Centinelia (sin emojis, sin em-dashes,
 *      sin markdown headers pesados).
 *   4. Cumple no-IA-visible (no menciona "IA", "asistente virtual", "bot").
 *
 * Guard: assertNotProdOrAllowed() para prevenir consumo accidental de créditos
 * Anthropic en CI/dev sin autorización. Setear ALLOW_SMOKE_ON_PROD_DB=1 para
 * correr contra el proyecto real.
 *
 * Costo estimado por corrida: ~$0.02 USD (Sonnet 4.6 con cache).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAgentTool } from '@/lib/tools/executor';
import { assertNotProdOrAllowed } from './_helpers/assert-not-prod';

const PORTAL_EMAIL = 'santiago-dev@centinelia.mx';

// Cambia a false si no quieres que este archivo consuma créditos Anthropic
// en runs locales. Se ejecuta con: ALLOW_SMOKE_ON_PROD_DB=1 npx vitest run
// supabase/__tests__/2026-09-23-nara-fichas-nia-eval.integration.test.ts
const SHOULD_RUN = process.env.ALLOW_SMOKE_ON_PROD_DB === '1';

const TOOL_SCHEMA: Anthropic.Tool = {
  name: 'consultar_fichas',
  description: 'Consulta el catálogo oficial de fichas técnicas de trámites del municipio.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'La duda del ciudadano tal como la formuló.' },
    },
    required: ['query'],
  },
};

interface CitizenTurn {
  input:               string;
  expected_ficha:      string;        // codigo esperado
  must_contain_any:    string[];      // strings que deben aparecer en la respuesta
  hint:                string;
}

const TURNS: CitizenTurn[] = [
  {
    input:            'Hola, buenos días. ¿Cómo pago mi predial?',
    expected_ficha:   'TS-SFT-RIN-02',
    must_contain_any: ['predial@santiago.gob.mx', '2174', 'Elvira'],
    hint:             'Predial',
  },
  {
    input:            'Buenas tardes, me pusieron una infracción y quiero saber cuánto sale.',
    expected_ficha:   'TS-SFT-ING-01',
    must_contain_any: ['ingresos@santiago.gob.mx', '2142', 'Socorro', '207'],
    hint:             'Multas de Tránsito',
  },
  {
    input:            'Compré una casa hace poco. ¿Qué necesito para el impuesto de adquisición de inmuebles?',
    expected_ficha:   'TS-SFT-RIN-01',
    must_contain_any: ['isai@santiago.gob.mx', '2174', 'Elvira'],
    hint:             'ISAI',
  },
];

// Regex para detectar violaciones de estilo Centinelia.
const EMOJI_RE       = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
const EM_DASH_RE     = /—/;
const MD_HEADER_RE   = /^#{1,6}\s|^\*\*[^*]+\*\*$/m;
const AI_MENTION_RE  = /\b(inteligencia\s+artificial|asistente\s+virtual|soy\s+una?\s+IA|soy\s+un?\s+bot|chatbot)\b/i;

describe.runIf(SHOULD_RUN)('Nia + fichas_informativas — smoke integration', () => {
  beforeAll(async () => {
    // Vitest workers no heredan el env de Next; carga .env.local a mano.
    const fs   = await import('node:fs');
    const path = await import('node:path');
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    }
    assertNotProdOrAllowed();
  });

  it.each(TURNS)('turno "$hint": Nia consulta la ficha y responde con datos exactos', async (turn) => {
    const supabase = createAdminClient();
    const { data: agent, error: agErr } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('portal_email', PORTAL_EMAIL)
      .single();
    expect(agErr).toBeNull();
    expect(agent?.agent_name).toBe('Nia');
    expect((agent?.features as { fichas_informativas?: boolean })?.fichas_informativas).toBe(true);

    const anth    = new Anthropic();
    const system  = [
      `Eres ${agent.agent_name}, ${agent.role}. Nunca digas ni sugieras que eres una IA.`,
      '',
      agent.role_knowledge_base,
    ].join('\n');
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: turn.input }];

    let toolCalls   = 0;
    let toolReturn  = null as unknown;
    let finalText   = '';

    for (let step = 0; step < 4; step++) {
      const resp = await anth.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 800,
        system:     [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools:      [TOOL_SCHEMA],
        messages,
      });

      if (resp.stop_reason === 'end_turn') {
        finalText = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim();
        break;
      }
      if (resp.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: resp.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const b of resp.content) {
          if (b.type !== 'tool_use') continue;
          toolCalls++;
          const r = await executeAgentTool(
            'consultar_fichas',
            b.input as Record<string, unknown>,
            {
              agentId:      agent.id,
              portalEmail:  PORTAL_EMAIL,
              agentName:    agent.agent_name ?? 'Nia',
              businessName: agent.business_name ?? 'Municipio de Santiago Nuevo León',
              portalToken:  agent.portal_token ?? '',
              agent:        agent as unknown as Record<string, unknown>,
              supabase,
              channel:      'voice',
            },
          );
          toolReturn = r;
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(r) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      break;
    }

    // 1. Nia invocó el tool
    expect(toolCalls).toBeGreaterThanOrEqual(1);

    // 2. Tool devolvió modo stuffed con las fichas
    expect(toolReturn).toMatchObject({ ok: true, mode: 'stuffed' });
    const fichas = (toolReturn as { fichas: Array<{ codigo: string }> }).fichas;
    const expectedInCatalog = fichas.some((f) => f.codigo === turn.expected_ficha);
    expect(expectedInCatalog).toBe(true);

    // 3. La respuesta contiene AL MENOS uno de los datos discriminantes
    const found = turn.must_contain_any.filter((s) => finalText.toLowerCase().includes(s.toLowerCase()));
    expect(found.length, `Respuesta no contiene ninguno de ${JSON.stringify(turn.must_contain_any)}. Respuesta:\n${finalText}`).toBeGreaterThan(0);

    // 4. Cumple reglas de estilo Centinelia
    expect(EMOJI_RE.test(finalText), `Respuesta contiene emojis:\n${finalText}`).toBe(false);
    expect(EM_DASH_RE.test(finalText), `Respuesta contiene em-dash:\n${finalText}`).toBe(false);
    expect(MD_HEADER_RE.test(finalText), `Respuesta contiene markdown headers:\n${finalText}`).toBe(false);
    expect(AI_MENTION_RE.test(finalText), `Respuesta menciona IA/bot/chatbot:\n${finalText}`).toBe(false);
  }, 60_000);
});
