/**
 * writer-consumer/stuck-alert.ts — Detecta CFDIs timbrados que llevan
 * mucho tiempo en la carpeta `timbrados/` sin haberse entregado al receptor
 * (probablemente por correlación permanentemente rota entre basename y
 * email_id).
 *
 * Corre al final de cada tick del cron. Deduplica alertas via
 * billing_activity_log — si ya alertamos por el mismo basename en los
 * últimos 7 días, no repetimos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DropboxClient, DropboxEntry } from '../storage/dropbox';
import { logWriterAudit } from './audit';

/** Umbral para considerar un timbrado como "stuck". */
export const STUCK_TIMBRADO_THRESHOLD_HOURS = 24;

/** Ventana de dedup: no alertamos dos veces por el mismo basename en este período. */
export const STUCK_ALERT_DEDUP_DAYS = 7;

export interface StuckAlertDeps {
  supabase:    SupabaseClient;
  dropbox:     DropboxClient;
  basePath:    string;
  portalEmail: string;
  sendAlert:   (basename: string, ageHours: number) => Promise<void>;
  log:         (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export interface StuckAlertResult {
  scanned: number;
  stuck:   number;
  alerted: number;
}

/**
 * Barre timbrados/ y alerta por cada CFDI con `serverModified` más viejo
 * que el umbral, salvo que ya hayamos alertado por él recientemente.
 */
export async function scanStuckTimbrados(deps: StuckAlertDeps): Promise<StuckAlertResult> {
  const timbradosPath = `${deps.basePath}/timbrados`;
  const result: StuckAlertResult = { scanned: 0, stuck: 0, alerted: 0 };

  let entries: DropboxEntry[];
  try {
    entries = await deps.dropbox.listFolder(timbradosPath);
  } catch {
    return result;
  }

  const now = Date.now();
  const thresholdMs = STUCK_TIMBRADO_THRESHOLD_HOURS * 3600 * 1000;
  const xmlFiles = entries.filter(e => e.isFile && e.name.endsWith('.xml'));
  result.scanned = xmlFiles.length;

  for (const entry of xmlFiles) {
    const modIso = entry.serverModified;
    if (!modIso) continue;
    const ageMs = now - new Date(modIso).getTime();
    if (ageMs < thresholdMs) continue;
    result.stuck++;

    const basename = entry.name.replace(/_[A-Z0-9]+\d+\.xml$/i, '');
    const ageHours = Math.round(ageMs / 3600 / 1000);

    const alreadyAlerted = await hasRecentStuckAlert(deps.supabase, basename);
    if (alreadyAlerted) continue;

    try {
      await deps.sendAlert(basename, ageHours);
      await logWriterAudit('writer_stuck_alert', {
        supabase:    deps.supabase,
        portalEmail: deps.portalEmail,
        basename,
        severity:    'warning',
        context:     { filename: entry.name, ageHours, thresholdHours: STUCK_TIMBRADO_THRESHOLD_HOURS },
      });
      result.alerted++;
    } catch (err) {
      deps.log('warn', 'falló envío de alert stuck', {
        basename,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * True si billing_activity_log tiene un writer_stuck_alert para este basename
 * en los últimos STUCK_ALERT_DEDUP_DAYS días.
 */
async function hasRecentStuckAlert(
  supabase: SupabaseClient,
  basename: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - STUCK_ALERT_DEDUP_DAYS * 86400 * 1000).toISOString();
  const { data } = await supabase
    .from('billing_activity_log')
    .select('id')
    .eq('action_type', 'writer_stuck_alert')
    .eq('entity_ref',  basename)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();
  return !!data;
}
