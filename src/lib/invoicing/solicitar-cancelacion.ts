// src/lib/invoicing/solicitar-cancelacion.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/send';

export interface SolicitarCancelacionArgs {
  uuid_o_folio_corto: string;
  motivo: '01' | '02' | '03' | '04';
  uuid_sustituto?: string;
  razon_cliente?: string;
}

export interface SolicitarCancelacionCtx {
  agentId: string; portalEmail: string; supabase: SupabaseClient;
  channel: 'voice' | 'chat' | 'email' | 'portal';
}

export interface SolicitarCancelacionResult {
  ok: boolean; cancellation_id?: string; message: string;
}

export async function solicitarCancelacion(
  args: SolicitarCancelacionArgs, ctx: SolicitarCancelacionCtx,
): Promise<SolicitarCancelacionResult> {
  if (!['01','02','03','04'].includes(args.motivo)) {
    return { ok: false, message: `Motivo inválido "${args.motivo}". Debe ser 01, 02, 03 o 04.` };
  }
  if (args.motivo === '01' && !args.uuid_sustituto) {
    return { ok: false, message: 'Motivo 01 (error en datos) requiere uuid_sustituto.' };
  }

  const q = args.uuid_o_folio_corto.trim();
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
  const query = ctx.supabase.from('factura_requests')
    .select('id, uuid, cliente_nombre, total, portal_email')
    .eq('portal_email', ctx.portalEmail)
    .eq('status', 'stamped');
  const { data: matches } = isFullUuid
    ? await query.eq('uuid', q)
    : await query.like('uuid', `%${q}`);

  if (!matches || matches.length === 0) return { ok: false, message: `No encontré factura con folio "${q}".` };
  if (matches.length > 1) return { ok: false, message: `Encontré ${matches.length} facturas con ese folio. Pide el UUID completo.` };
  const f = matches[0];

  // Evitar duplicados
  const { count } = await ctx.supabase.from('cfdi_cancellations')
    .select('id', { count: 'exact', head: true })
    .eq('uuid_cancelado', f.uuid)
    .in('status', ['requested','sent_to_sat']);
  if ((count ?? 0) > 0) return { ok: false, message: 'Ya hay una solicitud de cancelación en curso para esa factura.' };

  const { data: ins, error } = await ctx.supabase.from('cfdi_cancellations').insert({
    factura_request_id: f.id,
    organization_email: ctx.portalEmail,
    uuid_cancelado: f.uuid!,
    motivo: args.motivo,
    uuid_sustituto: args.uuid_sustituto ?? null,
    requested_by_agent_id: ctx.agentId,
    requested_via: ctx.channel,
    razon_cliente: args.razon_cliente ?? null,
    status: 'requested',
  }).select('id').single();
  if (error || !ins) return { ok: false, message: 'No pude registrar la solicitud.' };

  await ctx.supabase.from('factura_requests').update({ status: 'cancellation_requested' }).eq('id', f.id);

  // Email al humano (best effort)
  const { data: org } = await ctx.supabase.from('organizations')
    .select('portal_email, invoicing_razon_social').eq('portal_email', ctx.portalEmail).single();
  void sendEmail({
    to: ctx.portalEmail,
    subject: `Solicitud de cancelación · folio ${f.uuid!.slice(-8)}`,
    html: `<p>El agente pidió cancelar la factura <strong>${f.uuid}</strong> (${f.cliente_nombre}, $${f.total}).</p>
           <p>Motivo SAT: ${args.motivo}${args.uuid_sustituto ? ` · sustituto ${args.uuid_sustituto}` : ''}</p>
           <p>Razón cliente: ${args.razon_cliente ?? '—'}</p>
           <p>Confírmala o recházala desde el portal en /oficina/facturas.</p>`,
    from: `${org?.invoicing_razon_social ?? 'Centinelia'} <notificaciones@centinelia.mx>`,
  }).catch(err => console.error('[solicitarCancelacion] email:', err));

  return { ok: true, cancellation_id: ins.id, message: 'Registré la solicitud de cancelación. El equipo la confirma en las próximas horas.' };
}
