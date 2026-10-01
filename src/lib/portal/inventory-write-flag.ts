import type Anthropic from '@anthropic-ai/sdk';

// Nombres de las 5 herramientas de escritura del pack de inventario.
// Cuando el feature flag inventory_write_enabled está desactivado,
// estas herramientas se excluyen del prompt para que el modelo
// nunca intente invocarlas (defensa en profundidad).
export const INVENTORY_WRITE_TOOL_NAMES = [
  'inv_agregar_equipo',
  'inv_actualizar_estatus',
  'inv_asignar_cliente',
  'inv_registrar_venta',
  'inv_registrar_salida',
] as const;

const WRITE_SET: ReadonlySet<string> = new Set(INVENTORY_WRITE_TOOL_NAMES);

/**
 * Filtra las herramientas de escritura de inventario según el feature flag.
 *
 * @param tools    - Lista de herramientas a evaluar.
 * @param features - Objeto de features del agente. Acepta null/undefined de forma segura.
 * @returns        - Lista original si flag===true; de lo contrario, sin las 5 writes.
 *
 * Nota: se usa comparación estricta (=== true) para evitar que valores
 * truthy no-booleanos como "yes" o 1 activen el flag accidentalmente.
 */
export function filterWriteToolsByFlag(
  tools:    Anthropic.Tool[],
  features: Record<string, unknown> | null | undefined,
): Anthropic.Tool[] {
  const enabled = features?.inventory_write_enabled === true;
  if (enabled) return tools;
  return tools.filter(t => !WRITE_SET.has(t.name));
}
