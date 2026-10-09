/**
 * Pre-arranque: verifica que las columnas del archivo real están mapeadas
 * en inventory_excel_config.columns_historico. Reporta:
 *   - Columnas visibles mapeadas (OK)
 *   - Columnas visibles NO mapeadas (ignoradas por Nami, info)
 *   - Columnas OCULTAS NO mapeadas (RIESGO si tienen valores estáticos:
 *     en inserts nuevos quedarán null; en patches sobrevivirán intactas)
 *   - Columnas config que no existen en el Excel (BUG config → ajustar)
 */
import './_bootstrap';

const PORTAL = process.argv[2] ?? 'camila@acproyectos.com';
const AGENT_ID = process.argv[3] ?? '3245bc1f-89e1-4949-bbed-71a18b05e344';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext(PORTAL, sb as any, AGENT_ID);
  if ('error' in ctx) { console.log('CTX ERR:', (ctx as any).message); return; }
  const inv = ctx as any;

  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  const metaRes = await fetch(`https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const meta = await metaRes.json() as any;
  console.log(`=== Diagnóstico pre-arranque: ${PORTAL} ===`);
  console.log(`Archivo: ${meta.name}`);

  // Listar TODAS las hojas (visible + hidden)
  const sheetsRes = await fetch(`https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/worksheets?$top=50`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const sheetsJson = await sheetsRes.json() as any;
  const sheets = (sheetsJson.value ?? []) as Array<{ name: string; visibility?: string }>;
  console.log(`\n=== Hojas del archivo (${sheets.length}) ===`);
  for (const s of sheets) {
    console.log(`  ${(s.visibility ?? 'Visible').toLowerCase() === 'visible' ? '👁 ' : '🔒 '} ${s.name}  [${s.visibility ?? 'Visible'}]`);
  }

  // Analizar la hoja histórica
  const histSheetName = inv.config.sheets.historico.name;
  const histTableName = inv.config.sheets.historico.table;
  const cols = inv.config.columns_historico as Record<string, string>;
  console.log(`\n=== Columnas de la hoja HISTÓRICA (${histSheetName}, tabla ${histTableName}) ===`);

  // Headers reales (de la tabla, no del rango — incluye TODAS las columnas visibles + hidden)
  const { GraphExcel } = await import('../src/lib/inventory/adapter');
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, histTableName);
  const headersLower = headers.map(h => h.trim().toLowerCase());

  // Column visibility: Graph expone columnVisible en /tables/{id}/columns
  const columnsMetaRes = await fetch(`https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/tables('${encodeURIComponent(histTableName)}')/columns?$top=200`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const columnsMeta = await columnsMetaRes.json() as any;
  const visibilityByName = new Map<string, boolean>();
  for (const c of (columnsMeta.value ?? [])) {
    // No existe "hidden" en table columns de Graph; chequeamos con getVisibleView vs columns
  }
  // Alternativa: comparar table.columns vs worksheet range hidden
  const hiddenRes = await fetch(`https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/worksheets/${encodeURIComponent(histSheetName)}/usedRange(valuesOnly=false)?$select=columnHidden,columnIndex,address`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const hiddenJson = await hiddenRes.json() as any;
  const columnHidden: boolean[] = Array.isArray(hiddenJson.columnHidden) ? hiddenJson.columnHidden : [];

  // Columnas del config: valores (nombres reales esperados) → logic keys
  const configByHeader = new Map<string, string>();
  for (const [logic, headerName] of Object.entries(cols)) {
    if (!headerName) continue;
    configByHeader.set(String(headerName).trim().toLowerCase(), logic);
  }

  console.log('\n--- Columnas en el Excel ---');
  let mapeadas = 0;
  let visiblesSinMapear = 0;
  let hiddenSinMapear = 0;
  for (let i = 0; i < headers.length; i++) {
    const name = headers[i];
    const isHidden = columnHidden[i] === true;
    const logic = configByHeader.get(name.trim().toLowerCase());
    const emoji = logic ? '✓' : (isHidden ? '🔒⚠' : '○');
    const label = logic
      ? `MAPEADA → ${logic}`
      : isHidden
        ? 'OCULTA + NO MAPEADA (RIESGO en inserts: null)'
        : 'visible, no mapeada (info)';
    console.log(`  ${emoji} [col ${i}] "${name}" ${isHidden ? '[HIDDEN]' : ''} → ${label}`);
    if (logic) mapeadas++;
    else if (isHidden) hiddenSinMapear++;
    else visiblesSinMapear++;
  }

  // Columnas del config que NO existen en el Excel (bug config)
  console.log('\n--- Columnas del config NO encontradas en el Excel ---');
  const notFound: string[] = [];
  for (const [headerName, logic] of configByHeader.entries()) {
    if (!headersLower.includes(headerName)) notFound.push(`${logic} → "${cols[logic]}"`);
  }
  if (notFound.length === 0) console.log('  ✓ Ninguna (todas las del config existen en el Excel)');
  else notFound.forEach(n => console.log(`  ✗ ${n}`));

  console.log('\n=== RESUMEN ===');
  console.log(`Columnas totales en Excel: ${headers.length}`);
  console.log(`  ✓ Mapeadas en config:          ${mapeadas}`);
  console.log(`  ○ Visibles sin mapear:         ${visiblesSinMapear}  (ignoradas por Nami, OK)`);
  console.log(`  🔒⚠ OCULTAS sin mapear:         ${hiddenSinMapear}  ${hiddenSinMapear > 0 ? '← REVISAR estas columnas antes de activar' : ''}`);
  console.log(`  ✗ Config sin match en Excel:   ${notFound.length}  ${notFound.length > 0 ? '← FIX config antes de activar' : ''}`);
  if (hiddenSinMapear > 0) {
    console.log('\n⚠ Riesgo: columnas ocultas no mapeadas quedarán VACÍAS en inserts nuevos de Nami.');
    console.log('   Si tienen fórmulas Excel las preserva. Si tienen valores estáticos los pisa.');
    console.log('   Decide por cada: (a) agregar al config si Nami debe llenarlas, (b) dejar como está si Camila las llena manual.');
  }
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
