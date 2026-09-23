import OpenAI from 'openai';
import crypto from 'node:crypto';
import { logLlmCall } from '@/lib/observability/llm-log';

// Modelo fijo: text-embedding-3-small (1536 dim). Alineado con la migración
// fichas_informativas_chunks.embedding vector(1536). Si algún día cambiamos a 3-large
// hay que migrar la columna también.
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM   = 1536;

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en el entorno');
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

// Determinístico: mismo texto → mismo vector. Solo dev/tests cuando no hay
// OPENAI_API_KEY. Normalizado a unit-length para que cosine distance funcione
// aunque los valores no representen semántica real.
function mockEmbedding(text: string): number[] {
  const seed = crypto.createHash('sha256').update(text).digest();
  const out  = new Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) {
    // Reutiliza el hash SHA-256 en un stream repetido para llenar 1536 dims.
    const byte = seed[i % seed.length];
    out[i] = (byte / 255) * 2 - 1; // [-1, 1)
  }
  const mag = Math.sqrt(out.reduce((s, v) => s + v * v, 0));
  return out.map((v) => v / mag);
}

export interface EmbedOpts {
  source?:      string;
  portalEmail?: string;
}

// Batch embed. OpenAI acepta hasta 2048 inputs por request; agrupamos por
// seguridad en tandas de 96 (suficiente para una ficha de ~10 chunks o para
// ingerir varias fichas de una).
const BATCH_SIZE = 96;

export async function embedTexts(texts: string[], opts: EmbedOpts = {}): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Modo mock para dev/tests: MOCK_EMBEDDINGS=1 o cuando MOCK_EMBEDDINGS=auto
  // y no hay OPENAI_API_KEY. Los vectores son determinísticos por texto pero
  // no representan semántica — nunca activar en prod.
  const mockFlag = process.env.MOCK_EMBEDDINGS;
  const useMock  = mockFlag === '1' || mockFlag === 'true' ||
                   (mockFlag === 'auto' && !process.env.OPENAI_API_KEY);
  if (useMock) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MOCK_EMBEDDINGS no puede activarse en producción');
    }
    return texts.map(mockEmbedding);
  }

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const t0 = Date.now();
    try {
      const resp = await getClient().embeddings.create({
        model: EMBED_MODEL,
        input: batch,
      });
      void logLlmCall({
        source:      opts.source ?? 'nara-fichas-embed',
        model:       EMBED_MODEL,
        usage:       { input_tokens: resp.usage?.prompt_tokens ?? 0, output_tokens: 0 },
        portalEmail: opts.portalEmail,
        latencyMs:   Date.now() - t0,
        meta:        { batch_size: batch.length },
      });
      for (const item of resp.data) out.push(item.embedding);
    } catch (err) {
      void logLlmCall({
        source:      opts.source ?? 'nara-fichas-embed',
        model:       EMBED_MODEL,
        usage:       { input_tokens: 0, output_tokens: 0 },
        portalEmail: opts.portalEmail,
        latencyMs:   Date.now() - t0,
        error:       err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
  return out;
}

export async function embedText(text: string, opts?: EmbedOpts): Promise<number[]> {
  const [emb] = await embedTexts([text], opts);
  return emb;
}
