/**
 * Phrase matcher para tareas programadas de tipo 'phrase'.
 *
 * v1: solo literal match (case-insensitive substring).
 * v2 (pendiente): semantic match via embeddings.
 *
 * Ver spec Sección 4.5.1.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface PhraseMatch {
  taskId: string;
  matchedPhrase: string;
  matchType: 'literal' | 'semantic';
}

/**
 * Busca si el mensaje del usuario activa alguna tarea de tipo 'phrase' del meerkat.
 *
 * @param ownerAgentId - UUID del voice_agent dueño de las tareas
 * @param userMessage  - Mensaje del usuario (raw text)
 * @returns Primer match encontrado, o null si no hay match
 */
export async function matchPhraseToTask(
  ownerAgentId: string,
  userMessage: string,
): Promise<PhraseMatch | null> {
  if (!userMessage?.trim()) return null;

  const supabase = createAdminClient();

  // Obtener todas las tareas tipo 'phrase' activas del agente
  const { data: tasks, error } = await supabase
    .from('agent_tasks')
    .select('id, trigger_config, active')
    .eq('owner_agent_id', ownerAgentId)
    .eq('trigger_type', 'phrase')
    .eq('active', true);

  if (error) {
    console.warn('[phrase-matcher] Error al obtener tareas:', error.message);
    return null;
  }

  if (!tasks || tasks.length === 0) return null;

  const normalizedMessage = userMessage.toLowerCase();

  for (const task of tasks) {
    const config = (task.trigger_config ?? {}) as { phrases?: unknown };
    const phrases = config.phrases;

    if (!Array.isArray(phrases)) continue;

    for (const phrase of phrases) {
      if (typeof phrase !== 'string' || !phrase.trim()) continue;

      // Literal match: substring case-insensitive
      if (normalizedMessage.includes(phrase.toLowerCase())) {
        return {
          taskId:        task.id as string,
          matchedPhrase: phrase,
          matchType:     'literal',
        };
      }
    }
  }

  return null;
}
