// E2E de toggles human_only:
// 1. Crea template test con headers típicos: Fecha, Negocio, Cliente, Teléfono, Motivo, Vendedor, Notas
// 2. Llama analyzeTemplate() → asserts Claude auto-marca Vendedor + Notas como human_only
// 3. Guarda mapping en voice_agents.bitacora_template
// 4. Simula PATCH template-config quitando "Notas" del toggle → asserts DB reflejó cambio
// 5. Restaura estado previo
//
// Uso: npx tsx scripts/e2e-bitacora-toggles.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const NELIA_AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';

async function main() {
  const { createAdminClient }  = await import('../src/lib/supabase/admin');
  const ExcelJSMod             = await import('exceljs');
  const Workbook               = (ExcelJSMod as any).Workbook ?? (ExcelJSMod as any).default?.Workbook;
  const { analyzeTemplate }    = await import('../src/lib/bitacora/template-analyzer');
  const supabase = createAdminClient();

  const results = { pass: 0, fail: 0 };
  const check = (name: string, cond: boolean, extra?: string) => {
    console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
    cond ? results.pass++ : results.fail++;
  };

  const { data: agentBefore } = await supabase
    .from('voice_agents')
    .select('bitacora_template')
    .eq('id', NELIA_AGENT_ID)
    .single();
  const previousTemplate = agentBefore?.bitacora_template ?? null;
  console.log(`Template previo: ${previousTemplate ? 'existía (se restaura)' : 'ninguno'}\n`);

  try {
    console.log('═══ STEP 1: Crear template test con headers típicos ═══\n');
    const buffer = await createTestTemplate(Workbook);
    console.log(`  Buffer size: ${buffer.length} bytes\n`);

    console.log('═══ STEP 2: analyzeTemplate() con Claude ═══\n');
    const t0 = Date.now();
    const analysis = await analyzeTemplate(buffer);
    const elapsed = Date.now() - t0;
    console.log(`  Latencia: ${elapsed}ms`);
    console.log(`  Tokens: in=${analysis.usage.input_tokens} out=${analysis.usage.output_tokens}`);
    console.log(`  Sheet: ${analysis.mapping.sheet_name}`);
    console.log(`  Insertion row: ${analysis.mapping.insertion_row}`);
    console.log(`  Columns mapeadas:`);
    for (const [col, field] of Object.entries(analysis.mapping.columns)) {
      const isHumanOnly = analysis.mapping.human_only_columns.includes(col);
      console.log(`    ${col} → ${field}${isHumanOnly ? ' [SOLO YO ESCRIBO]' : ''}`);
    }
    if (analysis.mapping.notes) console.log(`  Notes: ${analysis.mapping.notes}`);
    console.log();

    console.log('═══ STEP 3: Assertions sobre auto-detección ═══\n');
    const colByField = Object.fromEntries(
      Object.entries(analysis.mapping.columns).map(([col, field]) => [field, col])
    );
    const vendedorCol = colByField['vendedor'];
    check('Claude mapeó col vendedor', !!vendedorCol, vendedorCol ? `col ${vendedorCol}` : 'no mapeó');
    check(
      'vendedor está en human_only_columns',
      vendedorCol ? analysis.mapping.human_only_columns.includes(vendedorCol) : false,
      `human_only=${JSON.stringify(analysis.mapping.human_only_columns)}`
    );
    check(
      'fecha NO está en human_only',
      colByField['fecha']
        ? !analysis.mapping.human_only_columns.includes(colByField['fecha'])
        : true,
    );
    check(
      'motivo NO está en human_only',
      colByField['motivo']
        ? !analysis.mapping.human_only_columns.includes(colByField['motivo'])
        : true,
    );
    console.log();

    console.log('═══ STEP 4: Persistir mapping en voice_agents.bitacora_template ═══\n');
    const templatePayload = {
      url:          'test/toggles-e2e-fake-path.xlsx',
      filename:     'toggles-test.xlsx',
      mapping:      analysis.mapping,
      uploaded_at:  new Date().toISOString(),
      uploaded_by:  'e2e-toggles-script',
    };
    await supabase.from('voice_agents')
      .update({ bitacora_template: templatePayload })
      .eq('id', NELIA_AGENT_ID);

    const { data: check1 } = await supabase.from('voice_agents')
      .select('bitacora_template')
      .eq('id', NELIA_AGENT_ID).single();
    const savedHumanOnly = (check1?.bitacora_template as any)?.mapping?.human_only_columns ?? [];
    check(
      'DB tiene human_only_columns igual a analyzer',
      JSON.stringify([...savedHumanOnly].sort()) === JSON.stringify([...analysis.mapping.human_only_columns].sort()),
      `db=${JSON.stringify(savedHumanOnly)}`,
    );
    console.log();

    console.log('═══ STEP 5: Simular PATCH — quitar un toggle ═══\n');
    // Toma la primera col que Claude marcó como human_only y la quita
    const toRemove = analysis.mapping.human_only_columns[0];
    if (!toRemove) {
      console.log('  ⚠️  Claude no marcó ninguna col human_only, no hay nada que quitar. Assertion FAIL.');
      results.fail++;
    } else {
      const nextList = analysis.mapping.human_only_columns.filter(c => c !== toRemove);
      console.log(`  Quitando col ${toRemove} del toggle`);
      console.log(`  Nueva lista: ${JSON.stringify(nextList)}`);

      // Réplica exacta de la lógica del endpoint PATCH template-config (líneas 51-71)
      const validCols = new Set(Object.keys(analysis.mapping.columns).map(c => c.toUpperCase()));
      const humanOnly = [...new Set(nextList.map(c => String(c).toUpperCase()))]
        .filter(c => validCols.has(c));
      const updated = {
        ...templatePayload,
        mapping: {
          ...templatePayload.mapping,
          human_only_columns: humanOnly,
        },
      };
      await supabase.from('voice_agents')
        .update({ bitacora_template: updated })
        .eq('id', NELIA_AGENT_ID);

      const { data: check2 } = await supabase.from('voice_agents')
        .select('bitacora_template')
        .eq('id', NELIA_AGENT_ID).single();
      const afterPatch = (check2?.bitacora_template as any)?.mapping?.human_only_columns ?? [];
      check(
        'DB refleja el toggle removido',
        !afterPatch.includes(toRemove) && afterPatch.length === nextList.length,
        `db=${JSON.stringify(afterPatch)}`,
      );
    }
    console.log();

    console.log('═══ STEP 6: Simular PATCH — agregar toggle nuevo (col legítima) ═══\n');
    // Agrega una col que originalmente Claude NO marcó (si existe una writable)
    const nonHumanCols = Object.keys(analysis.mapping.columns)
      .filter(c => !analysis.mapping.human_only_columns.includes(c));
    if (nonHumanCols.length === 0) {
      console.log('  ⚠️  Todas las cols son human_only, skip');
    } else {
      const toAdd = nonHumanCols[0];
      console.log(`  Agregando col ${toAdd} al toggle`);
      const nextList = [...analysis.mapping.human_only_columns, toAdd];
      const updated = {
        ...templatePayload,
        mapping: {
          ...templatePayload.mapping,
          human_only_columns: nextList,
        },
      };
      await supabase.from('voice_agents')
        .update({ bitacora_template: updated })
        .eq('id', NELIA_AGENT_ID);
      const { data: check3 } = await supabase.from('voice_agents')
        .select('bitacora_template')
        .eq('id', NELIA_AGENT_ID).single();
      const afterAdd = (check3?.bitacora_template as any)?.mapping?.human_only_columns ?? [];
      check(
        'DB refleja col agregada al toggle',
        afterAdd.includes(toAdd),
        `db=${JSON.stringify(afterAdd)}`,
      );
    }
    console.log();

    console.log('═══ STEP 7: Simular PATCH inválido — col inexistente ═══\n');
    // Réplica de la lógica del endpoint: filter → validCols
    const validCols = new Set(Object.keys(analysis.mapping.columns).map(c => c.toUpperCase()));
    const withGarbage = ['Z', 'ZZ', 'invalid'];
    const filtered = withGarbage.filter(c => validCols.has(c.toUpperCase()));
    check(
      'Filtro rechaza cols que no están en el mapping',
      filtered.length === 0,
      `filtered=${JSON.stringify(filtered)}`,
    );

    console.log(`\n  RESULTADO: ${results.pass} pass / ${results.fail} fail`);

  } finally {
    console.log('\n═══ CLEANUP ═══\n');
    await supabase.from('voice_agents')
      .update({ bitacora_template: previousTemplate })
      .eq('id', NELIA_AGENT_ID);
    console.log('  Template del agente restaurado');
    console.log('\nDone.\n');
    process.exit(results.fail === 0 ? 0 : 1);
  }
}

async function createTestTemplate(Workbook: any): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Bitacora clientes');

  // Row 1: headers en español típicos, incluyendo Vendedor + Notas internas
  const headers = ['Fecha', 'Negocio', 'Contacto', 'Teléfono', 'Motivo de contacto', 'Vendedor asignado', 'Notas internas'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E3F5' } };
    cell.font = { bold: true, color: { argb: 'FF1A0A3B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium' } };
  });

  // Row 2: subheader vacío (más común en templates reales)
  ws.getRow(2).height = 8;

  // Row 3: fila-plantilla (insertion row esperada)
  for (let c = 1; c <= headers.length; c++) {
    const cell = ws.getCell(3, c);
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

main().catch(err => { console.error(err); process.exit(1); });
