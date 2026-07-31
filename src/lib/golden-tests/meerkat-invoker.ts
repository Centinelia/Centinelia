import Anthropic from '@anthropic-ai/sdk';
import { resolveMeerkatConfig } from '@/lib/vapi/resolve-meerkat';
import { NIA_SYSTEM_PROMPT } from './prompts/nia-system';
import type { MeerkatId, ConversationTurn } from './types';

const client = new Anthropic();

const MEERKAT_SYSTEM_PROMPTS: Partial<Record<MeerkatId, string>> = {
  nia: NIA_SYSTEM_PROMPT,
  // Otros meerkats se agregan en follow-ups
};

export function getSystemPromptForMeerkat(meerkatId: MeerkatId): string {
  const prompt = MEERKAT_SYSTEM_PROMPTS[meerkatId];
  if (!prompt) {
    throw new Error(
      `No canonical system prompt registered for meerkat=${meerkatId}. Add one in src/lib/golden-tests/prompts/`,
    );
  }
  return prompt;
}

interface InvokeResult {
  content: string;
  tokens: number;
}

/**
 * Invoca al meerkat con la config específica de la versión pedida.
 * NOTA: usa Anthropic directo (no Vapi) para aislar el test del stack de telefonía.
 * El comportamiento del modelo con este system prompt + config debe ser representativo
 * de la producción — validarlo con smoke tests periódicos.
 */
export async function invokeMeerkat(
  meerkatId: MeerkatId,
  version: number,
  transcript: ConversationTurn[],
): Promise<InvokeResult> {
  const config = await resolveMeerkatConfig(meerkatId, version);
  const systemPrompt = getSystemPromptForMeerkat(meerkatId);

  const messages = transcript.map(t => ({
    role: (t.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: t.content,
  }));

  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  return {
    content: text,
    tokens: response.usage.input_tokens + response.usage.output_tokens,
  };
}
