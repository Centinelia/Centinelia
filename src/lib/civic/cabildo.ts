import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface CabildoTemplate {
  punto_acuerdo: string;
  acta_sesion:   string;
  municipio:     string;
}

export const DEFAULT_PUNTO_ACUERDO = `{municipio}
PUNTO DE ACUERDO

Sesión {tipo_sesion} No. {numero_sesion} — {fecha}

ASUNTO: {proposicion}

ANTECEDENTES Y CONSIDERANDOS:
{considerandos}

EL H. AYUNTAMIENTO EN PLENO, ACUERDA:
{resolutivos}

VOTACIÓN: {votos_favor} a favor · {votos_contra} en contra · {abstenciones} abstenciones

______________________________       ______________________________
Presidente Municipal                        Secretario del Ayuntamiento`;

export const DEFAULT_ACTA_SESION = `{municipio}
ACTA DE SESIÓN {tipo_sesion} No. {numero_sesion}

Fecha: {fecha}
Lugar: {lugar}

LISTA DE ASISTENCIA:
{asistencia}

ORDEN DEL DÍA:
{orden_del_dia}

ACUERDOS TOMADOS:
{acuerdos}

______________________________       ______________________________
Presidente Municipal                        Secretario del Ayuntamiento`;

export const DEFAULT_CABILDO_TEMPLATE: CabildoTemplate = {
  punto_acuerdo: DEFAULT_PUNTO_ACUERDO,
  acta_sesion:   DEFAULT_ACTA_SESION,
  municipio:     'Municipio',
};

export async function getCabildoTemplate(agentId: string, supabase: SupabaseClient): Promise<CabildoTemplate> {
  const { data } = await supabase
    .from('voice_agents').select('cabildo_template').eq('id', agentId).single();
  const raw = (data as any)?.cabildo_template as Partial<CabildoTemplate> | null;
  if (!raw) return DEFAULT_CABILDO_TEMPLATE;
  return {
    punto_acuerdo: raw.punto_acuerdo ?? DEFAULT_CABILDO_TEMPLATE.punto_acuerdo,
    acta_sesion:   raw.acta_sesion   ?? DEFAULT_CABILDO_TEMPLATE.acta_sesion,
    municipio:     raw.municipio     ?? DEFAULT_CABILDO_TEMPLATE.municipio,
  };
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function getNextDocNumber(agentId: string, tipo: string, supabase: SupabaseClient): Promise<string> {
  const yearStart = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
  const { count } = await supabase
    .from('cabildo_documents')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('tipo', tipo)
    .gte('created_at', yearStart);

  const prefix = tipo === 'punto_acuerdo' ? 'PA' : tipo === 'acta_sesion' ? 'ACTA' : 'DOC';
  const year   = new Date().getFullYear();
  const seq    = ((count ?? 0) + 1).toString().padStart(3, '0');
  return `${prefix}-${year}-${seq}`;
}
