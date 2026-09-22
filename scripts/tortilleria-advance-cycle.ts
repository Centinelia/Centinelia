// Adelanta fecha_proxima_facturacion de Tortilleria al 2026-10-01 para
// que el proximo cron neka-billing-cycle procese el ciclo 2026-10 (que
// no tiene cfdi_emitido previo) y dispare el notify a Nazre.
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenvConfig({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: existing } = await supabase
    .from('centinelia_billing')
    .select('id, tipo, ciclo_key, cfdi_uuid, created_at')
    .eq('cliente_id', '4c449e15-f5a3-43af-b3e9-e9472639933f')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Ultimos eventos en centinelia_billing para Tortilleria:');
  console.table(existing);

  const { data: after, error } = await supabase
    .from('centinelia_clientes')
    .update({ fecha_proxima_facturacion: '2026-10-01' })
    .eq('rfc', 'TEN010518AL3')
    .select('fecha_proxima_facturacion')
    .single();
  if (error) throw error;
  console.log('\nfecha_proxima_facturacion =>', after.fecha_proxima_facturacion);
}

main().catch(e => { console.error(e); process.exit(1); });
