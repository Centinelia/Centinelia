/**
 * F6 real-flow setup: create a fake civic_report row so Nazre puede probar
 * el upload público desde el celular. Nia municipal (nara) daría el folio
 * en una llamada real; aquí lo cocinamos para saltarnos ese paso.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905'; // usar Sofia como agent_id porque no hay nara en Pneuma Studio

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const folio = `TEST-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await s.from('civic_reports').insert({
    agent_id:      SOFIA_ID,
    folio,
    category:      'alumbrado',
    description:   'BATTLE TEST F6 — reporte de prueba para verificar upload de fotos. Bache grande en la esquina de la calle Test con Battle.',
    location_text: 'Calle Test #123, Col. Battle Test, Monterrey NL',
    caller_name:   'Nazre Battle Test',
    caller_number: '+528124899525',
    status:        'abierto',
  }).select('id, folio').single();

  if (error) { console.error('insert error:', error); process.exit(1); }

  const appUrl = 'https://www.centinelia.mx';
  const attachUrl = `${appUrl}/r/${data.folio}/adjuntar`;

  console.log(`✓ Reporte creado: folio ${data.folio} (id=${data.id})`);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' PASO SIGUIENTE — TU PARTE:');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  1. Abre en tu CELULAR (para probar upload móvil):`);
  console.log(`     ${attachUrl}`);
  console.log(`  2. Debe cargar página "Reporte ciudadano — Folio ${data.folio}"`);
  console.log(`     con la descripción del bache y el input para subir foto.`);
  console.log(`  3. Toca "Choose file" → toma una foto o elige una de galería.`);
  console.log(`  4. Toca "Subir foto" → debe salir "¡Listo! Tu foto se subió correctamente."`);
  console.log(`  5. Prueba subir 4-5 fotos más para llegar al cap de 5.`);
  console.log(`  6. Al 6to intento debe rechazarlo con "Máximo 5 archivos por reporte."`);
  console.log('');
  console.log(`  Al terminar avísame y verifico las fotos en Supabase Storage + row en DB.`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`\n(Para cleanup después: report_id=${data.id}, folio=${data.folio})`);
}
main().catch(err => { console.error(err); process.exit(1); });
