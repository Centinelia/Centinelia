import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const NELIA_ID = 'e17bc13d-8624-4792-89d7-eac00edad051';
const kb = readFileSync('demos/meefi-gac/22-kb-nelia-meefi.md', 'utf8');

const { data, error } = await supabase
  .from('voice_agents')
  .update({ role_knowledge_base: kb })
  .eq('id', NELIA_ID)
  .select('id, agent_name, LENGTH_hint:role_knowledge_base');

if (error) {
  console.error('ERROR:', error);
  process.exit(1);
}

const check = await supabase
  .from('voice_agents')
  .select('id, agent_name')
  .eq('id', NELIA_ID)
  .single();

const raw = await supabase
  .from('voice_agents')
  .select('role_knowledge_base')
  .eq('id', NELIA_ID)
  .single();

console.log(`Nelia (${check.data?.agent_name}) KB length: ${(raw.data?.role_knowledge_base || '').length} chars`);
