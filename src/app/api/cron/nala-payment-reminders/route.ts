/**
 * Cron endpoint — recordatorios escalados de pago (Fase 3).
 *
 * Corre diario 10 AM MX (1 hora después del billing-cycle). Para cada CFDI
 * PPD emitido en centinelia_billing sin pago_recibido correspondiente,
 * calcula días transcurridos y manda recordatorio si aplica:
 *
 *   Día  7: recordatorio amable ("tu factura vence pronto")
 *   Día 12: urgencia media ("por favor programa el pago")
 *   Día 15: última llamada + notificación a Nazre + marca suspend_pending=true
 *
 * Idempotencia: verifica que no exista ya un reminder_sent con el mismo tier
 * en meta.tier para el mismo (cliente_id, ciclo_key). Si ya se mandó ese tier,
 * skip.
 *
 * Cuando llega pago_recibido para (cliente_id, ciclo_key), el flow queda
 * completo — el cron ya no procesará más recordatorios porque hasPago=true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendViaTitan } from '@/lib/email/titan-smtp';
import { getCentineliaFiscalConfig } from '@/lib/invoicing/facturama/centinelia-preset';
import { sendEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface CfdiPendiente {
  billing_id:            string;
  cliente_id:            string;
  ciclo_key:             string;
  cfdi_uuid:             string;
  monto:                 number;
  sent_to_email:         string;
  cfdi_emitido_at:       string;
  cliente_razon_social:  string;
  cliente_rfc:           string;
  cliente_nombre_contacto: string | null;
  suspend_pending:       boolean;
}

interface Tier {
  dias:       number;
  tono:       'amable' | 'urgente' | 'final';
  subject:    (razon: string, ciclo: string) => string;
  body:       (nombre: string | null, monto: number, ciclo: string, diasVencido: number) => string;
}

const TIERS: Tier[] = [
  {
    dias: 7,
    tono: 'amable',
    subject: (razon, ciclo) => `Recordatorio: factura ${ciclo} pendiente de pago`,
    body: (nombre, monto, ciclo, dias) => `Hola${nombre ? ` ${nombre}` : ''},

Te escribo para recordarte que la factura del ciclo **${ciclo}** por **$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** sigue pendiente de pago. Va${dias === 1 ? ' 1 día' : ` ${dias} días`} desde que se emitió.

Cuando programes el pago, mándanos el comprobante SPEI a este correo y te emito el complemento de inmediato.

Cualquier duda, respondo por este medio.`,
  },
  {
    dias: 12,
    tono: 'urgente',
    subject: (razon, ciclo) => `Segunda notificación: factura ${ciclo} vencida`,
    body: (nombre, monto, ciclo, dias) => `Hola${nombre ? ` ${nombre}` : ''},

Sigo pendiente del pago de la factura del ciclo **${ciclo}** por **$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**. Ya van **${dias} días** desde que se emitió.

Para no interrumpir el servicio del próximo ciclo, te pido programar el pago en los próximos días. Si necesitas ajustar la fecha de pago o hay algún problema con la factura, dime por este correo y lo revisamos juntos.`,
  },
  {
    dias: 15,
    tono: 'final',
    subject: (razon, ciclo) => `Última notificación: factura ${ciclo} — riesgo de suspensión`,
    body: (nombre, monto, ciclo, dias) => `Hola${nombre ? ` ${nombre}` : ''},

Esta es la última notificación sobre la factura del ciclo **${ciclo}** por **$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**. Van **${dias} días** desde que se emitió y sigue sin pago registrado.

Para evitar la suspensión del servicio, te pido regularizar el pago hoy o mañana a más tardar. Si hay una razón que no conozco (problema con el CFDI, cambio de razón social, tema en revisión), respóndeme por este correo y lo escalamos.

Ya notifiqué internamente a Nazre para que esté al tanto.`,
  },
];

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.floor((to - from) / 86400000);
}

async function fetchPendingCfdis(supabase: ReturnType<typeof createAdminClient>): Promise<CfdiPendiente[]> {
  // Query: CFDIs emitidos que NO tienen pago_recibido correspondiente para el mismo ciclo,
  // JOIN con centinelia_clientes para info del receptor.
  const { data, error } = await supabase
    .from('centinelia_billing')
    .select(`
      id, cliente_id, ciclo_key, cfdi_uuid, monto, sent_to_email, created_at,
      cliente:centinelia_clientes(razon_social, rfc, nombre_contacto, suspend_pending)
    `)
    .eq('tipo', 'cfdi_emitido')
    .not('ciclo_key', 'is', null);

  if (error) throw new Error(`fetchPendingCfdis emitidos: ${error.message}`);

  // Supabase devuelve el join como array aunque sea 1:1 — tomamos el primer elemento
  const rows = ((data ?? []) as unknown as Array<{
    id: string; cliente_id: string; ciclo_key: string; cfdi_uuid: string;
    monto: number; sent_to_email: string; created_at: string;
    cliente: Array<{ razon_social: string; rfc: string; nombre_contacto: string | null; suspend_pending: boolean }> | { razon_social: string; rfc: string; nombre_contacto: string | null; suspend_pending: boolean };
  }>).map(r => ({
    ...r,
    cliente: Array.isArray(r.cliente) ? r.cliente[0] : r.cliente,
  })).filter(r => r.cliente);

  if (rows.length === 0) return [];

  // Fetch payments para dedupe
  const cicloKeys = [...new Set(rows.map(r => r.ciclo_key))];
  const clienteIds = [...new Set(rows.map(r => r.cliente_id))];

  const { data: pagos } = await supabase
    .from('centinelia_billing')
    .select('cliente_id, ciclo_key')
    .eq('tipo', 'pago_recibido')
    .in('cliente_id', clienteIds)
    .in('ciclo_key', cicloKeys);

  const pagoSet = new Set((pagos ?? []).map(p => `${p.cliente_id}|${p.ciclo_key}`));

  return rows
    .filter(r => !pagoSet.has(`${r.cliente_id}|${r.ciclo_key}`))
    .map(r => ({
      billing_id:              r.id,
      cliente_id:              r.cliente_id,
      ciclo_key:               r.ciclo_key,
      cfdi_uuid:               r.cfdi_uuid,
      monto:                   Number(r.monto),
      sent_to_email:           r.sent_to_email,
      cfdi_emitido_at:         r.created_at,
      cliente_razon_social:    r.cliente.razon_social,
      cliente_rfc:             r.cliente.rfc,
      cliente_nombre_contacto: r.cliente.nombre_contacto,
      suspend_pending:         r.cliente.suspend_pending,
    }));
}

async function reminderYaEnviado(
  supabase: ReturnType<typeof createAdminClient>,
  clienteId: string, cicloKey: string, tier: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('centinelia_billing')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('ciclo_key', cicloKey)
    .eq('tipo', 'reminder_sent')
    .filter('meta->>tier', 'eq', String(tier))
    .maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Kill switch (auditoría R2): agendado en vercel.json pero gated hasta
  // que haya clientes con facturación proactiva Facturama activa.
  if (process.env.NALA_PAYMENT_REMINDERS_ENABLED !== 'true') {
    return NextResponse.json({ skipped: 'disabled', reason: 'NALA_PAYMENT_REMINDERS_ENABLED != true' });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const summary = {
    ranAt: nowIso,
    cfdisPendientes: 0,
    remindersEnviados: 0,
    suspensionesMarcadas: 0,
    errores: [] as Array<{ cliente: string; ciclo: string; error: string }>,
  };

  let pendientes: CfdiPendiente[];
  try {
    pendientes = await fetchPendingCfdis(supabase);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  summary.cfdisPendientes = pendientes.length;

  const cfg = getCentineliaFiscalConfig();

  for (const p of pendientes) {
    const dias = daysBetween(p.cfdi_emitido_at, nowIso);
    // Encuentra el tier MÁS ALTO que aplique al día actual y que no se haya enviado ya
    let tierToSend: Tier | null = null;
    for (const t of TIERS) {
      if (dias >= t.dias) {
        const yaEnviado = await reminderYaEnviado(supabase, p.cliente_id, p.ciclo_key, t.dias);
        if (!yaEnviado) tierToSend = t; // sobreescribe con el más alto que aplica
      }
    }

    if (!tierToSend) continue;

    const subject = tierToSend.subject(p.cliente_razon_social, p.ciclo_key);
    const bodyText = tierToSend.body(p.cliente_nombre_contacto, p.monto, p.ciclo_key, dias);

    // Renderiza a HTML (usa marked como en nala-email-runner)
    const { marked } = await import('marked');
    marked.setOptions({ breaks: true, gfm: true });
    const rendered = await marked.parse(bodyText);
    const signature = `
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E8E3F5;font-size:12px;color:#6b7280">
        <p style="margin:0 0 4px 0"><strong style="color:#a16207">Nala</strong> · Facturista</p>
        <p style="margin:0">Centinelia · <a href="mailto:hola@centinelia.mx" style="color:#6C3BFF;text-decoration:none">hola@centinelia.mx</a></p>
      </div>`;
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#1A0A3B">${rendered}${signature}</div>`;

    const sendResult = await sendViaTitan({
      to: p.sent_to_email,
      subject,
      html, text: bodyText,
      fromDisplay: 'Nala Centinelia',
    });

    if (!sendResult.ok) {
      summary.errores.push({ cliente: p.cliente_razon_social, ciclo: p.ciclo_key, error: sendResult.error ?? 'send failed' });
      continue;
    }

    // Registrar evento
    await supabase.from('centinelia_billing').insert({
      cliente_id:  p.cliente_id,
      tipo:        'reminder_sent',
      ciclo_key:   p.ciclo_key,
      related_uuid: p.cfdi_uuid,
      monto:       p.monto,
      sent_to_email: p.sent_to_email,
      sent_at:     nowIso,
      meta: { tier: tierToSend.dias, tono: tierToSend.tono, dias_desde_emision: dias },
    });

    summary.remindersEnviados++;

    // Tier 15 (final): notificar Nazre + marcar suspend_pending
    if (tierToSend.dias === 15 && !p.suspend_pending) {
      await supabase
        .from('centinelia_clientes')
        .update({ suspend_pending: true })
        .eq('id', p.cliente_id);

      await supabase.from('centinelia_billing').insert({
        cliente_id: p.cliente_id,
        tipo:       'suspension_alert',
        ciclo_key:  p.ciclo_key,
        related_uuid: p.cfdi_uuid,
        monto:      p.monto,
        meta: { razon: 'cfdi_emitido +15d sin pago_recibido', notificado_a: 'nazre' },
      });

      // Notificación interna a Nazre (vía Resend, no Titan — es correo interno de sistema)
      await sendEmail({
        to: cfg.emailContacto,
        subject: `[Centinelia] Cliente ${p.cliente_razon_social} — 15 días sin pago del ciclo ${p.ciclo_key}`,
        html: `<p><strong>Aviso interno de Nala</strong></p>
<p>Cliente <strong>${p.cliente_razon_social}</strong> (${p.cliente_rfc}) tiene el CFDI del ciclo <strong>${p.ciclo_key}</strong> por <strong>$${p.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> emitido hace <strong>${dias} días</strong> sin pago recibido.</p>
<p>Ya se le enviaron los 3 recordatorios escalados y se marcó como <code>suspend_pending=true</code>. Su UUID es <code>${p.cfdi_uuid}</code>.</p>
<p>Revisa en el admin qué hacer: contactarlo directo, extender plazo, o suspender el servicio de sus meerkats.</p>`,
      }).catch(() => { /* best effort */ });

      summary.suspensionesMarcadas++;
    }
  }

  return NextResponse.json(summary);
}
