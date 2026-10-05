// Setea trane_contacts en inventory_excel_config de AC Proyectos.
// Camila confirmó 2026-10-05: isabel.galvan@trane.com (misma dirección
// para registrar OC y para solicitar entrega).
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/set-trane-contacts-ac.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const ISABEL = 'isabel.galvan@trane.com';

const { data: org, error: readErr } = await sb
  .from('organizations')
  .select('inventory_excel_config')
  .eq('portal_email', PORTAL)
  .maybeSingle();
if (readErr) { console.error('read err:', readErr); process.exit(1); }

const cfg = org?.inventory_excel_config ?? {};
console.log('── Config actual ──');
console.log('  trane_contacts:', JSON.stringify(cfg.trane_contacts ?? null));

const updated = {
  ...cfg,
  trane_contacts: {
    ...(cfg.trane_contacts ?? {}),
    registro_oc:        ISABEL,
    solicitar_entrega:  ISABEL,
  },
};

const { error: upErr } = await sb
  .from('organizations')
  .update({ inventory_excel_config: updated })
  .eq('portal_email', PORTAL);
if (upErr) { console.error('update err:', upErr); process.exit(1); }

const { data: verif } = await sb
  .from('organizations')
  .select('inventory_excel_config')
  .eq('portal_email', PORTAL)
  .maybeSingle();
console.log('\n── Config actualizada ──');
console.log('  trane_contacts:', JSON.stringify(verif.inventory_excel_config.trane_contacts));
console.log('\n✓ DONE. Nami ya sabe que Isabel es ' + ISABEL + '.');
console.log('  Camila ya no tiene que dictar el correo cuando pida los borradores.');
