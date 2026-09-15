import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const CALL_RECORDINGS_BUCKET = 'call-recordings';

/** TTL para signed URL entregado al reproductor de audio del admin/portal. */
export const SIGNED_URL_TTL_SEC = 60 * 15;

/**
 * Path relativo dentro del bucket. Un archivo por llamada.
 *
 * Formato: `{agent_id}/{voice_call_id}.mp3`
 *
 * Scope por agent_id (no por portal_email) porque un mismo owner puede tener
 * varios meerkats y los voice_call_id son globales. Con esto, `list(prefix=agent_id)`
 * da todas las llamadas de un agente.
 */
export function buildRecordingPath(agentId: string, voiceCallId: string): string {
  return `${agentId}/${voiceCallId}.mp3`;
}

/**
 * Baja el mp3 de Vapi y lo sube al bucket call-recordings. Idempotente:
 * si el archivo ya existe se sobreescribe (upsert). El caller decide si
 * update de `voice_calls.recording_storage_path` es necesario.
 *
 * Retorna el path en caso de éxito, o null si (a) Vapi no expone URL de
 * recording para esta llamada, (b) el fetch falla, (c) el upload falla.
 * NUNCA lanza — el download de audio no debe romper el webhook.
 */
export async function downloadAndStoreVapiRecording(opts: {
  supabase:    SupabaseClient;
  agentId:     string;
  voiceCallId: string;
  recordingUrl: string | null;
}): Promise<string | null> {
  const { supabase, agentId, voiceCallId, recordingUrl } = opts;
  if (!recordingUrl) return null;

  try {
    const res = await fetch(recordingUrl);
    if (!res.ok) {
      console.error('[vapi/recordings] fetch failed', {
        voiceCallId,
        status: res.status,
      });
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      console.error('[vapi/recordings] empty body', { voiceCallId });
      return null;
    }

    const path = buildRecordingPath(agentId, voiceCallId);
    const { error } = await supabase.storage
      .from(CALL_RECORDINGS_BUCKET)
      .upload(path, buf, {
        contentType: 'audio/mpeg',
        upsert:      true,
      });
    if (error) {
      console.error('[vapi/recordings] upload failed', {
        voiceCallId,
        error: error.message,
      });
      return null;
    }
    return path;
  } catch (err) {
    console.error('[vapi/recordings] unexpected error', {
      voiceCallId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Firma una URL para reproducir el mp3 desde el bucket. Retorna null si el
 * archivo no existe o si Supabase falla al firmar. Los endpoints
 * /api/{admin,portal}/recording/[callId] la usan y hacen fallback a Vapi.
 */
export async function signRecordingUrl(
  supabase: SupabaseClient,
  storagePath: string,
  ttlSec: number = SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(CALL_RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, ttlSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
