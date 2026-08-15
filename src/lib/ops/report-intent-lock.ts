/**
 * Report Intent Locks — sincronización org-level entre meerkats.
 *
 * Problema: Nia + Nox + Niva + Noah + Nash pueden reaccionar en paralelo al
 * mismo evento (correo entrante, llamada, tarea) y cada uno decide por su
 * cuenta si mandar reporte al owner o al cliente. Sin coordinación, el
 * cliente recibe el mismo correo/WhatsApp N veces y su pool de tareas se
 * consume N veces. Nazre (2026-08-15): "no quedemos mal malgastando las
 * tareas del cliente con info repetida — que se pongan de acuerdo entre
 * ellos quien enviará qué".
 *
 * Solución: cada tool saliente reclama un intent lock atómico antes de
 * consumir op y enviar. El lock vive a nivel `portal_email` (org), no por
 * agente, y usa un hash determinístico de (kind, target, subject). El primer
 * meerkat que reclama gana; el segundo recibe `alreadyClaimedBy` y aborta
 * limpiamente sin cobrar op.
 *
 * Ventana de dedupe = TTL del lock (default 24h). Se puede acortar por
 * llamador (ej: monitor_alert usa 6h porque es aceptable re-avisar al día
 * siguiente si el problema persiste).
 */

import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type IntentKind = 'email' | 'whatsapp' | 'task' | 'monitor_alert';

export interface ClaimInput {
  portalEmail:     string;
  kind:            IntentKind;
  target:          string;                        // destinatario (email, tel, agent_id, etc.)
  subject:         string;                        // asunto/título del reporte
  agentId?:        string | null;                 // meerkat que intenta reclamar
  agentName?:      string | null;                 // para logs y mensajes de conflicto
  ttlHours?:       number;                        // default 24
  bucketHours?:    number;                        // ventana de agrupación por tiempo (default 0 = sin bucket)
  extraDedupe?:    string;                        // salt adicional (ej. body_hash) si dos reportes con mismo subject no son duplicados
  sourceContext?:  Record<string, unknown>;
  relatedTaskId?:  string | null;
}

export interface ClaimResult {
  claimed:            boolean;
  lockId:             string | null;
  intentHash:         string;
  alreadyClaimedBy:   { agentId: string | null; agentName: string | null; claimedAt: string } | null;
}

// ── Normalización + hash ──────────────────────────────────────────────────────

function normalizeTarget(target: string): string {
  const trimmed = target.trim().toLowerCase();
  // Si parece teléfono, colapsar a dígitos para que "+52 (81) 1234-5678" y
  // "+528112345678" hasheen igual.
  if (/^\+?[\d\s()\-.]+$/.test(trimmed) && !trimmed.includes('@')) {
    return trimmed.replace(/\D/g, '');
  }
  return trimmed;
}

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function computeIntentHash(input: {
  portalEmail: string;
  kind:        IntentKind;
  target:      string;
  subject:     string;
  bucketHours?: number;
  extraDedupe?: string;
}): string {
  const bucket = input.bucketHours && input.bucketHours > 0
    ? Math.floor(Date.now() / (input.bucketHours * 60 * 60 * 1000))
    : '';
  const parts = [
    input.portalEmail.trim().toLowerCase(),
    input.kind,
    normalizeTarget(input.target),
    normalizeSubject(input.subject),
    String(bucket),
    input.extraDedupe ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

// ── Claim ─────────────────────────────────────────────────────────────────────

/**
 * Intenta reclamar un intent lock atómicamente.
 *
 * Comportamiento:
 * - Si NO hay lock vivo con el mismo hash → INSERTa y retorna { claimed: true }.
 * - Si YA hay lock vivo (otro meerkat lo reclamó primero) → retorna
 *   { claimed: false, alreadyClaimedBy: {...} }.
 * - Si hay lock released/expired → INSERTa uno nuevo (permite reintento).
 *
 * La atomicidad la garantiza el partial unique index
 * `report_intent_locks_live_uidx`. En race conditions, el INSERT del perdedor
 * falla con código 23505 (unique_violation) y volvemos a leer el ganador.
 */
export async function tryClaimReportIntent(input: ClaimInput): Promise<ClaimResult> {
  const supabase = createAdminClient();
  const ttlHours = input.ttlHours ?? 24;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  const intentHash = computeIntentHash({
    portalEmail: input.portalEmail,
    kind:        input.kind,
    target:      input.target,
    subject:     input.subject,
    bucketHours: input.bucketHours,
    extraDedupe: input.extraDedupe,
  });

  const insertRow = {
    portal_email:      input.portalEmail,
    intent_hash:       intentHash,
    intent_kind:       input.kind,
    target:            normalizeTarget(input.target),
    subject_summary:   input.subject.slice(0, 300),
    claimed_by_agent:  input.agentId ?? null,
    claimed_by_name:   input.agentName ?? null,
    expires_at:        expiresAt,
    status:            'claimed',
    source_context:    input.sourceContext ?? null,
    related_task_id:   input.relatedTaskId ?? null,
  };

  // Attempt 1
  const first = await supabase.from('report_intent_locks').insert(insertRow).select('id').single();
  if (!first.error && first.data) {
    return { claimed: true, lockId: first.data.id, intentHash, alreadyClaimedBy: null };
  }

  const isUniqueViolation = (err: unknown): boolean => {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: string; message?: string };
    return e.code === '23505' || /duplicate key/i.test(e.message ?? '');
  };

  if (!isUniqueViolation(first.error)) {
    // Error inesperado: fail-open (preferimos duplicado ocasional a silenciar
    // reporte real cuando la tabla está caída).
    console.error('[report-intent-lock] claim failed, failing open:', first.error);
    return { claimed: true, lockId: null, intentHash, alreadyClaimedBy: null };
  }

  // Unique violation. El index NO filtra por expires_at (NOW no es IMMUTABLE
  // en el predicate), así que el "ganador" podría estar expirado. Barrer
  // expirados con este hash y reintentar una vez.
  const nowIso = new Date().toISOString();
  await supabase
    .from('report_intent_locks')
    .update({ released_at: nowIso, status: 'released' })
    .eq('portal_email', input.portalEmail)
    .eq('intent_hash', intentHash)
    .is('released_at', null)
    .lt('expires_at', nowIso);

  const second = await supabase.from('report_intent_locks').insert(insertRow).select('id').single();
  if (!second.error && second.data) {
    return { claimed: true, lockId: second.data.id, intentHash, alreadyClaimedBy: null };
  }

  // Sigue habiendo un lock vivo y NO expirado — otro meerkat ganó de verdad.
  const { data: winner } = await supabase
    .from('report_intent_locks')
    .select('id, claimed_by_agent, claimed_by_name, claimed_at, expires_at')
    .eq('portal_email', input.portalEmail)
    .eq('intent_hash', intentHash)
    .is('released_at', null)
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    claimed:    false,
    lockId:     null,
    intentHash,
    alreadyClaimedBy: winner
      ? {
          agentId:   winner.claimed_by_agent,
          agentName: winner.claimed_by_name,
          claimedAt: winner.claimed_at,
        }
      : null,
  };
}

// ── Commit / release ──────────────────────────────────────────────────────────

export async function commitReportIntent(lockId: string | null): Promise<void> {
  if (!lockId) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('report_intent_locks')
    .update({ status: 'committed', committed_at: new Date().toISOString() })
    .eq('id', lockId);
  if (error) console.error('[report-intent-lock] commit failed:', error);
}

/**
 * Libera un lock reclamado. Llamar cuando el envío falla y queremos que otro
 * meerkat pueda reintentar. Marca released_at para sacar la fila del partial
 * unique index inmediatamente.
 */
export async function releaseReportIntent(lockId: string | null): Promise<void> {
  if (!lockId) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('report_intent_locks')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', lockId);
  if (error) console.error('[report-intent-lock] release failed:', error);
}

// ── Helper de conveniencia ────────────────────────────────────────────────────

/**
 * Formatea un mensaje amigable para el meerkat que perdió el claim. Se pasa
 * como resultado del tool call para que el modelo lo comunique al usuario sin
 * hacer otro intento.
 */
export function formatDuplicateReportMessage(claim: ClaimResult): string {
  if (claim.claimed) return '';
  const who = claim.alreadyClaimedBy?.agentName || 'otro compañero del equipo';
  const when = claim.alreadyClaimedBy?.claimedAt
    ? new Date(claim.alreadyClaimedBy.claimedAt).toLocaleString('es-MX', {
        timeZone: 'America/Monterrey',
        hour:   '2-digit',
        minute: '2-digit',
      })
    : 'hace unos momentos';
  return `${who} ya se encargó de este reporte a las ${when}. No enviamos duplicado ni consumimos una tarea adicional.`;
}
