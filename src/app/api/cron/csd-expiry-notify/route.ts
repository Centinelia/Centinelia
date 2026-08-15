// src/app/api/cron/csd-expiry-notify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

const WARN_DAYS = [30, 15, 7, 1];

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: orgs } = await supabase.from('organizations')
    .select('portal_email, invoicing_razon_social, invoicing_csd_expires_at')
    .not('invoicing_csd_expires_at', 'is', null);

  const now = Date.now();
  const notified: string[] = [];
  for (const o of orgs ?? []) {
    const days = Math.floor((Date.parse(o.invoicing_csd_expires_at!) - now) / 86400000);
    if (WARN_DAYS.includes(days)) {
      await sendEmail({
        to: o.portal_email,
        subject: `Tu CSD vence en ${days} día(s)`,
        html: `<p>El certificado de sello digital de <strong>${o.invoicing_razon_social ?? o.portal_email}</strong> vence en ${days} día(s). Renuévalo en el SAT y súbelo en el portal para evitar interrupciones de timbrado.</p>`,
        from: 'Centinelia <alerts@centinelia.mx>',
      }).catch(err => console.error('[csd-expiry-notify]', o.portal_email, err));
      notified.push(o.portal_email);
    }
  }
  return NextResponse.json({ notified });
}
