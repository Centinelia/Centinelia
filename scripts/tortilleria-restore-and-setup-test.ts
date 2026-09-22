// Prepara el cliente test XAXX010101000 con conceptos + fecha_proxima=hoy
// para que el cron neka-billing-cycle lo notifique en el ciclo 2026-09.
// Restaura Tortilleria a activo=false + fecha original.
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenvConfig({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1. Restaurar Tortilleria (le quitamos el trigger de test)
  const { data: tort } = await supabase
    .from('centinelia_clientes')
    .update({ activo: false, fecha_proxima_facturacion: '2026-10-15' })
    .eq('rfc', 'TEN010518AL3')
    .select('rfc, activo, fecha_proxima_facturacion')
    .single();
  console.log('Tortilleria restaurada:', tort);

  // 2. Configurar cliente TEST con conceptos + activo + hoy
  const { data: test } = await supabase
    .from('centinelia_clientes')
    .update({
      activo:                    true,
      fecha_proxima_facturacion: '2026-09-15',
      correo_facturacion:        'nazre20@gmail.com',
      conceptos: [
        { descripcion: 'Empleado digital Nia (TEST)', valor_unitario: 10000, cantidad: 1, con_iva: true },
        { descripcion: 'Jornada mensual (TEST)',      valor_unitario: 1988,  cantidad: 1, con_iva: true },
      ],
    })
    .eq('rfc', 'XAXX010101000')
    .select()
    .single();

  console.log('\nCliente TEST activo:', {
    rfc: test.rfc, razon_social: test.razon_social,
    activo: test.activo,
    fecha_proxima_facturacion: test.fecha_proxima_facturacion,
    conceptos: test.conceptos,
  });

  console.log('\nOK. Ahora curl al cron y deberia notificar al TEST client con ciclo 2026-09.');
}

main().catch(e => { console.error(e); process.exit(1); });
