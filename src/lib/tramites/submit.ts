import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite } from './types';
import { buildIdempotencyHash } from './idempotency';
import { callTramiteEndpoint } from './client';
import { isMockMode, loadFixture } from './mock';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface SubmitContext {
  channel:  'voice' | 'chat' | 'email';
  agentId?: string;
  callId?:  string;
}

export type SubmitTramiteResult =
  | { ok: true;  folio: string | null; already_submitted?: true }
  | { ok: false; error: string; retryField?: string; escalate?: true };

/**
 * Lee un valor de un objeto anidado usando un path con puntos.
 * Retorna null en cualquier segmento ausente.
 */
function readByPath(obj: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[seg];
  }
  return current ?? null;
}

/**
 * Determina el estado a guardar en `external_tramites_submissions`.
 */
function resolveStatus(
  httpStatus: number,
  timedOut:   boolean,
  successStatuses: number[],
): 'success' | 'schema_mismatch' | 'timeout' | 'server_error' | 'error' {
  if (timedOut)                             return 'timeout';
  if (successStatuses.includes(httpStatus)) return 'success';
  if (httpStatus === 422)                   return 'schema_mismatch';
  if (httpStatus >= 500)                    return 'server_error';
  return 'error';
}

/**
 * Envía un trámite externo, maneja idempotencia, y persiste el resultado.
 *
 * Flujo:
 * 1. Validar campos requeridos.
 * 2. Calcular hash de idempotencia y verificar si ya fue enviado.
 * 3. Si no, llamar al endpoint de submit (real o mock).
 * 4. Insertar registro en `external_tramites_submissions`.
 * 5. Retornar resultado tipado al agente.
 *
 * Convención mock:
 * - Si algún valor de campo es la cadena "FAIL_422" → fixture de error 422.
 * - Si algún valor de campo es la cadena "FAIL_500" → fixture de error 500.
 * - De lo contrario → fixture de éxito (status 200).
 */
export async function submitTramite(
  tramite:  Tramite,
  campos:   Record<string, unknown>,
  ctx:      SubmitContext,
  supabase: SupabaseClient,
): Promise<SubmitTramiteResult> {
  // 1. Validar campos requeridos
  for (const campo of tramite.campos) {
    if (!campo.required) continue;
    const val = campos[campo.key];
    if (val === undefined || val === null || val === '') {
      return {
        ok:         false,
        error:      `El campo '${campo.key}' es obligatorio para este trámite y no fue proporcionado. Por favor solicítalo al usuario.`,
        retryField: campo.key,
      };
    }
  }

  // 2. Hash de idempotencia y verificación de duplicado
  const idempotencyHash = buildIdempotencyHash(tramite.id, campos, tramite.reglas_negocio);

  const { data: existing, error: lookupErr } = await supabase
    .from('external_tramites_submissions')
    .select('id, folio, status')
    .eq('tramite_id', tramite.id)
    .eq('idempotency_hash', idempotencyHash)
    .maybeSingle();

  if (lookupErr) {
    console.error('[tramites] submitTramite idempotency lookup', lookupErr);
    // No bloqueamos — continuamos; el INSERT fallará en unique constraint si hay duplicado.
  }

  if (existing) {
    // Ya fue enviado hoy con los mismos datos
    const isSuccess = existing.status === 'success';
    if (isSuccess) {
      return {
        ok:               true,
        folio:            existing.folio as string | null,
        already_submitted: true,
      };
    }
    // Si el envío anterior falló, permitimos reintentar (no considerar idempotente)
  }

  // 3. Llamar endpoint (mock o real)
  let httpResult: { status: number; body: unknown; timedOut: boolean };

  if (isMockMode()) {
    const values = Object.values(campos).map(v => String(v ?? ''));
    let fixtureName: string;
    let mockStatus: number;

    if (values.some(v => v === 'FAIL_422')) {
      fixtureName = 'validation_error';
      mockStatus  = 422;
    } else if (values.some(v => v === 'FAIL_500')) {
      fixtureName = 'server_error';
      mockStatus  = 500;
    } else {
      fixtureName = 'success';
      mockStatus  = 200;
    }

    const fixture = await loadFixture(tramite.slug, 'submit', fixtureName);
    httpResult = { status: mockStatus, body: fixture, timedOut: false };
  } else {
    httpResult = await callTramiteEndpoint(
      tramite,
      tramite.submit.endpoint,
      { method: tramite.submit.method, body: campos },
      supabase,
    );
  }

  // 4. Determinar status label y folio
  const statusLabel = resolveStatus(
    httpResult.status,
    httpResult.timedOut,
    tramite.submit.response_success_status,
  );

  let folio: string | null = null;
  if (statusLabel === 'success') {
    const raw = readByPath(httpResult.body, tramite.submit.response_folio_path);
    folio = raw != null ? String(raw) : null;
  }

  // C1: Si el endpoint respondió con éxito pero no hay folio, tratar como error anómalo.
  const dbStatus = statusLabel === 'success' && !folio ? 'error' : statusLabel;

  // 5. Persistir en external_tramites_submissions
  const { error: insertErr } = await supabase
    .from('external_tramites_submissions')
    .insert({
      tramite_id:        tramite.id,
      org_id:            tramite.org_id,
      agent_id:          ctx.agentId ?? null,
      call_id:           ctx.callId  ?? null,
      channel:           ctx.channel,
      idempotency_hash:  idempotencyHash,
      payload:           campos,
      response_status:   httpResult.timedOut ? 0 : httpResult.status,
      response_body:     httpResult.body,
      folio,
      status:            dbStatus,
      error:             dbStatus !== 'success'
        ? JSON.stringify(httpResult.body ?? { timedOut: httpResult.timedOut })
        : null,
    });

  if (insertErr) {
    // Puede ser un error de unique constraint por idempotencia concurrente
    console.error('[tramites] submitTramite insert', insertErr);
    if (insertErr.code === '23505') {
      // Duplicate key — idempotencia concurrente, retornar el registro guardado
      const { data: race } = await supabase
        .from('external_tramites_submissions')
        .select('folio, status')
        .eq('tramite_id', tramite.id)
        .eq('idempotency_hash', idempotencyHash)
        .maybeSingle();
      return {
        ok:               true,
        folio:            (race?.folio as string | null) ?? null,
        already_submitted: true,
      };
    }
    // Otro error de DB — reportar pero no bloquear si el envío fue exitoso con folio.
    if (statusLabel === 'success' && folio) {
      return { ok: true, folio };
    }
  }

  // 6. Construir resultado para el agente
  if (statusLabel === 'success') {
    // C1: Si el endpoint respondió éxito pero no incluyó folio, es una respuesta anómala.
    // El agente no puede confirmar el trámite sin folio — escalar a humano.
    if (!folio) {
      return {
        ok:       false,
        error:    'El endpoint respondió éxito pero no incluyó folio. Escalando a humano.',
        escalate: true,
      };
    }
    return { ok: true, folio };
  }

  if (httpResult.timedOut) {
    return {
      ok:       false,
      error:    'El servidor del trámite no respondió a tiempo. El envío no pudo completarse. Informa al usuario e intenta de nuevo más tarde.',
      escalate: true,
    };
  }

  if (statusLabel === 'schema_mismatch') {
    return {
      ok:       false,
      error:    `El servidor rechazó el formulario con error de validación (422). Puede haber un dato incorrecto. Verifica los datos con el usuario y vuelve a intentar.`,
      escalate: true,
    };
  }

  if (statusLabel === 'server_error') {
    return {
      ok:       false,
      error:    `El servidor del trámite respondió con un error interno (${httpResult.status}). No es posible completar el trámite en este momento. Informa al usuario e intenta más tarde.`,
      escalate: true,
    };
  }

  // Generic error (4xx etc.) — I2: escalate=true porque el agente no puede resolver esto.
  return {
    ok:       false,
    error:    `El trámite no pudo completarse. El servidor respondió con código ${httpResult.status}. Verifica los datos o contacta a soporte.`,
    escalate: true,
  };
}
