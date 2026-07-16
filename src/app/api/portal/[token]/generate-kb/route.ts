import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export const dynamic = 'force-dynamic';

const OPS_COST = 3;

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const { type, role } = await req.json() as { type: 'business' | 'role'; role?: string };

  if (type !== 'business' && type !== 'role')
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
  if (type === 'role' && !role?.trim())
    return NextResponse.json({ error: 'Rol requerido' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, business_description, business_website, website_knowledge, business_hours, knowledge_base, first_message, transfer_rules, role_knowledge_base, role_learnings')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });

  const ops = await consumeAiOp(agent.id, OPS_COST);
  if (!ops.ok)
    return NextResponse.json(
      { error: `Sin ops disponibles (${ops.used}/${ops.limit} usadas)` },
      { status: 402 }
    );

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const businessName   = agent.business_name ?? 'este negocio';
  const description    = (agent as any).business_description?.trim() || null;
  const website        = (agent as any).business_website?.trim()     || null;
  const websiteContent = (agent as any).website_knowledge?.trim()    || null;
  const hours          = (agent as any).business_hours               || null;
  const existingKb     = (agent as any).knowledge_base?.trim()       || null;
  const firstMessage   = (agent as any).first_message?.trim()        || null;
  const transferRules  = (agent as any).transfer_rules?.trim()       || null;
  const existingRole   = (agent as any).role_knowledge_base?.trim()  || null;
  const roleLearnings  = (agent as any).role_learnings?.trim()       || null;

  // Format business hours for the prompt
  let hoursText: string | null = null;
  if (hours && typeof hours === 'object') {
    const days: Record<string, string> = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo' };
    const lines = Object.entries(hours as Record<string, { open: string; close: string; closed?: boolean }>)
      .map(([d, v]) => v.closed ? `${days[d] ?? d}: Cerrado` : `${days[d] ?? d}: ${v.open} – ${v.close}`)
      .filter(Boolean);
    if (lines.length) hoursText = lines.join('\n');
  }

  let prompt: string;

  if (type === 'business') {
    prompt = `Eres un especialista en bases de conocimiento para negocios en México. Genera una base de conocimiento completa y lista para usar para un agente IA telefónico que atenderá clientes 24/7.

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
${description    ? `- Descripción del negocio: ${description}` : ''}
${website        ? `- URL del sitio web: ${website}` : ''}
${hoursText      ? `- Horarios de atención:\n${hoursText}` : ''}
${firstMessage   ? `- Saludo actual del agente: "${firstMessage}"` : ''}
${transferRules  ? `- Reglas de transferencia actuales: ${transferRules}` : ''}
${websiteContent ? `\nCONTENIDO EXTRAÍDO DEL SITIO WEB (fuente principal — usa estos datos reales):
---
${websiteContent.slice(0, 6000)}
---` : ''}
${existingKb     ? `\nBase de conocimiento actual (mejora, organiza y expande esto):\n${existingKb}` : ''}

INSTRUCCIONES DE FORMATO:
- Texto plano sin markdown, sin asteriscos, sin guiones largos
- Títulos de sección en MAYÚSCULAS
- Elementos con guión (-)
- Español mexicano natural
- Usa datos reales del sitio web cuando estén disponibles
- Solo usa [COMPLETAR: descripción] para datos que genuinamente no puedas inferir

GENERA ESTAS SECCIONES:

INFORMACIÓN GENERAL
- Qué hace el negocio y qué problema resuelve
- Propuesta de valor principal

SERVICIOS Y PRECIOS
- Cada servicio/producto con precio y descripción breve

HORARIOS Y UBICACIÓN
- Días y horas exactas de atención
- Dirección o zona de cobertura / modo de servicio (presencial, a domicilio, en línea)

PROCESO DE ATENCIÓN
- Cómo solicita el cliente una cita, cotización o pedido
- Tiempo de respuesta o entrega
- Formas de pago aceptadas

PREGUNTAS FRECUENTES
(Mínimo 8 preguntas reales con respuestas completas)

POLÍTICAS
- Cancelaciones y cambios
- Garantías o devoluciones

INSTRUCCIONES PARA EL AGENTE
- Cómo manejar quejas o clientes difíciles
- Cuándo y a quién transferir la llamada
- Qué información nunca debe compartir`;

  } else {
    prompt = `Eres un especialista en procesos operativos para negocios en México. Genera instrucciones detalladas y listas para usar para un empleado IA con un rol específico.

DATOS:
- Negocio: ${businessName}
${description    ? `- Descripción del negocio: ${description}` : ''}
- Rol del empleado: ${role}
${websiteContent ? `\nCONTENIDO DEL SITIO WEB (úsalo para entender los procesos y servicios reales del negocio):
---
${websiteContent.slice(0, 4000)}
---` : ''}
${existingRole   ? `\nInstrucciones actuales del rol (mejora y expande esto):\n${existingRole}` : ''}
${roleLearnings  ? `\nAprendizajes del empleado en campo (considera estos patrones reales):\n${roleLearnings}` : ''}

INSTRUCCIONES DE FORMATO:
- Texto plano sin markdown ni asteriscos
- Títulos en MAYÚSCULAS, elementos con guión (-) o numerados
- Español mexicano natural
- Solo usa [COMPLETAR: descripción] para datos que genuinamente no puedas inferir

GENERA ESTAS SECCIONES:

RESPONSABILIDADES PRINCIPALES
- Qué hace este empleado día a día

PROCEDIMIENTOS PASO A PASO
(Mínimo 2 procesos clave numerados paso a paso)
Proceso: [nombre del proceso]
1. ...
2. ...

CRITERIOS DE DECISIÓN
- Qué puede resolver de forma autónoma
- Qué requiere aprobación humana

ESCALACIONES
- Qué situaciones escalar de inmediato y a quién

CONTACTOS Y RECURSOS CLAVE
- [COMPLETAR: nombre/puesto] para [tipo de asunto]

LÍMITES Y RESTRICCIONES
- Qué no puede hacer sin autorización expresa`;
  }

  const stream = client.messages.stream({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    messages:   [{ role: 'user', content: prompt }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
          }
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'Error generando la base de conocimiento' })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
