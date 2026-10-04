// Seed +524812092229 (bot marcador — pedido Ramón 2026-10-03) para
// Tortillería Estrella en la tabla blocked_numbers.
//
// REQUISITO: migrations/20261003_blocked_numbers.sql ya aplicada en Supabase
// (via SQL Editor del dashboard — no hay exec_sql RPC en este proyecto).
//
// Uso:
//   npx dotenv-cli -e .env.local -- node scripts/apply-blocked-numbers-tortilleria.mjs
//
// Pasos:
//   1. Verifica portal_email de Tortillería (via voice_agents).
//   2. Confirma que la tabla blocked_numbers exista.
//   3. Inserta +524812092229 como bloqueado via Supabase REST (idempotente).
//   4. Confirma el bloqueo con SELECT.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function execSql(sql, label) {
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
    const text = await res.text();
    throw new Error(`${label} failed (${res.status}): ${text}\nNote: exec_sql RPC may not exist. Run migration via Supabase SQL Editor.`);
  }
  console.log(`✓ ${label}`);
  return res;
}

async function main() {
  // 1. Verificar Tortillería (business_name vive en voice_agents, no en organizations)
  console.log('→ Buscando portal_email de Tortillería via voice_agents...');
  const { data: agents, error: agErr } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, active')
    .ilike('business_name', '%tortill%');

  if (agErr) throw agErr;
  if (!agents || agents.length === 0) {
    throw new Error('No se encontró ningún agente con business_name LIKE "%tortill%".');
  }

  console.log('Candidatos:');
  for (const a of agents) {
    console.log(`  - ${a.portal_email} — ${a.business_name} — active:${a.active}`);
  }

  const prodEmail = 'servicioalcliente@tortillasestrella.com.mx';
  const prodMatch = agents.find(a => a.portal_email === prodEmail);
  if (!prodMatch) {
    throw new Error(`No se encontró agente con portal_email=${prodEmail}. Candidatos arriba.`);
  }
  const target = { portal_email: prodEmail };
  console.log(`→ Target: ${target.portal_email}`);

  // 2. Verificar que la tabla exista
  const probe = await supabase.from('blocked_numbers').select('id').limit(1);
  if (probe.error) {
    if (probe.error.message?.includes('does not exist') || probe.error.code === 'PGRST205' || probe.error.code === '42P01') {
      throw new Error(
        'La tabla blocked_numbers NO existe aún. Antes de correr este script:\n' +
        '  1. Abre Supabase → SQL Editor\n' +
        '  2. Pega el contenido de migrations/20261003_blocked_numbers.sql\n' +
        '  3. Run\n' +
        '  4. Vuelve a correr este script.'
      );
    }
    throw probe.error;
  }
  console.log('✓ Tabla blocked_numbers existe');

  // 3. Insert via REST (idempotente — manejamos duplicate_key)
  const insertRes = await supabase.from('blocked_numbers').insert({
    portal_email: target.portal_email,
    phone_e164:   '+524812092229',
    reason:       'bot marcador — pedido Ramón 2026-10-03',
    created_by:   'admin:nazre',
  });
  if (insertRes.error) {
    if (insertRes.error.code === '23505') {
      console.log('✓ +524812092229 ya estaba bloqueado (OK)');
    } else {
      throw insertRes.error;
    }
  } else {
    console.log('✓ Seed +524812092229 para Tortillería');
  }

  // 4. Confirmar
  const { data: blocked, error: blockedErr } = await supabase
    .from('blocked_numbers')
    .select('phone_e164, reason, created_at, created_by')
    .eq('portal_email', target.portal_email);

  if (blockedErr) throw blockedErr;
  console.log('\n→ Blocklist actual para', target.portal_email + ':');
  for (const b of blocked ?? []) {
    console.log(`  ${b.phone_e164} — ${b.reason ?? '(sin razón)'} — ${b.created_at}`);
  }

  console.log('\n✓ Listo.');
}

main().catch(err => {
  console.error('✗', err.message || err);
  process.exit(1);
});
