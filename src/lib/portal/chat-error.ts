// Mensajes de error del FAB de chat, extraídos a función pura para test
// unitario. Centraliza la clasificación de respuestas 4xx/5xx del endpoint
// /api/portal/[token]/agent-chat.
//
// Precedente: 2026-09-30 sesión AC Proyectos. Camila intentó chatear con
// Nami y vio "Ocurrió un error. Intenta de nuevo." aunque la causa real era
// que el pool de ops estaba en 0 (provisioning no sembró ledger). El FAB
// no diferenciaba 429 ops_limit_reached del genérico → debug lento.

export interface AgentChatErrorBody {
  error?: string;
  used?:  number;
  limit?: number;
}

export function formatAgentChatError(body: AgentChatErrorBody | null): string {
  if (body?.error === 'ops_limit_reached') {
    const hasCounts = typeof body.used === 'number' && typeof body.limit === 'number';
    const counts    = hasCounts ? ` (${body.used}/${body.limit})` : '';
    return `Se acabaron las tareas de este mes${counts}. Contacta a Centinelia para agregar más.`;
  }
  return 'Ocurrió un error. Intenta de nuevo.';
}
