// Constantes del pipeline de callback de landing.
// El agente demo "Nia Landing" es una fila especial en voice_agents,
// aislada de los clientes reales via portal_email dedicado.

/** UUID del VoiceAgent "Nia Landing Demo" en voice_agents. */
export const LANDING_DEMO_AGENT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * portal_email del agente demo — usado como "org" de aislamiento.
 * No aparece en admin/clientes ni en el pool de minutos de clientes reales.
 */
export const LANDING_DEMO_PORTAL_EMAIL = 'landing-demo@centinelia.mx';

/**
 * Industria del prospect capturada en el form del demo.
 * Placeholder mientras migramos a contexto dinámico (org_name + description +
 * expectation) en Commit 2 del demo dinamizado 2026-09-21. Nazre.
 */
export type IndustryKey =
  | 'tortilleria_abarrotes'
  | 'construccion'
  | 'despacho_contable'
  | 'servicios_profesionales'
  | 'otro';
