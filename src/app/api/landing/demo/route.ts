import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const body = await req.json() as { description?: string };
  const description = body.description?.trim().slice(0, 400);

  if (!description)
    return NextResponse.json({ error: 'Descripción requerida' }, { status: 400 });

  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [
      {
        role:    'user',
        content: `Eres Nia, recepcionista telefónica con IA, profesional y natural.
Genera SOLO el saludo de apertura que usas cuando contestas el teléfono para este negocio.
Debe ser en español mexicano, máximo 2 oraciones, natural y cálido.
No uses signos de exclamación. Empieza con "Hola,".
Contexto del negocio: ${description}

Responde ÚNICAMENTE con el texto del saludo, sin comillas ni explicaciones.`,
      },
    ],
  });

  const greeting = (msg.content[0] as { type: 'text'; text: string }).text.trim();
  return NextResponse.json({ greeting });
}
