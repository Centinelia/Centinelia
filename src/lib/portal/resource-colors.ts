// Paleta oficial para diferenciar recursos consumidos por los meerkats.
// Regla dura Nazre 2026-08-09 (ver memoria feedback-colores-minutos-tareas):
//
//   - Minutos / llamadas / voz  → cyan
//   - Tareas / correo / chat / documento / cualquier op → verde
//   - Combinada / neutro / identidad de marca → morado
//
// Cada recurso expone:
//   - saturated: color base saturado — úsalo para bg/border con opacidad (`${c}22`, `${c}55`)
//   - light:     variante clara para TEXTO — cumple contraste AA/AAA sobre bg dark
//   - bg:        alpha bg listo para pills
//   - border:    alpha border listo para pills
//   - icon:      color del ícono (Lucide) — usar el light para máxima legibilidad
//
// Fuente única de la paleta. Cualquier sitio nuevo debe importar de aquí en vez
// de hardcodear los hex; los sitios viejos con `#6C3BFF` sobre bg dark cerca de
// un contador de "minutos" o "tareas" están en deuda y hay que migrarlos.

export const RESOURCE_COLORS = {
  minutes: {
    saturated: '#0E7490',
    light:     '#67E8F9',
    mid:       '#22D3EE',
    bg:        'rgba(6,182,212,0.10)',
    border:    'rgba(6,182,212,0.30)',
  },
  tasks: {
    saturated: '#10B981',
    light:     '#6EE7B7',
    mid:       '#34D399',
    bg:        'rgba(16,185,129,0.10)',
    border:    'rgba(16,185,129,0.30)',
  },
  combined: {
    saturated: '#6C3BFF',
    light:     '#C4A8FF',
    mid:       '#9B6DFF',
    bg:        'rgba(108,59,255,0.10)',
    border:    'rgba(108,59,255,0.30)',
  },
} as const;

export type ResourceKind = keyof typeof RESOURCE_COLORS;

// Alias legibles para uso rápido
export const MINUTES = RESOURCE_COLORS.minutes;
export const TASKS   = RESOURCE_COLORS.tasks;
export const COMBINED = RESOURCE_COLORS.combined;
