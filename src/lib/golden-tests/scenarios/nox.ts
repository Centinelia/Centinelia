import type { GoldenScenario } from '../types';
import { NOX_DELEGACION_SIMPLE } from './nox/delegacion-simple';
import { NOX_FAIL_ESCALATE } from './nox/fail-escalate';
import { NOX_CONSULTA_VS_ACCION } from './nox/consulta-vs-accion';
import { NOX_TAREA_PROGRAMADA } from './nox/tarea-programada';

export const NOX_SCENARIOS: GoldenScenario[] = [
  NOX_DELEGACION_SIMPLE,
  NOX_FAIL_ESCALATE,
  NOX_CONSULTA_VS_ACCION,
  NOX_TAREA_PROGRAMADA,
];
