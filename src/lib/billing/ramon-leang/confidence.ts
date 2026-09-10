/**
 * confidence.ts — evalúa si un bloque semanal Ramón Leang puede auto-aprobarse
 * o requiere revisión de Beatriz PV.
 *
 * Checks (todos deben pasar para auto-approve):
 *   1. Total depósitos declarado + monto CFDI base + monto ajuste presentes.
 *   2. Suma de facturas (base × N + ajuste) cuadra con total (diff ≤ $1).
 *   3. Días hábiles no vacío y todos dentro de rango 1-31.
 *   4. Sin duplicados en días hábiles.
 *   5. Fecha de ajuste (si existe) no duplica un día hábil.
 *   6. Sin warnings del parser.
 */

import type { ParsedWeekBlock } from '../parsers/ramon-leang-weekly';

export interface ConfidenceCheckInputRL {
  block: ParsedWeekBlock;
}

export interface ConfidenceResultRL {
  autoApprove: boolean;
  reasons:     string[];
}

export function checkConfidence(input: ConfidenceCheckInputRL): ConfidenceResultRL {
  const reasons: string[] = [];
  const b = input.block;

  // 1) Datos mínimos
  if (b.cfdiBase == null || b.cfdiBase <= 0) {
    reasons.push('Falta el monto de las facturas base en tu Excel (celda debajo de los días hábiles). Verifica la columna de facturas.');
  }
  if (b.totalDepositos == null) {
    reasons.push('No encontré el total de depósitos al pie del bloque. Asegúrate de que la suma esté visible.');
  }

  // 2) Suma cuadra
  if (b.cfdiBase != null && b.totalDepositos != null) {
    const sumaEsperada = b.cfdiBase * b.diasHabiles.length + (b.ajusteMonto ?? 0);
    const diff = Math.abs(sumaEsperada - b.totalDepositos);
    if (diff > 1) {
      reasons.push(
        `La suma de facturas ($${sumaEsperada.toFixed(2)}) no cuadra con el total de depósitos ($${b.totalDepositos.toFixed(2)}). Diferencia: $${diff.toFixed(2)}.`,
      );
    }
  }

  // 3) Días hábiles válidos
  if (b.diasHabiles.length === 0) {
    reasons.push('No encontré los días hábiles listados en tu Excel (celda al lado del primer depósito).');
  } else {
    const invalidos = b.diasHabiles.filter(d => d < 1 || d > 31);
    if (invalidos.length > 0) {
      reasons.push(`Días hábiles fuera de rango 1-31: ${invalidos.join(', ')}. Revísalos en tu Excel.`);
    }
  }

  // 4) Sin duplicados en días hábiles
  const setDias = new Set(b.diasHabiles);
  if (setDias.size !== b.diasHabiles.length) {
    reasons.push('Hay días hábiles repetidos en tu lista. Cada día debe aparecer una sola vez.');
  }

  // 5) Fecha ajuste no duplica día hábil
  if (b.ajusteFecha) {
    const diaAjuste = parseInt(b.ajusteFecha.slice(8, 10), 10);
    if (setDias.has(diaAjuste)) {
      reasons.push(
        `El día de la factura de ajuste (${diaAjuste}) también está en los días hábiles. Se emitirían 2 facturas para el mismo día.`,
      );
    }
  }

  // 6) Warnings del parser
  if (b.warnings.length > 0) {
    if (b.warnings.length === 1) {
      reasons.push(`Nala reportó: ${b.warnings[0]}`);
    } else {
      const bullets = b.warnings.map(w => `• ${w}`).join('\n');
      reasons.push(`Nala reportó ${b.warnings.length} cosas para revisar:\n${bullets}`);
    }
  }

  return { autoApprove: reasons.length === 0, reasons };
}
