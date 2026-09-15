export const dynamic = 'force-dynamic';

import { defineCron, errorMessage } from '@/lib/cron/define-cron';
import { downloadAndStoreVapiRecording } from '@/lib/vapi/recordings';

// Safety net para grabaciones que no llegaron al bucket call-recordings vía el
// after() del webhook /api/voice/webhook. Casos que cubre:
//
//   1. Vercel cortó el after() (30s ceiling) antes de terminar el download.
//   2. Vapi aún no tenía el mp3 listo al momento del end-of-call-report
//      (procesa el audio async post-llamada).
//   3. Fallo transitorio de red en la subida a Supabase Storage.
//
// Se limita a llamadas dentro de VAPI_RETENTION_DAYS: Vapi expira sus URLs
// después de unos días. Si intentamos bajar más tarde, ya no habrá mp3.
//
// Corre cada 15 min, procesa BATCH_LIMIT llamadas por corrida. Ordena por
// created_at DESC (más recientes primero) para que el usuario abriendo el
// portal justo después de la llamada tenga alta probabilidad de encontrarlo.

const VAPI_RETENTION_DAYS = 3;
const BATCH_LIMIT         = 50;

interface CandidateRow {
  id:            string;
  agent_id:      string;
  recording_url: string | null;
}

export const GET = defineCron({
  name: 'backfill-recordings',
  maxDuration: 300,
  handler: async ({ supabase, now, log }) => {
    const cutoffIso = new Date(now.getTime() - VAPI_RETENTION_DAYS * 86400_000).toISOString();

    const { data, error } = await supabase
      .from('voice_calls')
      .select('id, agent_id, recording_url')
      .not('recording_url', 'is', null)
      .is('recording_storage_path', null)
      .gt('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(BATCH_LIMIT);

    if (error) {
      throw new Error(`select candidates: ${errorMessage(error)}`);
    }

    const candidates = (data ?? []) as CandidateRow[];
    let processed = 0;
    const errors: string[] = [];

    for (const call of candidates) {
      if (!call.recording_url || !call.agent_id) continue;
      try {
        const storagePath = await downloadAndStoreVapiRecording({
          supabase,
          agentId:      call.agent_id,
          voiceCallId:  call.id,
          recordingUrl: call.recording_url,
        });
        if (!storagePath) {
          // downloadAndStoreVapiRecording nunca lanza; retorna null cuando
          // (a) Vapi devuelve 404, (b) body vacío, (c) upload falla. Cuenta
          // como "skipped this iteration"; el próximo run reintentará hasta
          // que created_at salga de la ventana VAPI_RETENTION_DAYS.
          continue;
        }
        const { error: updErr } = await supabase
          .from('voice_calls')
          .update({ recording_storage_path: storagePath })
          .eq('id', call.id);
        if (updErr) {
          errors.push(`update ${call.id}: ${errorMessage(updErr)}`);
          log.error('voice_calls update failed', { callId: call.id, error: errorMessage(updErr) });
          continue;
        }
        processed++;
      } catch (err) {
        // Defensivo: downloadAndStoreVapiRecording no debería lanzar, pero
        // por si el update sí lo hace, acumulamos y seguimos con las demás.
        errors.push(`${call.id}: ${errorMessage(err)}`);
        log.error('backfill iteration failed', { callId: call.id, error: errorMessage(err) });
      }
    }

    return {
      expected:  candidates.length,
      processed,
      errors,
      metadata: {
        vapi_retention_days: VAPI_RETENTION_DAYS,
        batch_limit:         BATCH_LIMIT,
      },
    };
  },
  // silenceAlerts: candidatos "skipped" (Vapi aún no tiene el mp3, o expiró)
  // son normales, no queremos alertar en cada run que no procese 100%. Los
  // errores duros (throw del handler) sí alertan porque llegan por handlerError.
  silenceAlerts: true,
});
