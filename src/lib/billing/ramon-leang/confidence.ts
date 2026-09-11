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
import { dayOfMonthToIsoDate } from './pipeline';

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

  // 2) Suma cuadra. Aritmética fixed-point en centavos para evitar drift IEEE-754
  // (cfdiBase * N + ajuste puede acumular error de fracción de centavo que
  // hace fallar el chequeo diff > 1 falsamente).
  if (b.cfdiBase != null && b.totalDepositos != null) {
    const centsBase   = Math.round(b.cfdiBase * 100) * b.diasHabiles.length;
    const centsAjuste = Math.round((b.ajusteMonto ?? 0) * 100);
    const centsTotal  = Math.round(b.totalDepositos * 100);
    const diffCents   = Math.abs(centsBase + centsAjuste - centsTotal);
    if (diffCents > 100) {
      const sumaEsperada = (centsBase + centsAjuste) / 100;
      const diff = diffCents / 100;
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

  // 5) Fecha ajuste válida + no duplica día hábil + dentro del mes/semana
  if (b.ajusteFecha) {
    // 5a. Validez calendárica: rechazar "2026-02-30" u otras fechas irreales
    // (Date de JS acepta 02-30 y lo mueve a 03-02 silenciosamente).
    const [ay, am, ad] = b.ajusteFecha.split('-').map(Number);
    const parsed = new Date(`${b.ajusteFecha}T00:00:00Z`);
    const isRealDate = !Number.isNaN(parsed.getTime())
      && parsed.getUTCFullYear() === ay
      && parsed.getUTCMonth() + 1 === am
      && parsed.getUTCDate() === ad;
    if (!isRealDate) {
      reasons.push(`Fecha de ajuste inválida (${b.ajusteFecha}). Verifica que exista en el calendario.`);
    } else {
      // 5b. Sanity mes/año vs weekStart (semana cruza a lo mucho 1 mes)
      const [wy, wm] = b.weekStart.split('-').map(Number);
      const monthsDiff = (ay - wy) * 12 + (am - wm);
      if (Math.abs(monthsDiff) > 1) {
        reasons.push(`Fecha de ajuste ${b.ajusteFecha} está en mes/año distinto a la semana ${b.weekStart}.`);
      }

      // 5c. Duplicado calendárico: resolver cada día hábil a fecha real
      // usando el mismo helper del pipeline (maneja cross-month + fallback
      // same-month para días fuera de la semana), y comparar contra la
      // fecha del ajuste como string ISO.
      const diasHabilesIso = new Set(
        b.diasHabiles.map(d => dayOfMonthToIsoDate(b.weekStart, d)),
      );
      if (diasHabilesIso.has(b.ajusteFecha)) {
        reasons.push(
          `La factura de ajuste (${b.ajusteFecha}) cae el mismo día que un día hábil. Se emitirían 2 facturas para el mismo día.`,
        );
      }
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
