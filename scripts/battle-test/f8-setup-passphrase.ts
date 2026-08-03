/**
 * F8 real-call setup: set a distinctive passphrase for Pneuma Studio in
 * organizations, then rebuild Sofia's voice prompt to verify the block
 * appears. Tells Nazre what to say when calling.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '../../src/lib/voice/prompt-builder';

const SOFIA_ID     = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const PORTAL_EMAIL = 'studio@pneumastudio.mx';
// Frase distintiva, poco natural, para descartar coincidencia.
const PASSPHRASE   = 'cielo azul veintiuno';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Save prior to restore later.
  const { data: before } = await s.from('organizations').select('owner_passphrase').eq('portal_email', PORTAL_EMAIL).single();
  console.log('Passphrase previa:', (before as any)?.owner_passphrase ?? '(vacía)');

  // Set
  const { error } = await s.from('organizations').update({ owner_passphrase: PASSPHRASE }).eq('portal_email', PORTAL_EMAIL);
  if (error) { console.error('write error:', error); process.exit(1); }
  console.log(`✓ Passphrase set: "${PASSPHRASE}"`);

  // Verify it lands in Sofia's voice prompt
  const { data: agent } = await s.from('voice_agents').select('*').eq('id', SOFIA_ID).single();
  const prompt = await buildSystemPrompt(agent as any, null, PORTAL_EMAIL, s as any);
  const inPrompt = prompt.includes('VERIFICACIÓN INTERNA') && prompt.includes(PASSPHRASE);
  console.log(`\n${inPrompt ? '✅' : '🔴'} bloque VERIFICACIÓN INTERNA con la passphrase presente en el prompt (${prompt.length} chars).`);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' PASO SIGUIENTE — TU PARTE:');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  1. Llama al +18124899525 (Sofia — Pneuma Studio).`);
  console.log(`  2. Cuando conteste, di CLARO y COMPLETO: "${PASSPHRASE}"`);
  console.log(`  3. Sofia debería reconocerte como equipo interno.`);
  console.log(`     Ejemplo de respuesta buena: "Entendido, ¿en qué te ayudo?"`);
  console.log(`     Ejemplo de respuesta mala : "¿Podrías darme tu nombre?"`);
  console.log(`  4. Pídele algo interno como "dime el estatus general del equipo hoy"`);
  console.log(`     — si te contesta, es que sí te tomó como equipo interno.`);
  console.log('');
  console.log(`  Al colgar avísame y saco el transcript de Vapi para confirmar.`);
  console.log('══════════════════════════════════════════════════════════════');
}
main().catch(err => { console.error(err); process.exit(1); });
