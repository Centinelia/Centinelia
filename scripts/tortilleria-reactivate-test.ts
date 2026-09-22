// scripts/tortilleria-reactivate-test.ts
//
// Reactiva a Tortilleria Estrella con correo TEST (nazre20@gmail.com) y
// fecha_proxima_facturacion = HOY, para que la proxima corrida del cron
// neka-billing-cycle la procese en modo NEKA_NOTIFY_ONLY.
//
// SEGURO: usa correo test (nazre20@gmail.com), no manda nada a Beatriz.
// Despues del test exitoso, correr manualmente:
//   UPDATE centinelia_clientes SET correo_facturacion='Ramonleang@icloud.com',
//     fecha_proxima_facturacion='2026-09-21' WHERE rfc='TEN010518AL3';

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const hoy = new Date().toISOString().slice(0, 10);

  const { data: before } = await supabase
    .from('centinelia_clientes')
    .select('id, rfc, razon_social, activo, correo_facturacion, fecha_proxima_facturacion')
    .eq('rfc', 'TEN010518AL3')
    .maybeSingle();

  if (!before) { console.error('Tortilleria no existe en centinelia_clientes'); process.exit(1); }

  console.log('ANTES:', before);

  const { data: after, error } = await supabase
    .from('centinelia_clientes')
    .update({
      activo:                    true,
      correo_facturacion:        'nazre20@gmail.com',
      fecha_proxima_facturacion: hoy,
    })
    .eq('rfc', 'TEN010518AL3')
    .select()
    .single();

  if (error) throw error;
  console.log('\nDESPUES:', {
    activo: after.activo,
    correo_facturacion: after.correo_facturacion,
    fecha_proxima_facturacion: after.fecha_proxima_facturacion,
  });
  console.log('\nOK. Cron neka-billing-cycle en modo NEKA_NOTIFY_ONLY procesara Tortilleria en su proxima corrida.');
}

main().catch(e => { console.error(e); process.exit(1); });
