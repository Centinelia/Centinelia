import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PORTAL_EMAIL = 'meefi-demo@centinelia.mx';
const SOURCE = 'meefi_help_center';

async function ingestFromJson(path) {
  const articles = JSON.parse(readFileSync(path, 'utf8'));
  for (const a of articles) {
    const { error } = await supabase.from('knowledge_base_articles').insert({
      portal_email: PORTAL_EMAIL,
      title: a.title,
      body: a.body,
      source_url: a.source_url,
      source: SOURCE,
    });
    if (error) {
      console.error('FAIL:', a.title, error.message);
    } else {
      console.log('OK:', a.title);
    }
  }
}

async function ingestFromUrls(urlsPath) {
  const urls = readFileSync(urlsPath, 'utf8')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#'));
  if (urls.length === 0) {
    console.warn(
      'help-center-urls.txt vacio o solo con comentarios. Usa el fallback JSON o pobla el archivo primero.',
    );
    return;
  }
  console.warn(
    `Ingesta desde URLs no implementada (${urls.length} URLs listadas). Placeholder: usar cheerio para scrapear <h1> y <article>.`,
  );
  // TODO: implementar scraping con cheerio + node-fetch cuando Gera confirme URLs.
}

async function checkExisting() {
  const { count } = await supabase
    .from('knowledge_base_articles')
    .select('*', { count: 'exact', head: true })
    .eq('source', SOURCE);
  return count ?? 0;
}

async function main() {
  const existing = await checkExisting();
  if (existing > 0) {
    console.log(
      `Ya hay ${existing} articulos ingeridos con source='${SOURCE}'. Aborta para no duplicar. Borra manualmente si quieres reingerir.`,
    );
    return;
  }

  const useJson = process.argv.includes('--json');
  if (useJson || !existsSync('scripts/meefi/help-center-urls.txt')) {
    console.log('Ingesta desde JSON fallback.');
    await ingestFromJson('scripts/meefi/help-center-fallback.json');
  } else {
    await ingestFromUrls('scripts/meefi/help-center-urls.txt');
  }

  const final = await checkExisting();
  console.log(`\nTotal articulos ingeridos: ${final}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
