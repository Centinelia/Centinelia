import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Tomorrow's date in YYYY-MM-DD (Supabase runs in UTC; close enough for daily reminders)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  const { data: appointments, error } = await supabase
    .from('appointments_voice')
    .select('id, agent_id, nombre, telefono, servicio, fecha, hora')
    .eq('fecha_iso', tomorrowISO)
    .eq('status', 'confirmada')
    .eq('reminder_sent', false)
    .not('telefono', 'is', null);

  if (error) {
    console.error('reminder cron: query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!appointments?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Appointment reminders via WhatsApp to customers are disabled (templates
  // sin aprobar en WhatsApp Business API). Cuando se reactiven, invocar
  // sendReminder(appointment) que envía + marca reminder_sent=true. Sin ese
  // UPDATE, filter WHERE reminder_sent=false devolvería el mismo appointment
  // MAÑANA otra vez y el cliente recibiría reminder duplicado 24h después.
  // Ver Scope C2 "appointment-reminders latent bug".
  //
  // Actualmente stub: NO envía, NO marca. Comportamiento preservado.
  // Al reactivar: descomentar el bloque abajo y agregar sendWhatsApp/sendEmail.
  //
  // async function sendReminder(app: typeof appointments[number]): Promise<boolean> {
  //   const msg = `Recordatorio: ${app.servicio ?? 'tu cita'} mañana a las ${app.hora}`;
  //   const ok = await sendWhatsApp(app.telefono!, msg);
  //   if (ok) {
  //     await supabase.from('appointments_voice')
  //       .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
  //       .eq('id', app.id);
  //   }
  //   return ok;
  // }
  // let sent = 0;
  // for (const app of appointments) { if (await sendReminder(app)) sent++; }
  // return NextResponse.json({ ok: true, sent, total: appointments.length, date: tomorrowISO });

  console.log(`appointment-reminders cron: ${appointments.length} pending for ${tomorrowISO}, skipped (WA disabled)`);
  return NextResponse.json({ ok: true, sent: 0, total: appointments.length, date: tomorrowISO });
}
