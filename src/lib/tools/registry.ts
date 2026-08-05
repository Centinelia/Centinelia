/**
 * H2 — Registry único de tools para admin discoverability.
 *
 * Fuente derivada estáticamente: enumeramos las tools conocidas del executor
 * y las anotamos con capability (policies) + policy (retry/timeout). Los canales
 * donde vive cada tool se declaran aquí porque la fuente real está esparcida
 * entre buildTools() (voz), ALL_TOOLS (chat) y BASE_EMAIL_TOOLS (email).
 *
 * Regla: cuando agregues un tool nuevo al executor, añádelo también aquí para
 * que aparezca en /admin/tools.
 */
import { TOOL_CAPABILITIES } from '@/lib/policies/engine';
import { policyFor, DEFAULT_POLICY, type ToolPolicy } from './policies';

export type Channel = 'voice' | 'chat' | 'email';

export interface ToolEntry {
  name:         string;
  description:  string;
  channels:     Channel[];
  category:     string;
  capability:   string | null;
  policy:       ToolPolicy;
  destructive:  boolean;
  gatedByRole:  string[] | null;   // meerkats donde vive (null = todos)
  gatedByFeature: string | null;   // feature flag
}

const A: Channel[] = ['voice', 'chat', 'email'];

export const TOOL_REGISTRY: ToolEntry[] = [
  // read/search
  { name: 'read_url',                 description: 'Lee el contenido de una URL pública',                  channels: A, category: 'web',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('read_url') },
  { name: 'buscar_en_web',            description: 'Búsqueda web general (Brave Search)',                   channels: A, category: 'web',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('buscar_en_web') },
  { name: 'search_leads',             description: 'Búsqueda estructurada de leads/empresas',               channels: A, category: 'web',       destructive: false, gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: policyFor('search_leads') },
  { name: 'search_files',             description: 'Busca archivos en Drive del negocio',                   channels: A, category: 'drive',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: 'files', policy: policyFor('search_files') },
  { name: 'read_file',                description: 'Lee contenido de archivo del Drive',                    channels: A, category: 'drive',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: 'files', policy: policyFor('read_file') },

  // destructive
  { name: 'send_email',               description: 'Envía correo directo (verifier antes de send)',         channels: A, category: 'comms',     destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: 'email', policy: policyFor('send_email') },
  { name: 'trigger_outbound_call',    description: 'Dispara llamada saliente (verifier antes)',             channels: A, category: 'comms',     destructive: true,  gatedByRole: null, gatedByFeature: 'outbound_calls', capability: 'phone', policy: policyFor('trigger_outbound_call') },

  // documents
  { name: 'create_document',          description: 'Genera PDF (factura, orden, cotización, general)',      channels: A, category: 'docs',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('create_document') },
  { name: 'create_file',              description: 'Genera archivo Excel/Word/PowerPoint',                  channels: A, category: 'docs',      destructive: false, gatedByRole: ['nox','niva'], gatedByFeature: null, capability: null, policy: policyFor('create_file') },
  { name: 'create_contract_draft',    description: 'Crea borrador de contrato',                             channels: A, category: 'docs',      destructive: true,  gatedByRole: ['nox'], gatedByFeature: 'contract_drafts', capability: null, policy: policyFor('create_contract_draft') },

  // drive
  { name: 'save_to_drive',            description: 'Sube archivo local al Drive del negocio',               channels: A, category: 'drive',     destructive: false, gatedByRole: ['nox','niva'], gatedByFeature: null, capability: 'files', policy: policyFor('save_to_drive') },
  { name: 'organize_files',           description: 'Renombra, mueve o crea carpetas en Drive',              channels: A, category: 'drive',     destructive: true,  gatedByRole: ['nox'], gatedByFeature: null,   capability: 'files', policy: policyFor('organize_files') },

  // calendar
  { name: 'list_calendar_events',     description: 'Lista eventos del calendario',                          channels: A, category: 'calendar',  destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('list_calendar_events') },
  { name: 'create_calendar_event',    description: 'Crea evento en calendario',                             channels: A, category: 'calendar',  destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('create_calendar_event') },
  { name: 'delete_calendar_event',    description: 'Elimina evento del calendario',                         channels: A, category: 'calendar',  destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('delete_calendar_event') },

  // civic
  { name: 'create_civic_report',      description: 'Reporte cívico municipal',                              channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('create_civic_report') },
  { name: 'lookup_civic_report',      description: 'Consulta reporte cívico por folio',                     channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('lookup_civic_report') },
  { name: 'update_civic_report',      description: 'Actualiza estado de reporte cívico',                    channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('update_civic_report') },

  // QB
  { name: 'qb_consultar_facturas',    description: 'Consulta facturas en QuickBooks',                       channels: A, category: 'quickbooks', destructive: false, gatedByRole: null, gatedByFeature: null,     capability: null, policy: policyFor('qb_consultar_facturas') },
  { name: 'qb_buscar_cliente',        description: 'Busca cliente en QuickBooks',                           channels: A, category: 'quickbooks', destructive: false, gatedByRole: null, gatedByFeature: null,     capability: null, policy: policyFor('qb_buscar_cliente') },
  { name: 'qb_crear_factura',         description: 'Crea factura en QuickBooks (destructiva, 1 op)',        channels: A, category: 'quickbooks', destructive: true,  gatedByRole: null, gatedByFeature: null,     capability: null, policy: policyFor('qb_crear_factura') },

  // fiscal
  { name: 'solicitar_factura',        description: 'Registra solicitud de CFDI al equipo humano',           channels: A, category: 'fiscal',    destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('solicitar_factura') },
  { name: 'consultar_factura',        description: 'Consulta estado de solicitud de CFDI',                  channels: A, category: 'fiscal',    destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('consultar_factura') },

  // productos / ML
  { name: 'buscar_producto',          description: 'Busca producto en catálogo Notion',                     channels: A, category: 'catalog',   destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('buscar_producto') },
  { name: 'analizar_publicaciones_ml',description: 'Lista publicaciones Mercado Libre (solo chat)',         channels: ['chat'], category: 'mercadolibre', destructive: false, gatedByRole: ['niva'], gatedByFeature: null, capability: null, policy: policyFor('analizar_publicaciones_ml') },
  { name: 'ver_metricas_ml',          description: 'Métricas Mercado Libre (solo chat)',                    channels: ['chat'], category: 'mercadolibre', destructive: false, gatedByRole: ['niva'], gatedByFeature: null, capability: null, policy: policyFor('ver_metricas_ml') },

  // meta
  { name: 'delegate_task',            description: 'Delega tarea a otro empleado (loop on evidence)',       channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('delegate_task') },
  { name: 'consult_agent',            description: 'Consulta síncrona a otro empleado',                     channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('consult_agent') },
  { name: 'reportar_falla',           description: 'Reporta bug al equipo Centinelia',                      channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // brand / voc
  { name: 'extraer_tono_de_marca',    description: 'Extrae guía de tono desde muestras',                    channels: A, category: 'brand',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'extraer_voz_del_cliente',  description: 'VoC desde llamadas/correos/tickets',                    channels: A, category: 'brand',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // sheets
  { name: 'sheets_agregar_fila',      description: 'Agrega fila al Google Sheet configurado para el propósito',    channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.write', policy: policyFor('sheets_agregar_fila') },
  { name: 'sheets_actualizar_fila',   description: 'Actualiza fila existente en el Google Sheet',                  channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.write', policy: policyFor('sheets_actualizar_fila') },
  { name: 'sheets_leer',              description: 'Lee el contenido del Google Sheet configurado',                 channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.read',  policy: policyFor('sheets_leer') },
  { name: 'sheets_buscar',            description: 'Busca filas en el Google Sheet que contengan un texto',        channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.read',  policy: policyFor('sheets_buscar') },
];

export function getToolByName(name: string): ToolEntry | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}

/** Sanity check contra el mapa TOOL_CAPABILITIES para detectar drift. */
export function auditRegistry(): { missing: string[]; extra: string[] } {
  const registryCaps = new Map(TOOL_REGISTRY.map(t => [t.name, t.capability]));
  const missing: string[] = [];
  const extra:   string[] = [];
  for (const [name, cap] of Object.entries(TOOL_CAPABILITIES)) {
    const r = registryCaps.get(name);
    if (r === undefined) missing.push(name);
    else if (r !== cap) extra.push(`${name}: cap='${r}' vs policies='${cap}'`);
  }
  return { missing, extra };
}
