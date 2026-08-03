/**
 * F18 battle test: POST 3 real-looking samples to /brand-voice, verify guide
 * is generated, saved to organizations.brand_voice_guide, and appears inside
 * the voice prompt-builder output for Sofia.
 */
import { loadEnv } from './_env';
loadEnv();

import { createClient } from '@supabase/supabase-js';
import { createSession, PORTAL_COOKIE } from '../../src/lib/portal/auth';

const APP           = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const PORTAL_EMAIL  = 'studio@pneumastudio.mx';
const PORTAL_TOKEN  = '8892c013-b122-4f11-a9d4-e88a04aff732';

const SAMPLES = [
  // Sample 1 — website copy
  `En Pneuma Studio no vendemos plantillas. Cada tienda que armamos parte de cómo tu cliente real compra en tu categoría, no de lo que "se ve bien" en Behance. Diseño, integración de pagos, WhatsApp y Analytics: todo bajo un mismo techo, con un equipo que no rota. Si vas en serio con ecommerce en México, empezamos con una llamada de 30 minutos para entender qué te está frenando ahora mismo.`,

  // Sample 2 — cold email
  `Hola Ana, vi que abrieron su tienda hace 3 meses y ya andan corriendo con Shopify + WhatsApp Business. Nosotros llevamos 4 años metidos en catálogos MXN y sabemos dónde se atoran las conversiones cuando el checkout está mal armado. Te dejo abajo un caso reciente donde subimos +38% de conversión en 6 semanas. Si te sirve para el equipo, te agendo 20 minutos con Miguel esta semana. Sin filler.`,

  // Sample 3 — WhatsApp reply
  `Va, entendido Bruno. Te resumo: el paquete de Ecommerce arranca en $65k MXN e incluye migración de catálogo, pagos con SPEI + tarjeta, y 3 flujos de WhatsApp. Timing típico: 4 semanas de arranque. Te mando propuesta hoy en la noche con los 3 escenarios (base, intermedio, completo) y agendamos una llamada mañana o el jueves para aclarar dudas. Cualquier cosa me escribes por aquí.`,
];

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Snapshot before
  const { data: before } = await supabase
    .from('organizations')
    .select('brand_voice_guide, brand_voice_updated_at')
    .eq('portal_email', PORTAL_EMAIL)
    .single();
  console.log('BEFORE:', {
    hasGuide: !!before?.brand_voice_guide,
    updated:  before?.brand_voice_updated_at,
  });

  // Post samples
  const cookie = await createSession(PORTAL_EMAIL);
  const res = await fetch(`${APP}/api/portal/${PORTAL_TOKEN}/brand-voice`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `${PORTAL_COOKIE}=${cookie}` },
    body:    JSON.stringify({ samples: SAMPLES }),
  });
  const body = await res.json() as { ok?: boolean; guide?: string; error?: string };
  console.log(`HTTP ${res.status}`);
  if (!body.ok) {
    console.error('Extract failed:', body.error);
    process.exit(1);
  }
  console.log('\n--- GUIDE (first 500 chars) ---');
  console.log(body.guide?.slice(0, 500));

  // Verify DB
  const { data: after } = await supabase
    .from('organizations')
    .select('brand_voice_guide, brand_voice_updated_at')
    .eq('portal_email', PORTAL_EMAIL)
    .single();
  console.log('\nAFTER DB:', {
    hasGuide:  !!after?.brand_voice_guide,
    updated:   after?.brand_voice_updated_at,
    length:    after?.brand_voice_guide?.length ?? 0,
    matches:   after?.brand_voice_guide === body.guide,
  });

  // Voice prompt injection check — quick smoke: re-fetch guide and confirm it
  // would land in the "TONO DE MARCA" block via getBrandVoiceGuide.
  const { getBrandVoiceGuide } = await import('../../src/lib/brand/voice-guide');
  const reread = await getBrandVoiceGuide(PORTAL_EMAIL, supabase as any);
  console.log('\ngetBrandVoiceGuide() returns:', reread ? `${reread.length} chars, starts with: "${reread.slice(0, 60)}…"` : '(null)');
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
