// src/lib/tools/executors/verificar-recepcion-incidencia.ts

const ALLOWED = ['ok', 'no_visitado', 'sin_respuesta'] as const;
type Resultado = typeof ALLOWED[number];

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
  const { error } = await ctx.supabase
    .from('client_incidents')
    .update({
      verification_result: args.resultado,
      verification_result_notes: args.notas ?? null,
      verification_called_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.incident_id)
    .eq('agent_id', ctx.agent.id);
  if (error) throw new Error(`verificar_recepcion_incidencia: ${error.message}`);
  return { ok: true as const, incident_id: args.incident_id, verification_result: args.resultado };
}
