/**
 * Límites de caracteres para las bases de conocimiento editables del portal.
 * Un solo lugar para frontend + backend — la validación server-side y las
 * barras de progreso del editor consumen la misma constante.
 *
 * Contexto: cada KB se inyecta en el system prompt de voz. Bajarlos mejora
 * calidad (menos "distraction" del modelo), baja latencia (menos tokens a
 * procesar) y baja costo aunque haya prompt caching (el primer request de
 * cada ventana de cache paga full-rate por lo variable).
 */
export const KB_LIMITS = {
  business: {
    soft: 2_500,  // barra verde
    hard: 4_000,  // barra roja + no guarda si excede
    label: 'base de conocimiento del negocio',
  },
  role: {
    soft: 2_000,
    hard: 3_500,
    label: 'conocimiento del rol',
  },
  outbound: {
    soft: 1_500,
    hard: 2_500,
    label: 'instrucciones de salientes',
  },
} as const;

export type KbLimitKey = keyof typeof KB_LIMITS;

// Mapeo de campo → key de límite. Usado por el endpoint de settings.
export const FIELD_TO_LIMIT: Record<string, KbLimitKey> = {
  knowledge_base:          'business',
  role_knowledge_base:     'role',
  outbound_knowledge_base: 'outbound',
};
