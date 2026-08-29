// E2E multi-intento renderer:
// 1. Seed un incident con 3 attempts (NC, NV, OK) en la misma semana en días distintos
// 2. Correr updateLiveWorkbook
// 3. Verificar que el grid de esa semana tiene 3 marcas: NC en día 1, NV en día 2, OK en día 3
// 4. Cleanup restaura estado previo
//
// Uso: npx tsx scripts/e2e-bitacora-multi-attempt.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL   = 'servicioalcliente@tortillaestrella.com.mx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { updateLiveWorkbook } = await import('../src/lib/bitacora/live-workbook');
  const { weekStartMonday, weekNumberInMonth } = await import('../src/lib/bitacora/schedule');
  const ExcelJSMod = await import('exceljs');
  const Workbook = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const supabase = createAdminClient();

  const results = { pass: 0, fail: 0 };
  const check = (name: string, cond: boolean, extra?: string) => {
    console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
    cond ? results.pass++ : results.fail++;
  };

  // Snapshot estado previo
  const { data: agentBefore } = await supabase
    .from('voice_agents')
    .select('bitacora_template')
    .eq('id', NELIA_AGENT_ID).single();
  const previousTemplate = agentBefore?.bitacora_template ?? null;
  if (!previousTemplate?.url) throw new Error('Nelia no tiene template — corre apply-suggestions primero');

  // Semana de test: Semana Lun-Dom que contiene el día actual
  const now = new Date();
  const weekMonday = weekStartMonday(now);
  const weekEnd = new Date(weekMonday); weekEnd.setDate(weekMonday.getDate() + 7);
  const weekNum = weekNumberInMonth(now);
  const monthKey = `${weekMonday.getFullYear()}-${String(weekMonday.getMonth() + 1).padStart(2, '0')}`;
  console.log(`Semana test: ${weekMonday.toISOString().slice(0,10)} .. ${weekEnd.toISOString().slice(0,10)} (Semana ${weekNum})`);

  // Días específicos dentro de la semana: Lunes, Miércoles, Viernes
  const monday = new Date(weekMonday);
  const wednesday = new Date(weekMonday); wednesday.setDate(weekMonday.getDate() + 2);
  const friday = new Date(weekMonday); friday.setDate(weekMonday.getDate() + 4);

  const testAttempts = [
    { called_at: monday.toISOString(),    result: 'sin_respuesta', notes: null },
    { called_at: wednesday.toISOString(), result: 'no_visitado',   notes: null },
    { called_at: friday.toISOString(),    result: 'ok',            notes: 'confirmado' },
  ];

  // Insertar incident de test
  const testIncident: any = {
    agent_id:                  NELIA_AGENT_ID,
    portal_email:              PORTAL_EMAIL,
    type:                      'queja',
    business_name:             'TEST MULTI-ATTEMPT',
    contact_phone:             '+528123456789',
    address:                   'test',
    motivo:                    'Test multi-intento',
    is_new_client:             false,
    verification_scheduled_at: wednesday.toISOString(),
    verification_called_at:    friday.toISOString(),
    verification_result:       'ok',
    verification_result_notes: 'confirmado',
    verification_attempts:     testAttempts,
    created_at:                monday.toISOString(),
    source_channel:            'voice',
  };
  const { data: inserted, error: insErr } = await supabase
    .from('client_incidents').insert(testIncident).select('id').single();
  if (insErr) throw new Error(`insert test incident: ${insErr.message}`);
  const testIncidentId = inserted!.id as string;
  console.log(`Test incident id: ${testIncidentId}\n`);

  try {
    // Descargar template
    const { data: tplData } = await supabase.storage
      .from('bitacora-templates').download(previousTemplate.url as string);
    if (!tplData) throw new Error('no se pudo bajar template');
    const templateBuffer = Buffer.from(await tplData.arrayBuffer());

    // Correr updateLiveWorkbook con una semana que contiene el incident
    const livePath = `${PORTAL_EMAIL}/${NELIA_AGENT_ID}/E2E-multi-${Date.now()}.xlsx`;
    const liveBuf = await updateLiveWorkbook({
      supabase,
      templateBuffer,
      livePath,
      mapping: previousTemplate.mapping as any,
      weeks: [{
        weekNumber: weekNum,
        weekStart:  weekMonday,
        weekEnd,
        incidents:  [{
          ...testIncident,
          id: testIncidentId,
        }] as any,
      }],
    });

    // Inspeccionar
    const wb = new Workbook();
    await wb.xlsx.load(liveBuf as any);
    const ws = wb.getWorksheet(`Semana ${weekNum}`);
    if (!ws) throw new Error(`sheet Semana ${weekNum} no encontrada`);

    // Encontrar la row del incident (col Q oculta con incident_id)
    let hiddenCol = 0;
    ws.getRow(1).eachCell({ includeEmpty: true }, (c: any, col: number) => {
      if (c.value === '_incident_id') hiddenCol = col;
    });
    if (!hiddenCol) throw new Error('col _incident_id no encontrada');

    let targetRow = 0;
    ws.eachRow({ includeEmpty: false }, (row: any, r: number) => {
      if (row.getCell(hiddenCol).value === testIncidentId) targetRow = r;
    });
    if (!targetRow) throw new Error('row del incident no encontrada');

    const grid = (previousTemplate.mapping as any).verification_grid;
    console.log(`Grid mapping: ${JSON.stringify(grid)}`);

    const colL = grid.L; // Lunes → esperamos NC
    const colMI = grid.MI; // Miércoles → esperamos NV
    const colV = grid.V; // Viernes → esperamos OK

    const colLetterToNumber = (letter: string) => {
      let n = 0;
      for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
      return n;
    };

    const valL = ws.getCell(targetRow, colLetterToNumber(colL)).value;
    const valMI = ws.getCell(targetRow, colLetterToNumber(colMI)).value;
    const valV = ws.getCell(targetRow, colLetterToNumber(colV)).value;
    const colM = grid.M;
    const colJ = grid.J;
    const colS = grid.S;
    const valM = ws.getCell(targetRow, colLetterToNumber(colM)).value;
    const valJ = ws.getCell(targetRow, colLetterToNumber(colJ)).value;
    const valS = ws.getCell(targetRow, colLetterToNumber(colS)).value;

    console.log(`\nGrid values on target row ${targetRow}:`);
    console.log(`  L (${colL}): ${JSON.stringify(valL)}`);
    console.log(`  M (${colM}): ${JSON.stringify(valM)}`);
    console.log(`  MI (${colMI}): ${JSON.stringify(valMI)}`);
    console.log(`  J (${colJ}): ${JSON.stringify(valJ)}`);
    console.log(`  V (${colV}): ${JSON.stringify(valV)}`);
    console.log(`  S (${colS}): ${JSON.stringify(valS)}\n`);

    check('Lunes tiene marca NC (sin_respuesta)',       valL === 'NC', `actual=${JSON.stringify(valL)}`);
    check('Martes vacío (sin intento)',                 valM == null || valM === '', `actual=${JSON.stringify(valM)}`);
    check('Miércoles tiene marca NV (no_visitado)',     valMI === 'NV', `actual=${JSON.stringify(valMI)}`);
    check('Jueves vacío (sin intento)',                 valJ == null || valJ === '', `actual=${JSON.stringify(valJ)}`);
    check('Viernes tiene marca OK (recibió)',           valV === 'OK', `actual=${JSON.stringify(valV)}`);
    check('Sábado vacío (sin intento)',                 valS == null || valS === '', `actual=${JSON.stringify(valS)}`);

    console.log(`\n  RESULTADO: ${results.pass} pass / ${results.fail} fail`);
  } finally {
    // Cleanup: borrar el incident de test
    await supabase.from('client_incidents').delete().eq('id', testIncidentId);
    console.log('\nCleanup: test incident borrado.');
    process.exit(results.fail === 0 ? 0 : 1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
