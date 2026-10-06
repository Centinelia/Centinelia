// Expande columns_historico del config AC con los campos nuevos que llena
// Nami cuando procesa factura TRANE (introducido 2026-10-06 en vivo con Camila).
// Idempotente: si ya existe, no sobreescribe.

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';

// Mapeo canónico de nombres lógicos → headers reales del Excel de Camila
// (verificados contra la lista de columnas que devolvió el E2E anterior).
const EXTRA_COLS = {
  qb:            'QB',
  ano_compra:    'AÑO COMPRA',
  mes_compra:    'MES COMPRA',
  familia:       'FAMILIA',
  ref:           'REF',
  seer:          'SEER',
  volts:         'VOLTS',
  tonelada:      'TR',
  descripcion:   'DESCRIPCION',
  folio_compra:  'FACT TRANE',
  fecha_compra:  'EMITIDA',
  usd:           '$ USD',
  tc:            'TC',
  costo_mx:      'COSTO COMPRA (MX)',
  recibo2:       'RECIBO2',   // 2026-10-06: 1 cuando equipo llega físicamente (estatus → ALMACEN)
  control:       'CONTROL',   // 2026-10-06: 1 cuando equipo se entrega al cliente (estatus → ENTREGADO)
  salida:        'SALIDA',    // 2026-10-06: 1 cuando ALMACEN (sigue en bodega), 0 cuando ENTREGADO (ya salió)
  ano_venta:     'AÑO',       // 2026-10-06: año de la factura de venta
  mes_venta:     'MES',       // 2026-10-06: mes español mayúsculas de la factura de venta
  utilidad_mx:   'UTILIDAD (MX)',  // 2026-10-06: COSTO VTA (MX) - COSTO COMPRA (MX)
  factor:        'FACTOR',    // 2026-10-06: COSTO VTA (MX) / COSTO COMPRA (MX)
  fecha_oc:      'FECHA OC',  // 2026-10-06: fecha de la OC en QB (opcional, Camila dicta)
};

const { data: org } = await sb.from('organizations')
  .select('inventory_excel_config')
  .eq('portal_email', PORTAL).maybeSingle();

const current = org.inventory_excel_config.columns_historico ?? {};
console.log('── Current columns_historico keys ──');
console.log(' ', Object.keys(current).join(', '));

const merged = { ...current };
let added = 0;
for (const [k, v] of Object.entries(EXTRA_COLS)) {
  if (!merged[k]) {
    merged[k] = v;
    console.log(`  + ${k} → ${v}`);
    added++;
  } else if (merged[k] !== v) {
    console.log(`  ⚠ ${k} ya existe como "${merged[k]}", NO sobreescribo (si debería ser "${v}", editar a mano)`);
  }
}

if (added === 0) {
  console.log('\n✓ Nada que actualizar, ya está todo mapeado.');
  process.exit(0);
}

const updated = { ...org.inventory_excel_config, columns_historico: merged };
const { error } = await sb.from('organizations')
  .update({ inventory_excel_config: updated })
  .eq('portal_email', PORTAL);
if (error) { console.error('update err:', error); process.exit(1); }

const { data: verif } = await sb.from('organizations')
  .select('inventory_excel_config')
  .eq('portal_email', PORTAL).maybeSingle();
console.log('\n── Updated columns_historico keys ──');
console.log(' ', Object.keys(verif.inventory_excel_config.columns_historico).join(', '));
console.log('\n✓ Config actualizado:', added, 'mappings nuevos agregados');
