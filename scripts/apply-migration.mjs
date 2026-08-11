// Aplica un archivo .sql a Supabase remoto usando service role.
// Uso: `npx dotenv-cli -e .env.local -- node scripts/apply-migration.mjs migrations/20260810_org_portal_password.sql`

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const path = process.argv[2];
if (!path) { console.error('usage: node apply-migration.mjs <path.sql>'); process.exit(1); }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const sql = readFileSync(path, 'utf8');

// Supabase JS client no expone execute raw SQL — usamos REST API con POST
// a /pg (postgres-meta) que Supabase Studio usa internamente.
const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type':  'application/json',
    'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ sql }),
});

if (!res.ok) {
  console.error(`FAIL ${res.status}:`, await res.text());
  console.error('Note: `exec_sql` RPC may not exist. Alternative: run manually in Supabase dashboard SQL editor.');
  process.exit(1);
}

console.log('OK', await res.text());
