/**
 * Helpers compartidos para inyectar el bloque de Tareas en los prompt builders.
 *
 * Usados en:
 * - src/lib/voice/prompt-builder.ts
 * - src/lib/whatsapp/prompt-builder.ts
 *
 * NO usado en outbound-prompt-builder.ts (PAC-4: outbound ya sabe qué hacer).
 */

/**
 * Convierte una expresión cron a texto legible en español (casos comunes).
 * Fallback: devuelve el string cron original.
 *
 * Nota: cron-parser no está en package.json. Implementación cubre los patrones
 * más comunes en el contexto de Centinelia (reportes diarios, semanales, mensuales).
 */
export function humanReadableCron(cronExpr: string): string {
  if (!cronExpr) return cronExpr;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpr;
  const [min, hour, dayOfMonth, , dayOfWeek] = parts;

  const isNumeric = (s: string) => /^\d+$/.test(s);

  // "* * * * *" → "cada minuto"
  if (cronExpr.trim() === '* * * * *') return 'cada minuto';

  // "*/N * * * *" → "cada N minutos"
  if (min.startsWith('*/') && isNumeric(min.slice(2)) && hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
    return `cada ${min.slice(2)} minutos`;
  }

  // Solo interpretar si minuto y hora son numéricos
  if (!isNumeric(min) || !isNumeric(hour)) return cronExpr;

  // "H M * * *" → "todos los días a las H:M"
  if (dayOfMonth === '*' && dayOfWeek === '*') {
    return `todos los días a las ${hour}:${min.padStart(2, '0')}`;
  }

  // "H M * * D" → "lunes/martes/... a las H:M"
  const dayNames: Record<string, string> = {
    '0': 'domingo', '1': 'lunes', '2': 'martes', '3': 'miércoles',
    '4': 'jueves', '5': 'viernes', '6': 'sábado', '7': 'domingo',
  };
  if (dayOfMonth === '*' && dayOfWeek in dayNames) {
    return `${dayNames[dayOfWeek]} a las ${hour}:${min.padStart(2, '0')}`;
  }

  // "H M D * *" → "día D de cada mes a las H:M" (solo si D es numérico)
  if (isNumeric(dayOfMonth) && dayOfWeek === '*') {
    return `día ${dayOfMonth} de cada mes a las ${hour}:${min.padStart(2, '0')}`;
  }

  return cronExpr; // fallback al string cron original
}

/**
 * Describe el trigger de una tarea en lenguaje natural español.
 * Usado para el bloque "## Tareas que puedes ejecutar" en el prompt del meerkat.
 */
export function describeTrigger(type: string, config: Record<string, unknown>): string {
  if (type === 'cron') {
    const cronExpr = typeof config.cron === 'string' ? config.cron : '';
    return humanReadableCron(cronExpr);
  }
  if (type === 'phrase') {
    const phrases = Array.isArray(config.phrases) ? (config.phrases as string[]).join(', ') : '';
    return `frases: ${phrases}`;
  }
  return 'solo manual desde el portal';
}
