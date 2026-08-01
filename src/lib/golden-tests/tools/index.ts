import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { MeerkatId } from '../types';
import { NOX_TOOLS } from './nox-tools';
import { NIVA_TOOLS } from './niva-tools';

/**
 * Tools disponibles a cada meerkat en el pipeline de golden tests.
 *
 * Meerkats sin entry en este mapa (o con []) corren SIN tool support — modo pure
 * conversation como los 4 scenarios de nia. Meerkats con tools registradas activan
 * el loop tool-aware del invoker.
 */
export const MEERKAT_TOOLS: Partial<Record<MeerkatId, Tool[]>> = {
  nox:  NOX_TOOLS,
  niva: NIVA_TOOLS,
};

export function getToolsForMeerkat(meerkatId: MeerkatId): Tool[] {
  return MEERKAT_TOOLS[meerkatId] ?? [];
}
