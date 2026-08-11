import { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

// Ventana de dedup: si el mismo agente ya registró un lead con el mismo whatsapp
// o email en los últimos DEDUP_WINDOW_MINUTES, actualizamos ese registro en vez
// de crear otro. Evita el bug donde el modelo re-ejecuta crear_lead tras un "no
// lo veo" del usuario y termina insertando duplicados.
const DEDUP_WINDOW_MINUTES = 10;

export interface LeadInput {
  agentId:     string;
  source:      string;
  nombre?:     string | null;
  negocio?:    string | null;
  giro?:       string | null;
  servicio?:   string | null;
  presupuesto?: string | null;
  timeline?:   string | null;
  email?:      string | null;
  whatsapp?:   string | null;
}

export type LeadUpsertAction = 'created' | 'updated';

export interface LeadUpsertResult {
  id:      string;
  action:  LeadUpsertAction;
}

// Devuelve el id del lead reciente que hace match (mismo agente, mismo whatsapp
// o email, dentro de la ventana). Match es OR entre whatsapp/email — cualquiera
// que coincida basta.
async function findRecentDuplicate(
  supabase: SupabaseClient,
  agentId:  string,
  whatsapp: string | null,
  email:    string | null,
): Promise<string | null> {
  if (!whatsapp && !email) return null;

  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60_000).toISOString();
  const orParts: string[] = [];
  if (whatsapp) orParts.push(`whatsapp.eq.${whatsapp}`);
  if (email)    orParts.push(`email.eq.${email}`);

  const { data } = await supabase
    .from('leads_voice')
    .select('id, created_at')
    .eq('agent_id', agentId)
    .gte('created_at', sinceIso)
    .or(orParts.join(','))
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0]?.id ?? null;
}

// COALESCE en JS: prefiere el valor nuevo si es truthy, si no deja el objeto
// como estaba (lo hace Supabase con undefined omitido).
function pruneNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export async function upsertLeadWithDedup(
  supabase: SupabaseClient,
  input:    LeadInput,
): Promise<LeadUpsertResult> {
  const whatsapp = input.whatsapp?.trim() || null;
  const email    = input.email?.trim() || null;

  const existingId = await findRecentDuplicate(supabase, input.agentId, whatsapp, email);

  if (existingId) {
    const patch = pruneNulls({
      nombre:      input.nombre,
      negocio:     input.negocio,
      giro:        input.giro,
      servicio:    input.servicio,
      presupuesto: input.presupuesto,
      timeline:    input.timeline,
      email,
      whatsapp,
    });
    if (Object.keys(patch).length > 0) {
      await supabase.from('leads_voice').update(patch).eq('id', existingId);
    }
    return { id: existingId, action: 'updated' };
  }

  const { data, error } = await supabase
    .from('leads_voice')
    .insert({
      agent_id:    input.agentId,
      nombre:      input.nombre ?? null,
      negocio:     input.negocio ?? null,
      giro:        input.giro ?? null,
      servicio:    input.servicio ?? null,
      presupuesto: input.presupuesto ?? null,
      timeline:    input.timeline ?? null,
      email,
      whatsapp,
      source:      input.source,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert lead: ${error?.message ?? 'unknown'}`);
  }

  return { id: data.id, action: 'created' };
}

export interface OutboundContactInput {
  agentId:      string;
  nombre?:      string | null;
  telefono:     string;
  motivo?:      string | null;
  scheduledAt?: string | null;
  source?:      string;
  email?:       string | null;
  tags?:        string[] | null;
}

export interface OutboundContactUpsertResult {
  id:      string;
  action:  LeadUpsertAction;
}

// Dedup para outbound_contacts: mismo agente + mismo teléfono en la ventana =
// update. La tabla puede tener el mismo teléfono en múltiples estados a lo largo
// del tiempo (pending → calling → completed), así que sólo dedupeamos contra
// registros recientes con status 'pending' — no queremos revivir un contacto
// completed/failed ni pisar uno que ya está calling.
async function findRecentOutboundDuplicate(
  supabase: SupabaseClient,
  agentId:  string,
  telefono: string,
): Promise<string | null> {
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60_000).toISOString();

  const { data } = await supabase
    .from('outbound_contacts')
    .select('id, created_at')
    .eq('agent_id', agentId)
    .eq('telefono', telefono)
    .eq('status', 'pending')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0]?.id ?? null;
}

// Rechaza phones que en realidad son emails o strings sin dígitos. El cron de
// outbound intenta marcar y falla silencioso si el "número" es "cliente@x.com".
// El modelo a veces mete el email en telefono cuando el cliente sólo dio uno de
// los dos — mejor rechazar temprano y forzar retry con datos correctos.
function validatePhoneOrThrow(telefono: string, email?: string | null): string {
  const t = telefono.trim();
  if (t.length === 0) {
    throw new Error('outbound_contact_invalid_phone: telefono vacío. Sin número no se puede marcar. Si sólo tienes email, guarda como lead (crear_lead) en vez de contacto saliente.');
  }
  if (/@/.test(t)) {
    const suggestion = email ? '' : ` El valor "${t}" parece ser email — pásalo en el campo email y consigue un teléfono real, o usa crear_lead si no hay número disponible.`;
    throw new Error(`outbound_contact_invalid_phone: telefono contiene "@" (parece email, no número).${suggestion}`);
  }
  const digitCount = (t.match(/\d/g) ?? []).length;
  if (digitCount < 7) {
    throw new Error(`outbound_contact_invalid_phone: telefono "${t}" tiene menos de 7 dígitos, no es un número marcable. Consigue el número completo con lada o usa crear_lead.`);
  }
  return t;
}

// Verifica que el agente tenga capability outbound_calls. Si no, intenta
// re-routear al peer con outbound_calls activo (típicamente el vendedor Noah).
// El pending contact debe vivir bajo el agente que va a marcarlo; asignarlo a
// Sofía (recepcionista) rompe el flow: la cron no la marca porque no tiene
// outbound habilitado y el usuario ve pendings zombie en /campanas.
async function ensureOutboundAgent(supabase: SupabaseClient, requestedAgentId: string): Promise<string> {
  const { data: reqAgent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, features')
    .eq('id', requestedAgentId)
    .maybeSingle();
  if (!reqAgent) return requestedAgentId; // agente no existe: dejamos que el insert falle con FK
  const hasOutbound = !!((reqAgent.features as Record<string, unknown> | null)?.outbound_calls);
  if (hasOutbound) return requestedAgentId;

  const portalEmail = reqAgent.portal_email as string | null;
  if (!portalEmail) {
    throw new Error(`outbound_contact_no_outbound_agent: el agente que llamó no tiene outbound_calls habilitado y no se pudo buscar peer. Activa outbound en Configurar > empleado.`);
  }
  const { data: peers } = await supabase
    .from('voice_agents')
    .select('id, agent_name, features')
    .eq('portal_email', portalEmail)
    .eq('active', true);
  const outboundPeer = (peers ?? []).find(p => !!((p.features as Record<string, unknown> | null)?.outbound_calls));
  if (!outboundPeer) {
    throw new Error(`outbound_contact_no_outbound_agent: ningún empleado de la organización tiene outbound_calls activo. Activa outbound en Configurar > empleado > Llamadas salientes antes de registrar contactos para llamar.`);
  }
  return outboundPeer.id as string;
}

export async function upsertOutboundContactWithDedup(
  supabase: SupabaseClient,
  input:    OutboundContactInput,
): Promise<OutboundContactUpsertResult> {
  const normalizedPhone = validatePhoneOrThrow(input.telefono, input.email ?? null);
  const targetAgentId   = await ensureOutboundAgent(supabase, input.agentId);
  input = { ...input, telefono: normalizedPhone, agentId: targetAgentId };

  const existingId = await findRecentOutboundDuplicate(supabase, input.agentId, input.telefono);

  if (existingId) {
    const patch = pruneNulls({
      nombre:       input.nombre,
      motivo:       input.motivo,
      scheduled_at: input.scheduledAt,
      email:        input.email,
      tags:         input.tags,
    });
    if (Object.keys(patch).length > 0) {
      await supabase.from('outbound_contacts').update(patch).eq('id', existingId);
    }
    return { id: existingId, action: 'updated' };
  }

  // scheduled_at es NOT NULL en outbound_contacts (sin default). Si el agente
  // no dio fecha, usamos "ahora" — el cron de outbound-campaigns respeta el
  // status 'pending' así que no dispara la llamada de inmediato.
  // tags es NOT NULL con default '{}'; omitimos del payload cuando es null.
  const insertPayload: Record<string, unknown> = {
    agent_id:     input.agentId,
    nombre:       input.nombre ?? null,
    telefono:     input.telefono,
    motivo:       input.motivo ?? null,
    scheduled_at: input.scheduledAt ?? new Date().toISOString(),
    status:       'pending',
    source:       input.source ?? 'manual',
    email:        input.email ?? null,
  };
  if (input.tags && input.tags.length > 0) insertPayload.tags = input.tags;

  const { data, error } = await supabase
    .from('outbound_contacts')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert outbound_contact: ${error?.message ?? 'unknown'}`);
  }

  return { id: data.id, action: 'created' };
}
