import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { notionClient } from '@/lib/notion/client';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { sendEmail } from '@/lib/email/send';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { GenericDocPDF } from '@/lib/pdf/doc';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { getConnector, type IntegrationRow } from '@/lib/connectors';
import { ProposalPDF, LetterPDF } from '@/lib/pdf/doc';
import { searchMultiple, buildQueries, type ResearchType } from '@/lib/search/web';
import { scrapeWebsite } from '@/lib/scrape/website';

export const dynamic = 'force-dynamic';

// ── SSRF guard ────────────────────────────────────────────────────────────────

function isPrivateUrl(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (!['http:', 'https:'].includes(protocol)) return true;
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
    if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const CREATE_CONTRACT_DRAFT_TOOL: Anthropic.Tool = {
  name: 'create_contract_draft',
  description: 'Crea un borrador de contrato de prestación de servicios para un cliente específico, basado en la plantilla del negocio. Úsala cuando el dueño te pida generar un contrato para un cliente, o cuando la conversación (llamada/correo) haya resultado en un acuerdo comercial.',
  input_schema: {
    type: 'object' as const,
    properties: {
      client_name:  { type: 'string', description: 'Nombre completo del cliente o razón social' },
      client_email: { type: 'string', description: 'Correo electrónico del cliente' },
      client_rfc:   { type: 'string', description: 'RFC del cliente (si se conoce)' },
      client_phone: { type: 'string', description: 'Teléfono del cliente (si se conoce)' },
      clause_overrides: {
        type: 'array',
        description: 'Ajustes a cláusulas específicas respecto a la plantilla base',
        items: {
          type: 'object',
          properties: {
            id:      { type: 'string', description: 'ID de la cláusula (ej: vigencia, monto, pago)' },
            enabled: { type: 'boolean', description: 'Si la cláusula debe incluirse' },
            body:    { type: 'string',  description: 'Texto personalizado de la cláusula' },
          },
          required: ['id'],
        },
      },
      notes:       { type: 'string', description: 'Notas internas para el dueño sobre este contrato' },
      source_type: { type: 'string', enum: ['llamada', 'correo', 'manual'], description: 'Origen del contrato' },
      source_ref:  { type: 'string', description: 'Referencia al origen (ej: ID de llamada, asunto de correo)' },
    },
    required: [],
  },
};

const SEND_EMAIL_TOOL: Anthropic.Tool = {
  name: 'send_email',
  description: 'Envía un correo electrónico a cualquier destinatario en nombre del negocio. Puede incluir un archivo adjunto de Google Drive o OneDrive. Úsala cuando el dueño te pida enviar un correo, con o sin adjunto.',
  input_schema: {
    type: 'object' as const,
    properties: {
      to:                   { type: 'string', description: 'Dirección de correo del destinatario' },
      subject:              { type: 'string', description: 'Asunto del correo' },
      body:                 { type: 'string', description: 'Cuerpo del correo en texto. Puedes usar saltos de línea.' },
      cc:                   { type: 'string', description: 'Dirección en copia (opcional)' },
      attachment_file_id:   { type: 'string', description: 'ID del archivo de Drive/OneDrive a adjuntar (obtenido de search_files). Opcional.' },
      attachment_file_name: { type: 'string', description: 'Nombre del archivo adjunto con extensión. Ej: propuesta-acme.pdf' },
      attachment_mime_type: { type: 'string', description: 'Tipo MIME del archivo (de search_files). Ej: application/vnd.google-apps.document' },
    },
    required: ['to', 'subject', 'body'],
  },
};

const CREATE_DOCUMENT_TOOL: Anthropic.Tool = {
  name: 'create_document',
  description: 'Genera un documento PDF con branding del negocio (logo y colores). Elige el template correcto según el tipo: "proposal" para propuestas de servicios/cotizaciones, "letter" para cartas formales, "general" para cualquier otro documento. Úsala cuando el dueño pida redactar o generar cualquier documento.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title:         { type: 'string', description: 'Título del documento (aparece en el encabezado)' },
      content:       { type: 'string', description: 'Contenido completo. Usa # para secciones principales y ## para subsecciones.' },
      filename:      { type: 'string', description: 'Nombre del archivo sin extensión. Usa guiones, sin espacios.' },
      template_type: { type: 'string', enum: ['general', 'proposal', 'letter'], description: '"proposal" para propuestas/cotizaciones con sección de cliente y precio destacado. "letter" para cartas formales con destinatario. "general" para cualquier otro documento.' },
      client_name:   { type: 'string', description: 'Nombre del cliente (solo para template proposal)' },
      client_email:  { type: 'string', description: 'Correo del cliente (solo para template proposal)' },
      total_price:   { type: 'string', description: 'Precio total destacado. Ej: "$50,000 MXN" (solo para template proposal)' },
      validity_days: { type: 'number', description: 'Días de validez de la propuesta (solo para template proposal)' },
      recipient_name:  { type: 'string', description: 'Nombre del destinatario (solo para template letter)' },
      recipient_email: { type: 'string', description: 'Correo del destinatario (solo para template letter)' },
    },
    required: ['title', 'content'],
  },
};

const TRIGGER_CALL_TOOL: Anthropic.Tool = {
  name: 'trigger_outbound_call',
  description: 'Realiza una llamada telefónica saliente a un número específico usando el agente de voz. Úsala cuando el dueño pida llamar a alguien.',
  input_schema: {
    type: 'object' as const,
    properties: {
      phone_number: { type: 'string', description: 'Número de teléfono con código de país. Ej: +5218113333333' },
      contact_name: { type: 'string', description: 'Nombre del contacto (opcional pero recomendado)' },
      message:      { type: 'string', description: 'Motivo de la llamada o mensaje que el agente debe transmitir' },
    },
    required: ['phone_number', 'message'],
  },
};

const SEARCH_FILES_TOOL: Anthropic.Tool = {
  name: 'search_files',
  description: 'Busca archivos en Google Drive o OneDrive del dueño del negocio. Úsala cuando el dueño pida buscar un documento o archivo en su almacenamiento en la nube.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Nombre o descripción del archivo a buscar' },
    },
    required: ['query'],
  },
};

const READ_FILE_TOOL: Anthropic.Tool = {
  name: 'read_file',
  description: 'Lee el contenido de un archivo de Google Drive o OneDrive. Úsala después de search_files cuando el dueño quiera ver el contenido de un archivo específico.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_id:   { type: 'string', description: 'ID del archivo obtenido de search_files' },
      file_name: { type: 'string', description: 'Nombre del archivo para referencia' },
      mime_type: { type: 'string', description: 'Tipo MIME del archivo (de search_files)' },
    },
    required: ['file_id', 'file_name'],
  },
};

const SEARCH_LEADS_TOOL: Anthropic.Tool = {
  name: 'search_leads',
  description: 'Busca información en internet para cualquier tipo de investigación. Usa research_type para aplicar la estrategia correcta: cada tipo tiene sus propias queries especializadas. Úsala ante cualquier consulta de investigación: "busca leads de X en Y", "investiga competidores de Z", "qué regulaciones hay para abrir una clínica", "noticias sobre el sector X".',
  input_schema: {
    type: 'object' as const,
    properties: {
      topic: {
        type: 'string',
        description: 'Qué buscar. Ej: "personas que quieren vender su casa", "despachos contables", "abrir una farmacia".',
      },
      location: {
        type: 'string',
        description: 'Ciudad o zona geográfica. Ej: "Monterrey", "CDMX". Opcional.',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Palabras clave adicionales. Opcional.',
      },
      research_type: {
        type: 'string',
        enum: ['leads', 'competidores', 'mercado', 'regulaciones', 'noticias', 'general'],
        description: '"leads": rastrea web + Facebook + LinkedIn + portales de clasificados e inmuebles. "competidores": empresas del nicho con precios y servicios. "mercado": tendencias, estadísticas y oportunidades del sector. "regulaciones": permisos, leyes, normas NOM, trámites COFEPRIS/SAT/IMSS. "noticias": actividad reciente. "general": búsqueda libre. Si el dueño pide leads o prospectos usa "leads". Por defecto "general".',
      },
    },
    required: ['topic'],
  },
};

const READ_URL_TOOL: Anthropic.Tool = {
  name: 'read_url',
  description: 'Lee el contenido completo de una URL específica. Úsala después de search_leads para leer los 2-3 resultados más prometedores y obtener datos reales: contacto, precios, servicios, información detallada. No la uses en redes sociales (Facebook, LinkedIn, X/Twitter, Instagram, TikTok) que bloquean el acceso — para esas, usa el título y descripción del resultado de búsqueda.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url:     { type: 'string', description: 'URL completa a leer. Ej: https://empresa.com/contacto' },
      purpose: { type: 'string', description: 'Para qué necesitas leer esta URL. Ej: "obtener datos de contacto del lead", "ver precios del competidor"' },
    },
    required: ['url'],
  },
};

const SAVE_TO_DRIVE_TOOL: Anthropic.Tool = {
  name: 'save_to_drive',
  description: 'Guarda un documento generado en Google Drive o OneDrive del dueño. Úsala después de create_document cuando el dueño quiera que el archivo quede en su Drive, o cuando pida explícitamente guardar algo en la nube. Puede crear la carpeta de destino automáticamente si no existe.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_id:     { type: 'string', description: 'storage_path del documento generado (campo file_id de create_document). Ej: "uuid/nombre-1234567890.pdf"' },
      filename:    { type: 'string', description: 'Nombre del archivo en Drive/OneDrive, con extensión. Ej: "Propuesta Acme 2026.pdf"' },
      folder_name: { type: 'string', description: 'Carpeta de destino en Drive/OneDrive. Se crea si no existe. Ej: "Propuestas 2026". Omite si quiere guardarlo en la raíz.' },
    },
    required: ['file_id', 'filename'],
  },
};

const ORGANIZE_FILES_TOOL: Anthropic.Tool = {
  name: 'organize_files',
  description: 'Organiza archivos en Google Drive o OneDrive: lista contenido de carpetas, mueve archivos a otra carpeta, renombra archivos/carpetas, crea carpetas nuevas. Úsala cuando el dueño pida reorganizar, ordenar o reacomodar sus archivos en la nube.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'move', 'rename', 'create_folder'],
        description: '"list": lista archivos de una carpeta. "move": mueve un archivo a otra carpeta (se crea si no existe). "rename": cambia el nombre de un archivo o carpeta. "create_folder": crea una carpeta nueva.',
      },
      folder_id:      { type: 'string', description: 'ID de la carpeta a listar (action=list). Omite para listar la raíz.' },
      file_id:        { type: 'string', description: 'ID del archivo/carpeta a mover o renombrar (actions: move, rename).' },
      destination:    { type: 'string', description: 'Nombre de la carpeta destino (action=move). Se crea automáticamente si no existe.' },
      new_name:       { type: 'string', description: 'Nuevo nombre del archivo o carpeta (action=rename).' },
      folder_name:    { type: 'string', description: 'Nombre de la nueva carpeta a crear (action=create_folder).' },
    },
    required: ['action'],
  },
};

const ALL_TOOLS = [
  CREATE_CONTRACT_DRAFT_TOOL,
  SEND_EMAIL_TOOL,
  CREATE_DOCUMENT_TOOL,
  SAVE_TO_DRIVE_TOOL,
  ORGANIZE_FILES_TOOL,
  TRIGGER_CALL_TOOL,
  SEARCH_FILES_TOOL,
  READ_FILE_TOOL,
  SEARCH_LEADS_TOOL,
  READ_URL_TOOL,
];

const SOCIAL_DOMAINS = ['facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com'];

// ── Route ─────────────────────────────────────────────────────────────────────

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;

  // Rate limit per portal token (10 msgs/min)
  const limited = await rateLimit(req, limiters.agentChat, token);
  if (limited) return limited;

  const { messages, agentId } = await req.json() as {
    messages: { role: string; content: string }[];
    agentId?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
  }

  // Payload size guard
  if (messages.length > 50) {
    return NextResponse.json({ error: 'Too many messages' }, { status: 400 });
  }
  const totalChars = messages.reduce((sum, m) => sum + String(m.content ?? '').length, 0);
  if (totalChars > 100_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: accountAgent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  if (!accountAgent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  // IDOR guard: session must belong to the same account as the URL token
  if (accountAgent.portal_email && auth.portalEmail && accountAgent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetQuery = agentId
    ? supabase.from('voice_agents').select('*').eq('id', agentId).eq('portal_email', accountAgent.portal_email).single()
    : supabase.from('voice_agents').select('*').eq('portal_token', token).single();
  const { data: agent } = await targetQuery;
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const agentName = (agent.agent_name as string | null)?.trim() || 'Centinelia';
  const agentRole = (agent.role as string | null)?.trim() || null;

  const sections: string[] = [];

  sections.push([
    '# Identidad',
    `Nombre: ${agentName}`,
    `Negocio: ${agent.business_name}`,
    agentRole ? `Rol: ${agentRole}` : '',
    (agent.business_description as string | null) ? `Descripción: ${agent.business_description}` : '',
  ].filter(Boolean).join('\n'));

  if ((agent.knowledge_base as string | null)?.trim()) {
    sections.push(`# Base de conocimiento del negocio\n${agent.knowledge_base}`);
  }
  if ((agent.role_knowledge_base as string | null)?.trim()) {
    sections.push(`# Instrucciones del rol${agentRole ? ` — ${agentRole}` : ''}\n${agent.role_knowledge_base}`);
  }
  if ((agent.role_learnings as string | null)?.trim()) {
    sections.push(`# Aprendizajes del agente\n${agent.role_learnings}`);
  }

  const { data: calls } = await supabase
    .from('voice_calls')
    .select('caller_number, duration_seconds, summary, outcome, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (calls?.length) {
    const lines = calls.map(c => {
      const date = new Date(c.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      const mins = Math.round(((c.duration_seconds as number) || 0) / 60);
      return `- ${date} | ${(c.caller_number as string) || 'Desconocido'} | ${mins}min | ${(c.outcome as string) || 'otro'} | ${(c.summary as string) || 'Sin resumen'}`;
    });
    sections.push(`# Llamadas recientes (últimas 20)\n${lines.join('\n')}`);
  }

  const { data: inbox } = await supabase
    .from('ops_inbox')
    .select('id, email_from, email_subject, category, ai_summary, status, attachments, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (inbox?.length) {
    const lines = inbox.map(i => {
      const date = new Date(i.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      const atts = (i.attachments as { name: string; url: string }[] | null) ?? [];
      const attStr = atts.length
        ? ` | Adjuntos: ${atts.map(a => `${a.name} → ${a.url}`).join(', ')}`
        : '';
      return `- [ID:${i.id}] ${date} | ${(i.category as string) || 'general'} | De: ${i.email_from} | ${i.email_subject} | [${i.status}] ${(i.ai_summary as string) || ''}${attStr}`;
    });
    sections.push(`# Bandeja de entrada (últimos 10)\n${lines.join('\n')}\n\nCuando menciones un adjunto, incluye la URL exacta para que el dueño pueda descargarlo.`);
  }

  const { data: meetings } = await supabase
    .from('ops_meetings')
    .select('title, participants, status, scheduled_at, summary, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (meetings?.length) {
    const lines = meetings.map(m => {
      const dateStr = (m.scheduled_at as string) || (m.created_at as string);
      const date = new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      const parts = Array.isArray(m.participants) ? (m.participants as string[]).join(', ') : '';
      return `- ${date} | ${(m.title as string) || 'Sin título'} | [${m.status}] | ${parts} | ${(m as any).summary || ''}`;
    });
    sections.push(`# Juntas recientes\n${lines.join('\n')}`);
  }

  const { data: contracts } = await supabase
    .from('ops_contracts')
    .select('name, contract_type, counterparty, expiry_date, status, notes')
    .eq('agent_id', agent.id)
    .order('expiry_date', { ascending: true })
    .limit(10);

  if (contracts?.length) {
    const lines = contracts.map(c => {
      const exp = (c.expiry_date as string)
        ? new Date(c.expiry_date as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Sin vencimiento';
      return `- ${c.name} | ${(c.contract_type as string) || 'contrato'} | ${(c.counterparty as string) || ''} | vence: ${exp} | [${c.status}] | ${(c.notes as string) || ''}`;
    });
    sections.push(`# Contratos\n${lines.join('\n')}`);
  }

  if ((agent.notion_access_token as string | null) && (agent.notion_db_id as string | null)) {
    try {
      const notion = notionClient(agent.notion_access_token as string);
      const { results } = await (notion.databases as any).query({
        database_id: agent.notion_db_id as string,
        page_size:   20,
        sorts:       [{ timestamp: 'last_edited_time', direction: 'descending' }],
      });
      if (results.length) {
        const lines = (results as any[]).map(page => {
          const p       = page.properties;
          const nombre  = p['Nombre']?.title?.[0]?.plain_text  ?? 'Sin nombre';
          const tipo    = p['Tipo']?.select?.name               ?? '';
          const fecha   = p['Fecha']?.date?.start               ?? '';
          const estado  = p['Estado']?.select?.name             ?? '';
          const resumen = p['Resumen']?.rich_text?.[0]?.plain_text ?? '';
          return `- ${fecha} | ${nombre} | ${tipo} | ${estado} | ${resumen}`;
        });
        sections.push(`# CRM Notion\n${lines.join('\n')}`);
      }
    } catch { /* Notion unavailable */ }
  }

  const context = sections.join('\n\n');

  const system = `Eres ${agentName}, el agente IA de ${agent.business_name}${agentRole ? ` con el rol de ${agentRole}` : ''}.

El dueño del negocio te está consultando directamente. Tienes acceso completo a tu operación: base de conocimiento, llamadas recientes, bandeja de entrada, juntas, contratos y CRM.

Responde como un agente inteligente que conoce profundamente el negocio. Usa los datos disponibles para dar respuestas precisas y concretas. Cita fechas y nombres cuando los tengas. Si la información no está en tu contexto, dilo con claridad.

Herramientas disponibles:
- create_contract_draft: cuando el dueño pida generar un contrato para un cliente.
- send_email: cuando el dueño pida enviar un correo. Si menciona adjuntar un archivo de Drive/OneDrive, usa attachment_file_id del resultado de search_files.
- create_document: cuando el dueño pida generar un documento. Usa template_type="proposal" para propuestas/cotizaciones (incluye cliente y precio), "letter" para cartas formales, "general" para todo lo demás. El PDF lleva automáticamente el logo y colores del negocio.
- save_to_drive: después de create_document, si el dueño quiere guardar el PDF en su Google Drive o OneDrive. Puedes sugerirlo proactivamente. Usa el file_id que devolvió create_document. Si da un folder_name, la carpeta se crea automáticamente si no existe.
- organize_files: para reorganizar Drive/OneDrive del dueño. Acciones: "list" (listar carpeta), "move" (mover archivo a otra carpeta, se crea si no existe), "rename" (renombrar archivo o carpeta), "create_folder" (crear carpeta nueva). Cuando el dueño pida ordenar archivos, empieza listando la raíz para ver qué hay, luego mueve o renombra según sus instrucciones. Cada acción consume ops.
- trigger_outbound_call: cuando el dueño pida llamar a un número de teléfono.
- search_files: cuando el dueño pida buscar un archivo en Google Drive o OneDrive.
- read_file: cuando el dueño quiera ver el contenido de un archivo de Drive o OneDrive (usar después de search_files).
- search_leads: para cualquier investigación en internet. Usa research_type para aplicar la estrategia correcta: "leads" para prospectos (rastrea todos los canales), "competidores", "mercado", "regulaciones", "noticias", "general". Cada tipo tiene sus propias queries especializadas.
- read_url: úsala SIEMPRE después de search_leads para leer el contenido de los 2-3 resultados más prometedores. Así obtienes datos reales (contacto, precios, servicios) en lugar de solo títulos. No la uses en redes sociales (Facebook, LinkedIn, X, Instagram) que bloquean scrapers — para esas, usa el título y descripción del resultado de búsqueda.

Cuando el dueño pida investigación: llama search_leads, luego read_url en 2-3 URLs relevantes, luego presenta un resumen completo y estructurado con lo que encontraste.

Usa las herramientas de inmediato cuando el dueño te lo pida, sin pedir confirmación adicional.

Responde en español mexicano. Sé directo — 2 a 5 oraciones a menos que se pida más detalle.

## Contexto operativo

${context}`;

  // 3 ops per initial Sonnet call
  const opsResult = await consumeAiOp(agent.id as string, 3);
  if (!opsResult.ok) {
    return NextResponse.json({ error: 'ops_limit_reached', used: opsResult.used, limit: opsResult.limit }, { status: 429 });
  }

  // Append low-ops alert to system prompt when running critically low
  const opsRemain = Math.max(0, opsResult.limit - opsResult.used);
  const opsLow    = opsResult.limit > 0 && opsRemain <= Math.max(20, opsResult.limit * 0.15);
  const systemWithAlert = opsLow
    ? system + `\n\nAVISO INTERNO DE USO: Quedan solo ${opsRemain} ops disponibles este mes (de ${opsResult.limit}). AL INICIO DE ESTA RESPUESTA, antes de atender lo que pida el dueño, menciona brevemente en una sola frase que las ops están casi agotadas y que puede comprar más desde Cuenta → Minutos y uso. Luego responde normalmente.`
    : system;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  type AssistantBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (text: string) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));

      try {
        let conversationMessages: Anthropic.MessageParam[] = (
          messages as { role: 'user' | 'assistant'; content: string }[]
        ).slice(-20);

        let readUrlCount = 0;
        let callCount    = 0;
        const MAX_CALLS  = 6;

        while (callCount < MAX_CALLS) {
          // Charge 2 ops for every call after the first (first was charged above)
          if (callCount > 0) {
            consumeAiOp(agent.id as string, 2).catch(() => {});
          }
          callCount++;

          const stream = client.messages.stream({
            model:      'claude-sonnet-4-6',
            max_tokens: 2048,
            system:     callCount === 1 ? systemWithAlert : system,
            tools:      ALL_TOOLS,
            messages:   conversationMessages,
          });

          const assistantBlocks: AssistantBlock[] = [];
          let toolInputBuffer  = '';
          let pendingToolId:   string | null = null;
          let pendingToolName: string | null = null;
          let didToolUse = false;

          for await (const chunk of stream) {
            if (chunk.type === 'content_block_start') {
              if (chunk.content_block.type === 'text') {
                assistantBlocks.push({ type: 'text', text: '' });
              } else if (chunk.content_block.type === 'tool_use') {
                pendingToolId   = chunk.content_block.id;
                pendingToolName = chunk.content_block.name;
                toolInputBuffer = '';
                assistantBlocks.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
              }
            } else if (chunk.type === 'content_block_delta') {
              if (chunk.delta.type === 'text_delta') {
                send(chunk.delta.text);
                const last = assistantBlocks.at(-1);
                if (last?.type === 'text') last.text += chunk.delta.text;
              } else if (chunk.delta.type === 'input_json_delta') {
                toolInputBuffer += chunk.delta.partial_json;
              }
            } else if (chunk.type === 'content_block_stop' && pendingToolId) {
              try {
                const parsed = JSON.parse(toolInputBuffer) as Record<string, unknown>;
                const last = assistantBlocks.at(-1);
                if (last?.type === 'tool_use') last.input = parsed;
              } catch { /* malformed — keep empty input */ }
            } else if (
              chunk.type === 'message_delta' &&
              chunk.delta.stop_reason === 'tool_use' &&
              pendingToolId
            ) {
              didToolUse = true;
            }
          }

          // No tool use → text was already streamed, we're done
          if (!didToolUse) break;

          const toolInput = (() => {
            try { return JSON.parse(toolInputBuffer) as Record<string, unknown>; }
            catch { return {} as Record<string, unknown>; }
          })();
          const lastBlock = assistantBlocks.at(-1);
          if (lastBlock?.type === 'tool_use') lastBlock.input = toolInput;

          // ── Execute the requested tool ────────────────────────────────────
          let toolResult: unknown;

          if (pendingToolName === 'read_url') {
            const url = toolInput.url as string;
            if (readUrlCount >= 3) {
              toolResult = { ok: false, error: 'Límite de 3 lecturas por investigación alcanzado.' };
            } else if (isPrivateUrl(url)) {
              toolResult = { ok: false, error: 'URL no permitida.' };
            } else if (SOCIAL_DOMAINS.some(d => url.includes(d))) {
              toolResult = { ok: false, error: 'Red social detectada — bloquean scrapers. Usa el título y descripción del resultado de búsqueda en cambio.' };
            } else {
              readUrlCount++;
              const content = await scrapeWebsite(url);
              toolResult = content
                ? { ok: true, url, content, chars: content.length }
                : { ok: false, url, error: 'No se pudo leer este sitio (timeout o acceso bloqueado).' };
            }

          } else if (pendingToolName === 'create_contract_draft') {
            const { data: tpl } = await supabase
              .from('contract_templates').select('clauses').eq('agent_id', agent.id).single();

            const DEFAULT_CLAUSE_IDS = ['partes','objeto','vigencia','contraprestacion','pago','confidencialidad','propiedad','responsabilidad','terminacion','jurisdiccion','aceptacion'];
            type Clause = { id: string; title: string; body: string; required: boolean; enabled: boolean };
            let baseClauses: Clause[] = (tpl?.clauses as Clause[] | null) ?? [];

            if (!baseClauses.length) {
              baseClauses = DEFAULT_CLAUSE_IDS.map(id => ({
                id, title: id.toUpperCase(), body: '', required: ['partes','objeto','vigencia','contraprestacion','jurisdiccion','aceptacion'].includes(id), enabled: true,
              }));
            }

            const overrides = (toolInput.clause_overrides ?? []) as { id: string; enabled?: boolean; body?: string }[];
            const finalClauses = baseClauses.map(c => {
              const ov = overrides.find(o => o.id === c.id);
              if (!ov) return c;
              return {
                ...c,
                ...(ov.enabled !== undefined && !c.required ? { enabled: ov.enabled } : {}),
                ...(ov.body !== undefined ? { body: ov.body } : {}),
              };
            });

            const { data: draft, error: draftError } = await supabase
              .from('contract_drafts')
              .insert({
                agent_id:     agent.id,
                client_name:  (toolInput.client_name  as string | null) ?? null,
                client_email: (toolInput.client_email as string | null) ?? null,
                client_rfc:   (toolInput.client_rfc   as string | null) ?? null,
                client_phone: (toolInput.client_phone as string | null) ?? null,
                clauses:      finalClauses,
                notes:        (toolInput.notes        as string | null) ?? null,
                source_type:  (toolInput.source_type  as string | null) ?? 'llamada',
                source_ref:   (toolInput.source_ref   as string | null) ?? null,
                status:       'borrador',
              })
              .select('id')
              .single();

            toolResult = draftError
              ? { ok: false, error: draftError.message }
              : { ok: true, draft_id: draft!.id, message: `Borrador creado correctamente con ID ${draft!.id}. El dueño puede verlo en la sección Contratos → Borradores de la Oficina.` };

          } else if (pendingToolName === 'send_email') {
            const to           = toolInput.to                    as string;
            const subject      = toolInput.subject               as string;
            const body         = toolInput.body                  as string;
            const cc           = toolInput.cc                    as string | undefined;
            const attFileId    = toolInput.attachment_file_id    as string | undefined;
            const attFileName  = toolInput.attachment_file_name  as string | undefined;
            const attMimeType  = toolInput.attachment_mime_type  as string | undefined;
            const businessName = agent.business_name as string;

            const htmlBody = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
              ${body.split('\n').map(p => p.trim() ? `<p style="margin:0 0 12px">${p}</p>` : '<br>').join('')}
              <p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">— ${businessName}</p>
            </body></html>`;

            const { data: emailInt } = await supabase.from('email_integrations').select('*').eq('agent_id', agent.id).single();
            let attachment: { filename: string; content: Buffer; mimeType: string } | undefined;
            let sent = false;

            if (emailInt) {
              const conn = await getConnector(emailInt as IntegrationRow, supabase);
              if (attFileId) {
                const dl = await conn.files.download(attFileId, attMimeType ?? '');
                if (dl) attachment = { filename: attFileName ?? 'adjunto', content: dl.buffer, mimeType: dl.contentType };
              }
              try {
                await conn.email.send(to, subject, body, attachment);
                if (cc) await conn.email.send(cc, subject, body);
                sent = true;
              } catch { /* fall through to Resend */ }
            }

            if (!sent) {
              const resendAtts = attachment ? [{ filename: attachment.filename, content: attachment.content.toString('base64') }] : undefined;
              const ok = await sendEmail({ to, subject, html: htmlBody, from: `${businessName} <notificaciones@centinelia.mx>`, attachments: resendAtts });
              if (ok && cc) await sendEmail({ to: cc, subject, html: htmlBody, from: `${businessName} <notificaciones@centinelia.mx>` });
              sent = ok;
            }

            const attNote = attachment ? ` con adjunto "${attachment.filename}"` : '';
            toolResult = sent
              ? { ok: true, message: `Correo enviado a ${to}${cc ? ` (CC: ${cc})` : ''}${attNote} con asunto "${subject}".` }
              : { ok: false, error: 'Error al enviar el correo. Verifica la dirección e intenta de nuevo.' };

          } else if (pendingToolName === 'create_document') {
            try {
              const brand        = brandKitFromAgent(agent as Record<string, unknown>);
              const title        = toolInput.title         as string;
              const content      = toolInput.content       as string;
              const templateType = (toolInput.template_type as string | undefined) ?? 'general';
              const slug         = ((toolInput.filename as string | null) ?? title)
                .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
              const filename = `${slug}-${Date.now()}.pdf`;
              const path     = `${agent.id}/${filename}`;

              let pdfElement: React.ReactElement;
              if (templateType === 'proposal') {
                pdfElement = createElement(ProposalPDF, {
                  brand, title, content,
                  clientName:   toolInput.client_name   as string | undefined,
                  clientEmail:  toolInput.client_email  as string | undefined,
                  totalPrice:   toolInput.total_price   as string | undefined,
                  validityDays: toolInput.validity_days as number | undefined,
                });
              } else if (templateType === 'letter') {
                pdfElement = createElement(LetterPDF, {
                  brand, content,
                  recipientName:  toolInput.recipient_name  as string | undefined,
                  recipientEmail: toolInput.recipient_email as string | undefined,
                });
              } else {
                pdfElement = createElement(GenericDocPDF, { brand, title, content });
              }

              const pdfBuffer = await renderToBuffer(pdfElement as any);

              const { error: uploadErr } = await supabase.storage
                .from('agent-documents')
                .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

              if (uploadErr) {
                toolResult = { ok: false, error: `Error al subir el documento: ${uploadErr.message}` };
              } else {
                const { data: signed } = await supabase.storage
                  .from('agent-documents')
                  .createSignedUrl(path, 3600);

                // Persist record so document is accessible for 30 days from Oficina → Documentos
                supabase.from('ops_documents').insert({
                  agent_id:      agent.id,
                  title,
                  filename,
                  storage_path:  path,
                  template_type: templateType,
                  expires_at:    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                }).then(() => {}, () => {});

                toolResult = {
                  ok:        true,
                  url:       signed?.signedUrl ?? null,
                  file_id:   path,
                  filename:  filename,
                  mime_type: 'application/pdf',
                  message:   `Documento "${title}" generado como PDF. URL de descarga (válida 1 hora): ${signed?.signedUrl}. El documento también quedó guardado en Oficina → Documentos por 30 días.`,
                };
              }
            } catch (err) {
              toolResult = { ok: false, error: `Error al generar el documento: ${String(err)}` };
            }

          } else if (pendingToolName === 'trigger_outbound_call') {
            const phone  = toolInput.phone_number as string;
            const name   = (toolInput.contact_name as string | null) ?? undefined;
            const motivo = toolInput.message as string;

            if (!(agent.features as any)?.outbound_calls) {
              toolResult = { ok: false, error: 'Este agente no tiene llamadas salientes habilitadas. Actívalas en la configuración del agente.' };
            } else if (!agent.vapi_agent_id) {
              toolResult = { ok: false, error: 'El agente no está sincronizado con Vapi. Usa el botón Resincronizar en el portal.' };
            } else {
              const callResult = await triggerOutboundCall({
                agent:          agent as any,
                customerNumber: phone,
                customerName:   name,
                motivo,
              });
              toolResult = callResult.ok
                ? { ok: true, callId: callResult.callId, message: `Llamada iniciada a ${phone}${name ? ` (${name})` : ''}. ID de llamada: ${callResult.callId}` }
                : { ok: false, error: callResult.error };
            }

          } else if (pendingToolName === 'save_to_drive') {
            const storagePath = toolInput.file_id    as string;
            const filename    = toolInput.filename   as string;
            const folderName  = (toolInput.folder_name as string | undefined) ?? undefined;

            const { data: driveInt } = await supabase
              .from('email_integrations').select('*').eq('agent_id', agent.id).single();

            if (!driveInt) {
              toolResult = { ok: false, error: 'No tienes Google Drive ni OneDrive conectado. Conecta tu correo desde Ajustes → Correo.' };
            } else {
              const { data: fileBlob, error: dlErr } = await supabase.storage
                .from('agent-documents').download(storagePath);

              if (dlErr || !fileBlob) {
                toolResult = { ok: false, error: 'No se pudo descargar el documento desde almacenamiento. Verifica que fue generado correctamente.' };
              } else {
                const buffer = Buffer.from(await fileBlob.arrayBuffer());
                try {
                  const conn   = await getConnector(driveInt as IntegrationRow, supabase);
                  const result = await conn.files.upload(filename, buffer, 'application/pdf', folderName);
                  if (!result) {
                    toolResult = { ok: false, error: 'Permisos insuficientes en Drive. El dueño debe reconectar su correo desde Integraciones → Correo para otorgar permisos de escritura.' };
                  } else {
                    const provider = driveInt.provider === 'gmail' ? 'Google Drive' : 'OneDrive';
                    toolResult = { ok: true, id: result.id, name: result.name, link: result.link, message: `Documento "${result.name}" guardado en ${provider}${folderName ? ` (carpeta: ${folderName})` : ''}. Ver: ${result.link}` };
                  }
                } catch (err) {
                  toolResult = { ok: false, error: `Error al subir a Drive: ${String(err)}` };
                }
              }
            }

          } else if (pendingToolName === 'organize_files') {
            const { data: orgInt } = await supabase
              .from('email_integrations').select('*').eq('agent_id', agent.id).single();

            if (!orgInt) {
              toolResult = { ok: false, error: 'No tienes Google Drive ni OneDrive conectado. Conecta tu correo desde Integraciones → Correo.' };
            } else {
              const conn   = await getConnector(orgInt as IntegrationRow, supabase);
              const action = toolInput.action as string;
              try {
                if (action === 'list') {
                  const folderId = (toolInput.folder_id as string | undefined) ?? undefined;
                  const items    = await conn.files.list(folderId);
                  if (!items.length) {
                    toolResult = { ok: true, items: [], message: 'La carpeta está vacía.' };
                  } else {
                    const lines = items.map(f => `- ${f.isFolder ? '[carpeta]' : '[archivo]'} ${f.name} (id: ${f.id}${f.isFolder ? '' : `, tipo: ${f.mimeType}`})`).join('\n');
                    toolResult = { ok: true, items, message: `Encontré ${items.length} elemento(s):\n${lines}` };
                  }

                } else if (action === 'move') {
                  const fileId      = toolInput.file_id    as string;
                  const destination = toolInput.destination as string;
                  if (!fileId || !destination) {
                    toolResult = { ok: false, error: 'Se requieren file_id y destination para mover.' };
                  } else {
                    const ok = await conn.files.move(fileId, destination);
                    toolResult = ok
                      ? { ok: true, message: `Archivo movido a la carpeta "${destination}" correctamente.` }
                      : { ok: false, error: 'No se pudo mover el archivo. Verifica que el ID sea correcto y que tengas permisos.' };
                  }

                } else if (action === 'rename') {
                  const fileId  = toolInput.file_id as string;
                  const newName = toolInput.new_name as string;
                  if (!fileId || !newName) {
                    toolResult = { ok: false, error: 'Se requieren file_id y new_name para renombrar.' };
                  } else {
                    const ok = await conn.files.rename(fileId, newName);
                    toolResult = ok
                      ? { ok: true, message: `Elemento renombrado a "${newName}" correctamente.` }
                      : { ok: false, error: 'No se pudo renombrar. Verifica que el ID sea correcto y que tengas permisos.' };
                  }

                } else if (action === 'create_folder') {
                  const folderName = toolInput.folder_name as string;
                  if (!folderName) {
                    toolResult = { ok: false, error: 'Se requiere folder_name para crear una carpeta.' };
                  } else {
                    const result = await conn.files.createFolder(folderName);
                    toolResult = result
                      ? { ok: true, id: result.id, name: result.name, message: `Carpeta "${result.name}" creada correctamente.` }
                      : { ok: false, error: 'No se pudo crear la carpeta.' };
                  }

                } else {
                  toolResult = { ok: false, error: `Acción desconocida: ${action}` };
                }
              } catch (err) {
                toolResult = { ok: false, error: `Error al organizar archivos: ${String(err)}` };
              }
            }

          } else if (pendingToolName === 'search_files' || pendingToolName === 'read_file') {
            const { data: filesInt } = await supabase
              .from('email_integrations').select('*').eq('agent_id', agent.id).single();

            if (!filesInt) {
              toolResult = { ok: false, error: 'No tienes Google Drive ni OneDrive conectado. Conecta tu correo desde Ajustes → Correo.' };
            } else {
              const conn = await getConnector(filesInt as IntegrationRow, supabase);

              if (pendingToolName === 'search_files') {
                const query = toolInput.query as string;
                const files = await conn.files.search(query);
                toolResult = files.length
                  ? { ok: true, files, message: `Encontré ${files.length} archivo(s): ${files.map(f => `${f.name} (id: ${f.id}, tipo: ${f.mimeType})`).join(', ')}` }
                  : { ok: true, files: [], message: `No encontré archivos que coincidan con "${query}".` };

              } else {
                const fileId   = toolInput.file_id  as string;
                const fileName = toolInput.file_name as string;
                const mimeType = (toolInput.mime_type as string | undefined) ?? '';
                if (!fileId || fileId.length > 500 || /[<>"'`\\]/.test(fileId)) {
                  toolResult = { ok: false, error: 'ID de archivo inválido.' };
                } else {
                  const content = await conn.files.read(fileId, mimeType);
                  const preview = content.slice(0, 8000);
                  toolResult = content
                    ? { ok: true, file_name: fileName, content: preview, truncated: content.length > 8000 }
                    : { ok: false, error: `No se pudo leer el archivo "${fileName}". Verifica que sea un documento de texto.` };
                }
              }
            }

          } else if (pendingToolName === 'search_leads') {
            if (!process.env.BRAVE_SEARCH_API_KEY) {
              toolResult = { ok: false, error: 'Búsqueda web no configurada. Agrega BRAVE_SEARCH_API_KEY al entorno.' };
            } else {
              const topic        = toolInput.topic         as string;
              const location     = (toolInput.location     as string | undefined) ?? '';
              const keywords     = (toolInput.keywords     as string[] | undefined) ?? [];
              const researchType = ((toolInput.research_type as string | undefined) ?? 'general') as ResearchType;

              const queries = buildQueries(topic, location, researchType, keywords, {
                name:        agent.business_name as string,
                description: (agent.business_description as string | null) ?? undefined,
              });
              const results = await searchMultiple(queries, 8);

              if (!results.length) {
                toolResult = { ok: true, leads: [], message: `No encontré resultados para "${topic}"${location ? ` en ${location}` : ''}. Intenta con palabras clave diferentes o amplía la zona.` };
              } else {
                const leadsText = results.slice(0, 20).map((r, i) =>
                  `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`
                ).join('\n\n');
                toolResult = {
                  ok:    true,
                  count: results.length,
                  leads: results.slice(0, 20),
                  message: `Encontré ${results.length} resultado(s) para "${topic}"${location ? ` en ${location}` : ''}. Ahora lee los 2-3 más prometedores con read_url para obtener información detallada.\n\n${leadsText}`,
                };
              }
            }

          } else {
            toolResult = { ok: false, error: `Herramienta desconocida: ${pendingToolName}` };
          }

          // Extend conversation with this tool turn
          conversationMessages = [
            ...conversationMessages,
            { role: 'assistant' as const, content: assistantBlocks as Anthropic.ContentBlock[] },
            { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: pendingToolId!, content: JSON.stringify(toolResult) }] },
          ];
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: 'Error generando respuesta' })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
