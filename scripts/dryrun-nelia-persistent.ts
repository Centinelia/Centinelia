// Dry-run del flow persistente para Nelia: descarga template, corre updateLiveWorkbook,
// guarda el output en disco. NO sube al bucket ni manda correo.
// Sirve para inspeccionar visualmente el archivo antes de que dispare el cron real.
//
// Uso: npx tsx scripts/dryrun-nelia-persistent.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import fs from 'node:fs';

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { updateLiveWorkbook } = await import('../src/lib/bitacora/live-workbook');
  const { weekStartMonday, monthStart, weekNumberInMonth, saturdaysInMonthUpTo, nowInMX } =
    await import('../src/lib/bitacora/schedule');
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, bitacora_template')
    .eq('id', NELIA_AGENT_ID)
    .single();

  const template = agent?.bitacora_template as any;
  if (!template?.url || !template.mapping) throw new Error('Nelia no tiene template custom');

  console.log(`Template: ${template.filename}`);
  console.log(`Sheet target: ${template.mapping.sheet_name}`);
  console.log(`Insertion row: ${template.mapping.insertion_row}`);
  console.log(`Cols mapeadas: ${Object.keys(template.mapping.columns).length}`);
  console.log(`Grid: ${template.mapping.verification_grid ? JSON.stringify(template.mapping.verification_grid) : 'no'}`);
  console.log(`Human only: ${JSON.stringify(template.mapping.human_only_columns)}\n`);

  const { data: tplData, error: tplErr } = await supabase.storage
    .from('bitacora-templates')
    .download(template.url);
  if (tplErr || !tplData) throw new Error(`template download: ${tplErr?.message}`);
  const templateBuffer = Buffer.from(await tplData.arrayBuffer());
  console.log(`Template buffer: ${templateBuffer.length} bytes\n`);

  const currentDate = nowInMX().date;
  const mStart = monthStart(currentDate);
  const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
  const livePath = `${agent.portal_email}/${NELIA_AGENT_ID}/${monthKey}-DRYRUN.xlsx`;
  console.log(`Live path (dryrun): ${livePath}\n`);

  const sats = saturdaysInMonthUpTo(currentDate);
  const weeks = [];
  for (const sat of sats) {
    const weekMonday = weekStartMonday(sat);
    const weekEnd = new Date(weekMonday); weekEnd.setDate(weekMonday.getDate() + 7);
    const { data: weekIncidents } = await supabase
      .from('client_incidents')
      .select('*')
      .eq('agent_id', NELIA_AGENT_ID)
      .gte('created_at', weekMonday.toISOString())
      .lt('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: true });
    weeks.push({
      weekNumber: weekNumberInMonth(sat),
      weekStart:  weekMonday,
      weekEnd,
      incidents:  (weekIncidents ?? []) as any,
    });
    console.log(`Semana ${weekNumberInMonth(sat)} (sáb ${sat.toISOString().slice(0,10)}): ${weekIncidents?.length ?? 0} incidents`);
  }
  console.log();

  const liveBuf = await updateLiveWorkbook({
    supabase,
    templateBuffer,
    livePath,
    mapping: template.mapping,
    weeks,
  });

  const outPath = `C:/Users/Nazre/Downloads/nelia-dryrun-${Date.now()}.xlsx`;
  fs.writeFileSync(outPath, liveBuf);
  console.log(`Buffer: ${liveBuf.length} bytes`);
  console.log(`Guardado en: ${outPath}`);

  // Inspección: contar rows con data en cada sheet
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const wb = new Workbook();
  await wb.xlsx.load(liveBuf as any);
  console.log(`\nSheets en el archivo generado:`);
  for (const ws of wb.worksheets) {
    let dataRows = 0;
    let firstRowSample = '';
    ws.eachRow({ includeEmpty: false }, (row: any, r: number) => {
      if (r < template.mapping.insertion_row) return;
      dataRows++;
      if (dataRows === 1) {
        const cells: string[] = [];
        for (let c = 1; c <= 20; c++) {
          const v = row.getCell(c).value;
          if (v != null && v !== '') cells.push(`${String.fromCharCode(64+c)}=${v}`);
        }
        firstRowSample = cells.join(' | ');
      }
    });
    console.log(`  ${ws.name}: ${dataRows} data rows`);
    if (firstRowSample) console.log(`    primer row: ${firstRowSample}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
