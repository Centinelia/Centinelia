/**
 * Verificación en vivo: lee la config real de Nelia desde DB y confirma que
 * el helper `shouldSendBitacoraNow` matchea en las 5 horas del sábado
 * (14..18 MX). Prueba adicional de que el fix estructural cubre el caso que
 * falló el 2026-09-12.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { shouldSendBitacoraNow, type BitacoraConfig } from '@/lib/bitacora/weekly-flow';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, bitacora_weekly_config')
    .eq('id', 'e22fbc64-c01c-4184-8365-62e423052d7a')
    .maybeSingle();

  if (!data) { console.error('Nelia no encontrada'); process.exit(1); }

  const cfg = data.bitacora_weekly_config as BitacoraConfig;
  console.log(`\nConfig actual de ${data.agent_name} (${data.business_name}):`);
  console.log(`  day_of_week: ${cfg.day_of_week} (6=sábado)`);
  console.log(`  hour:        ${cfg.hour}`);
  console.log(`  enabled:     ${cfg.enabled}`);
  console.log(`  recipients:  ${JSON.stringify(cfg.recipients)}`);
  console.log('');

  const rows: Array<{ dia: string; hora: number; matchea: string }> = [];
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  for (const dow of [5, 6, 0]) { // viernes, sábado, domingo
    for (const hour of [13, 14, 15, 16, 17, 18, 19]) {
      const res = shouldSendBitacoraNow(cfg, dow, hour);
      rows.push({ dia: dias[dow], hora: hour, matchea: res ? 'SÍ' : 'no' });
    }
  }

  console.log('Simulación de matcheo día × hora:');
  console.log('  día  hora  matchea?');
  for (const r of rows) {
    const bold = r.matchea === 'SÍ' ? '  ★ ' : '    ';
    console.log(`${bold}${r.dia}   ${r.hora}h    ${r.matchea}`);
  }
  console.log('');

  const matches = rows.filter(r => r.matchea === 'SÍ');
  console.log(`Total slots que envían: ${matches.length}`);
  console.log(`Esperado: 5 (sábado 14, 15, 16, 17, 18)`);
  if (matches.length === 5 && matches.every(m => m.dia === 'Sáb' && m.hora >= 14 && m.hora <= 18)) {
    console.log('✔ FIX VERIFICADO CONTRA CONFIG DE PRODUCCIÓN');
  } else {
    console.error('✘ Match inesperado');
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
