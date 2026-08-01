import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { MeerkatId } from '../types';
import { NOX_TOOLS } from './nox-tools';
import { NIVA_TOOLS } from './niva-tools';
import { NIA_TOOLS } from './nia-tools';

/**
 * Tools disponibles a cada meerkat en el pipeline de golden tests.
 *
 * Meerkats sin entry en este mapa (o con []) corren SIN tool support; modo pure
 * conversation como los 4 scenarios base de nia. Meerkats con tools registradas activan
 * el loop tool-aware del invoker.
 *
 * Nia tiene tools registradas a partir de los scenarios de tramites externos
 * (consultar_catalogo_externo, buscar_en_padron_externo, enviar_tramite_externo,
 * pedir_a_humano). Los 4 scenarios base de nia (agendar-cita, factura, queja,
 * precio) no usan tools y el invoker simplemente no las ofrece al modelo si el
 * scenario no tiene mock_responses; pero no falla.
 */
export const MEERKAT_TOOLS: Partial<Record<MeerkatId, Tool[]>> = {
  nia:  NIA_TOOLS,
  nox:  NOX_TOOLS,
  niva: NIVA_TOOLS,
};

export function getToolsForMeerkat(meerkatId: MeerkatId): Tool[] {
  return MEERKAT_TOOLS[meerkatId] ?? [];
}
