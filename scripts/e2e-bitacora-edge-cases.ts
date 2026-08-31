// E2E de casos borde del sistema de bitácora:
//   1. Rango cross-month (semana Lun-Dom que cruza dos meses)
//   2. Idempotencia deliveries (mismo sábado no manda 2 veces)
//   3. Portal edit + preservación de manual edits en next cron run
//   4. Leyenda del grid: se escribe una vez, no duplica en re-runs
//
// Uso: npx tsx scripts/e2e-bitacora-edge-cases.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';
const TEST_TAG       = `E2E-EDGE-${Date.now()}`;

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { updateLiveWorkbook } = await import('../src/lib/bitacora/live-workbook');
  const { weekStartMonday } = await import('../src/lib/bitacora/schedule');
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const supabase = createAdminClient();

  const results = { pass: 0, fail: 0 };
  const check = (name: string, cond: boolean, extra?: string) => {
    console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
    cond ? results.pass++ : results.fail++;
  };

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, bitacora_template')
    .eq('id', NELIA_AGENT_ID).single();
  if (!agent?.bitacora_template) throw new Error('Nelia sin template');
  const template = agent.bitacora_template as any;

  const { data: tplData } = await supabase.storage
    .from('bitacora-templates').download(template.url);
  if (!tplData) throw new Error('template download failed');
  const templateBuffer = Buffer.from(await tplData.arrayBuffer());

  const testIncidentIds: string[] = [];
  const testLivePaths: string[] = [];

  try {
    // ══════════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 1: Rango semanal cross-month (28 AGO - 3 SEP) ═══\n');
    // Semana que empieza lunes 25-ago-2026 (Semana 4 de agosto) — pero elegimos
    // la semana que ARRANCA lunes 31-ago (cruza a septiembre)
    const monday_31aug = new Date(2026, 7, 31);  // Aug 31 = Lunes
    monday_31aug.setHours(0, 0, 0, 0);
    const sunday_6sep = new Date(monday_31aug);
    sunday_6sep.setDate(monday_31aug.getDate() + 7);

    const inc = {
      agent_id: NELIA_AGENT_ID,
      portal_email: PORTAL_EMAIL,
      type: 'queja' as const,
      business_name: `${TEST_TAG} Cross-month`,
      contact_phone: '+528100000010',
      address: 'Zaragoza 111',
      motivo: 'Test cross-month',
      is_new_client: false,
      created_at: new Date(monday_31aug.getTime() + 86400*1000).toISOString(),  // martes
      source_channel: 'voice',
      verification_scheduled_at: null,
      verification_called_at: null,
      verification_result: null,
      verification_result_notes: null,
      verification_attempts: [],
    };
    const { data: incRow } = await supabase.from('client_incidents').insert(inc).select('id').single();
    testIncidentIds.push(incRow!.id);

    const livePath1 = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/E2E-crossmonth-${Date.now()}.xlsx`;
    testLivePaths.push(livePath1);
    const buf1 = await updateLiveWorkbook({
      supabase,
      templateBuffer,
      livePath: livePath1,
      mapping: template.mapping,
      weeks: [{
        weekNumber: 1,
        weekStart: monday_31aug,
        weekEnd: sunday_6sep,
        incidents: [{ ...inc, id: incRow!.id } as any],
      }],
    });
    const wb1 = new Workbook();
    await wb1.xlsx.load(buf1 as any);
    const ws1 = wb1.getWorksheet('Semana 1')!;
    // El rango se inyecta en row 2 J-P (row 1 tiene el título estático)
    let foundRange: string | null = null;
    for (let c = 10; c <= 16; c++) {
      const v = ws1.getRow(2).getCell(c).value;
      if (typeof v === 'string' && v.length > 2) { foundRange = v; break; }
    }
    check('rango incluye AGO', foundRange?.includes('AGO') ?? false, `actual="${foundRange}"`);
    check('rango incluye SEP', foundRange?.includes('SEP') ?? false, `actual="${foundRange}"`);
    check('rango con formato "X AGO - Y SEP"',
      /\d+ AGO - \d+ SEP/.test(foundRange ?? ''),
      `actual="${foundRange}"`);

    // ══════════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 2: Idempotencia deliveries (unique constraint) ═══\n');
    const testAgentId = NELIA_AGENT_ID;
    const weekStartStr = '2026-09-07';  // random week
    // Cleanup previo
    await supabase.from('bitacora_weekly_deliveries')
      .delete().eq('agent_id', testAgentId).eq('week_start', weekStartStr);

    const insertFirst = await supabase.from('bitacora_weekly_deliveries').insert({
      agent_id: testAgentId,
      week_start: weekStartStr,
      recipients: ['test@e2e.com'],
      included_monthly: false,
    });
    check('primer insert exitoso', insertFirst.error == null);

    const insertSecond = await supabase.from('bitacora_weekly_deliveries').insert({
      agent_id: testAgentId,
      week_start: weekStartStr,
      recipients: ['test@e2e.com'],
      included_monthly: false,
    });
    check('segundo insert falla por unique constraint',
      insertSecond.error !== null && insertSecond.error.code === '23505',
      insertSecond.error?.code ?? 'no error');

    // cleanup
    await supabase.from('bitacora_weekly_deliveries')
      .delete().eq('agent_id', testAgentId).eq('week_start', weekStartStr);

    // ══════════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 3: Portal edit preservado en next cron run ═══\n');
    // First run: crear live con 1 incident
    const monday_a = new Date(2026, 7, 24);  // 24-ago Lunes
    monday_a.setHours(0, 0, 0, 0);
    const sunday_a = new Date(monday_a); sunday_a.setDate(monday_a.getDate() + 7);

    const incPortal = {
      ...inc,
      business_name: `${TEST_TAG} Portal edit`,
      contact_phone: '+528100000011',
      created_at: new Date(monday_a.getTime() + 86400*1000).toISOString(),
    };
    const { data: incPortalRow } = await supabase.from('client_incidents').insert(incPortal).select('id').single();
    testIncidentIds.push(incPortalRow!.id);

    const livePath2 = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/E2E-portal-${Date.now()}.xlsx`;
    testLivePaths.push(livePath2);
    const buf2a = await updateLiveWorkbook({
      supabase, templateBuffer, livePath: livePath2, mapping: template.mapping,
      weeks: [{
        weekNumber: 2, weekStart: monday_a, weekEnd: sunday_a,
        incidents: [{ ...incPortal, id: incPortalRow!.id } as any],
      }],
    });
    await supabase.storage.from('bitacora-live').upload(livePath2, buf2a, { upsert: true } as any);

    // Cliente edita: agrega vendedor + row manual
    const wb2 = new Workbook(); await wb2.xlsx.load(buf2a as any);
    const ws2 = wb2.getWorksheet('Semana 2')!;
    // Buscar row del incident (col Q oculta con id)
    let targetRow = 0;
    ws2.eachRow({ includeEmpty: false }, (row: any, r: number) => {
      if (row.getCell(17).value === incPortalRow!.id) targetRow = r;
    });
    if (!targetRow) throw new Error('incident row no encontrada');
    // Edición 1: col I vendedor (mapping human_only)
    ws2.getCell(targetRow, 9).value = 'JUAN E2E';
    // Edición 2: agregar row manual DESPUÉS del incident (sin id oculto)
    const manualRow = targetRow + 1;
    ws2.getCell(manualRow, 3).value = 'Nota manual del jefe';
    const editedBuf = Buffer.from(await wb2.xlsx.writeBuffer());
    await supabase.storage.from('bitacora-live').upload(livePath2, editedBuf, { upsert: true } as any);

    // Second run: mismo incident, verificar que vendedor + nota manual persisten
    const buf2b = await updateLiveWorkbook({
      supabase, templateBuffer, livePath: livePath2, mapping: template.mapping,
      weeks: [{
        weekNumber: 2, weekStart: monday_a, weekEnd: sunday_a,
        incidents: [{ ...incPortal, id: incPortalRow!.id } as any],
      }],
    });
    const wb3 = new Workbook(); await wb3.xlsx.load(buf2b as any);
    const ws3 = wb3.getWorksheet('Semana 2')!;
    let targetRow3 = 0;
    ws3.eachRow({ includeEmpty: false }, (row: any, r: number) => {
      if (row.getCell(17).value === incPortalRow!.id) targetRow3 = r;
    });
    check('vendedor "JUAN E2E" (human_only) preservado',
      ws3.getCell(targetRow3, 9).value === 'JUAN E2E');
    let foundManual = false;
    ws3.eachRow({ includeEmpty: false }, (row: any) => {
      if (row.getCell(3).value === 'Nota manual del jefe') foundManual = true;
    });
    check('row manual del cliente preservada', foundManual);

    // ══════════════════════════════════════════════════════════════════
    console.log('\n═══ TEST 4: Legend no duplica en re-runs ═══\n');
    // El buf2b tiene 1 legend row. Re-run debería seguir con 1, no acumular.
    await supabase.storage.from('bitacora-live').upload(livePath2, buf2b, { upsert: true } as any);
    const buf2c = await updateLiveWorkbook({
      supabase, templateBuffer, livePath: livePath2, mapping: template.mapping,
      weeks: [{
        weekNumber: 2, weekStart: monday_a, weekEnd: sunday_a,
        incidents: [{ ...incPortal, id: incPortalRow!.id } as any],
      }],
    });
    const wb4 = new Workbook(); await wb4.xlsx.load(buf2c as any);
    const ws4 = wb4.getWorksheet('Semana 2')!;
    let legendCount = 0;
    ws4.eachRow({ includeEmpty: false }, (row: any) => {
      if (row.getCell(17).value === '__LEGEND_GRID__') legendCount++;
    });
    check('legend row aparece exactamente 1 vez (no duplica)', legendCount === 1, `count=${legendCount}`);

    console.log(`\n  RESULTADO: ${results.pass} pass / ${results.fail} fail\n`);
  } finally {
    console.log('═══ CLEANUP ═══');
    if (testIncidentIds.length > 0) {
      await supabase.from('client_incidents').delete().in('id', testIncidentIds);
      console.log(`  Removed ${testIncidentIds.length} test incidents`);
    }
    if (testLivePaths.length > 0) {
      await supabase.storage.from('bitacora-live').remove(testLivePaths);
      console.log(`  Removed ${testLivePaths.length} test live files`);
    }
    process.exit(results.fail === 0 ? 0 : 1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
