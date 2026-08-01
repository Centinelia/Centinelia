import type { GoldenScenario } from '../types';
import { NIVA_PREGUNTA_RAPIDA } from './niva/pregunta-rapida';

// Los scenarios adicionales se agregan aca cuando se creen (consulta-nia, escalacion-info).
export const NIVA_SCENARIOS: GoldenScenario[] = [
  NIVA_PREGUNTA_RAPIDA,
];
