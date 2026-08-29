// src/lib/tools/executors/verificar-recepcion-incidencia.ts

const ALLOWED = ['ok', 'no_visitado', 'sin_respuesta'] as const;
type Resultado = typeof ALLOWED[number];

interface AttemptRecord {
  called_at: string;
  result:    Resultado;
  notes:     string | null;
}

/**
 * Registra el resultado de un intento de verificación con el cliente. Nelia
 * puede llamar N veces al mismo incident (típicamente cuando la primera no
 * contesta y hay que reintentar en días posteriores). Cada llamada se
 * apendea a `verification_attempts` (JSONB array).
 *
 * `verification_called_at` + `verification_result` reflejan el ÚLTIMO intento
 * — el UI portal, el correo semanal y el cron de seguimiento leen estos
 * campos como valor "actual". El historial completo vive en el array para
 * mostrar la línea de tiempo en el UI cuando aplique.
 */
export async function verificarRecepcionIncidencia(ctx: any, args: {
  incident_id: string;
  resultado: Resultado;
  notas?: string;
}) {
  if (!ALLOWED.includes(args.resultado)) {
    throw new Error(`resultado inválido: ${args.resultado}. Debe ser uno de ${ALLOWED.join(', ')}`);
  }
  if (!ctx?.agent?.id) {
    throw new Error('verificar_recepcion_incidencia: ctx.agent.id requerido para ownership check.');
  }

  // Leer attempts existentes para apendear (append-only history).
  const { data: existing, error: readErr } = await ctx.supabase
    .from('client_incidents')
    .select('verification_attempts')
    .eq('id', args.incident_id)
    .eq('agent_id', ctx.agent.id)
    .maybeSingle();
  if (readErr) throw new Error(`verificar_recepcion_incidencia read: ${readErr.message}`);
  if (!existing) throw new Error(`verificar_recepcion_incidencia: incident no encontrado o no pertenece a este agente`);

  const attempts: AttemptRecord[] = Array.isArray(existing.verification_attempts)
    ? existing.verification_attempts as AttemptRecord[]
    : [];
  const now = new Date().toISOString();
  const newAttempt: AttemptRecord = {
    called_at: now,
    result:    args.resultado,
    notes:     args.notas ?? null,
  };
  const updatedAttempts = [...attempts, newAttempt];

  const { error } = await ctx.supabase
    .from('client_incidents')
    .update({
      verification_result:       args.resultado,       // "último resultado" (backwards compat)
      verification_result_notes: args.notas ?? null,
      verification_called_at:    now,                  // "última fecha" (backwards compat)
      verification_attempts:     updatedAttempts,      // historial completo
      updated_at:                now,
    })
    .eq('id', args.incident_id)
    .eq('agent_id', ctx.agent.id);
  if (error) throw new Error(`verificar_recepcion_incidencia: ${error.message}`);
  return {
    ok:                  true as const,
    incident_id:         args.incident_id,
    verification_result: args.resultado,
    attempt_number:      updatedAttempts.length,
  };
}
