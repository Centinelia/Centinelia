// Lee filas del INVENTARIO real con CLIENTE=STOCK y muestra qué campos tienen
// llenos vs vacíos para saber qué debe rellenar Nami cuando procesa una OC
// que es "solo stock".

import { createClient } from '@supabase/supabase-js';
if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');

console.log('── Leyendo INVENTARIO ──');
const rows = await adapter.listHistorico(ctx);
const stockRows = rows.filter(r => String(r.values.cliente ?? '').trim().toUpperCase() === 'STOCK');
console.log(`  Total rows: ${rows.length}`);
console.log(`  Rows con CLIENTE=STOCK: ${stockRows.length}`);

if (stockRows.length === 0) { console.log('No hay rows con STOCK para comparar.'); process.exit(0); }

// Muestra las últimas 5 filas STOCK (asumiendo son las más recientes/relevantes)
console.log('\n── Últimas 5 filas STOCK (campos no-vacíos) ──');
stockRows.slice(-5).forEach((r, i) => {
  console.log(`\nRow idx=${r.index}:`);
  for (const [k, v] of Object.entries(r.values)) {
    const s = String(v ?? '').trim();
    if (s && s !== '-' && s !== '0') {
      console.log(`  ${k.padEnd(16)} = ${JSON.stringify(v)}`);
    }
  }
});

// Agregado: qué columnas están llenas (count por columna) en todas las STOCK rows
console.log('\n── Columnas llenas en TODAS las filas STOCK (frecuencia) ──');
const colCounts = {};
for (const r of stockRows) {
  for (const [k, v] of Object.entries(r.values)) {
    const s = String(v ?? '').trim();
    const isFilled = s && s !== '-' && s !== '0';
    if (isFilled) colCounts[k] = (colCounts[k] ?? 0) + 1;
  }
}
const sorted = Object.entries(colCounts).sort((a, b) => b[1] - a[1]);
sorted.forEach(([k, n]) => {
  const pct = Math.round((n / stockRows.length) * 100);
  console.log(`  ${k.padEnd(16)} ${n}/${stockRows.length} (${pct}%)`);
});
