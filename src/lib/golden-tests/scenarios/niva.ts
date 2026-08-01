import type { GoldenScenario } from '../types';
import { NIVA_PREGUNTA_RAPIDA } from './niva/pregunta-rapida';
import { NIVA_CONSULTA_NIA } from './niva/consulta-nia';
import { NIVA_ESCALACION_INFO } from './niva/escalacion-info';

export const NIVA_SCENARIOS: GoldenScenario[] = [
  NIVA_PREGUNTA_RAPIDA,
  NIVA_CONSULTA_NIA,
  NIVA_ESCALACION_INFO,
];
