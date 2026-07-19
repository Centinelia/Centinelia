import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json() as { greeting?: string };
  const firstMessage = body.greeting?.trim()
    ?? 'Hola, gracias por llamar. ¿En qué le puedo ayudar?';

  const res = await fetch('https://api.vapi.ai/call/web', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      assistantId:        process.env.DEMO_AGENT_ID,
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
