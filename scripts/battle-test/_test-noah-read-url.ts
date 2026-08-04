/**
 * Chat con Noah: pide leer URL. Espera que invoque read_url y devuelva contenido.
 */
import { loadEnv } from './_env';
loadEnv();
import { battleChat } from './battle-chat';
import { createClient } from '@supabase/supabase-js';

const NOAH_ID = '3b3dbeb4-8235-4b98-913a-0208e585d2e3';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const t = await battleChat({
    agentId: NOAH_ID,
    message: 'Necesito que investigues al prospecto Vercel antes de que lo llame. Lee https://vercel.com/about y dime en 3 bullets qué hacen, quién es su cliente objetivo y qué diferenciadores tienen.',
  });

  console.log('\n\n---TEXT---\n', t.text.slice(0, 800));

  await new Promise(r => setTimeout(r, 3000));
  const { data: run } = await s
    .from('agent_runs')
    .select('tools_called, llm_calls, duration_ms')
    .eq('agent_id', NOAH_ID)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  console.log('\n---LAST agent_runs---');
  console.log(run);
  const usedReadUrl = (run?.tools_called as any[])?.some(t => t.name === 'read_url');
  console.log(`\nUsed read_url: ${usedReadUrl ? '✅' : '🔴'}`);
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
