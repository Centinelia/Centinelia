export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import {
  weeklyReportHtml,
  welcomeHtml,
  newLeadHtml,
  minutesAlertHtml,
  reauthRequiredHtml,
} from '@/lib/email/send';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

const TEMPLATES: Record<string, () => string> = {
  'reauth-gmail': () => reauthRequiredHtml({
    businessName: 'Ferreteria El Clavo',
    provider:     'gmail',
    email:        'juan@ferreteriaelclavo.com',
    lastSyncAt:   new Date(Date.now() - 3 * 86_400_000).toISOString(),
    portalUrl:    `${APP_URL}/portal/demo-token`,
  }),
  'reauth-outlook': () => reauthRequiredHtml({
    businessName: 'Consultora Mendoza',
    provider:     'outlook',
    email:        'laura@consultoraMendoza.com',
    lastSyncAt:   null,
    portalUrl:    `${APP_URL}/portal/demo-token`,
  }),
  'weekly': () => weeklyReportHtml({
    businessName: 'Ferreteria El Clavo',
    portalUrl:    `${APP_URL}/portal/demo-token`,
    period:       '14 – 21 jul 2026',
    totalCalls:   47,
    leads:        12,
    appointments: 5,
    orders:       8,
    minutesUsed:  183,
    minutesTotal: 300,
    peakHour:     '10:00 – 11:00 h',
  }),
  'welcome': () => welcomeHtml({
    businessName: 'Ferreteria El Clavo',
    setupUrl:     `${APP_URL}/portal/demo-token/setup`,
  }),
  'new-lead': () => newLeadHtml({
    businessName:  'Ferreteria El Clavo',
    callerNumber:  '+52 81 1234 5678',
    nombre:        'Carlos Ramirez',
    servicio:      'Tornillos y anclajes industriales',
    whatsapp:      '+52 81 1234 5678',
    email:         null,
    summary:       'El cliente busca tornillos de acero inoxidable M8 en cantidad de 500 piezas para un proyecto de construccion. Dejo numero de WhatsApp para cotizacion.',
    outcome:       'lead_created',
    portalUrl:     `${APP_URL}/portal/demo-token`,
  }),
  'minutes-alert': () => minutesAlertHtml({
    businessName: 'Ferreteria El Clavo',
    pct:          85,
    used:         255,
    included:     300,
    resetDate:    '1 de agosto',
    portalUrl:    `${APP_URL}/portal/demo-token`,
  }),
  'minutes-paused': () => minutesAlertHtml({
    businessName: 'Ferreteria El Clavo',
    pct:          100,
    used:         300,
    included:     300,
    resetDate:    '1 de agosto',
    portalUrl:    `${APP_URL}/portal/demo-token`,
  }),
};

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const template = req.nextUrl.searchParams.get('t') ?? 'reauth-gmail';
  const fn = TEMPLATES[template];

  if (!fn) {
    const list = Object.keys(TEMPLATES).map(k => `<li><a href="?t=${k}">${k}</a></li>`).join('');
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:32px"><h2>Email previews</h2><ul>${list}</ul></body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    );
  }

  return new NextResponse(fn(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
