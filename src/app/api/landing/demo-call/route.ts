import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json() as { greeting?: string };
  const firstMessage = body.greeting?.trim()
    ?? 'Hola, gracias por llamar. ¿En qué le puedo ayudar?';

  const key = process.env.VAPI_PUBLIC_KEY;
  const assistantId = process.env.DEMO_AGENT_ID;

  if (!key || !assistantId) {
    console.error('[demo-call] missing env', { hasKey: !!key, hasAssistant: !!assistantId });
    return NextResponse.json({ error: 'Configuración de demo incompleta' }, { status: 500 });
  }

  const res = await fetch('https://api.vapi.ai/call/web', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      assistantId,
      assistantOverrides: { firstMessage },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[demo-call] VAPI error', res.status, text);
    return NextResponse.json({ error: 'Error al crear la llamada' }, { status: 502 });
  }

  const data = await res.json() as { webCallUrl?: string; id?: string };

  if (!data.webCallUrl) {
    console.error('[demo-call] No webCallUrl in response', data);
    return NextResponse.json({ error: 'No se recibió URL de llamada' }, { status: 502 });
  }

  return NextResponse.json({ webCallUrl: data.webCallUrl, callId: data.id });
}
