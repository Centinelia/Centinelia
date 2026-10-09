import './_bootstrap';
import * as fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
async function main() {
  const PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/PRUEBA NAMI/OC 4812 MINISPLIT CONTENEDOR R32 200+ Productos.pdf';
  const buf = fs.readFileSync(PDF);
  console.log(`PDF: ${(buf.length / 1024).toFixed(1)}KB`);

  const { parseFileToText } = await import('../src/lib/connectors/parse');
  const text = await parseFileToText(buf, 'application/pdf');
  console.log(`parsed text: ${text.length} chars, preview:`);
  console.log(text.slice(0, 500));

  // Extraer items via LLM
  const anthropic = new Anthropic();
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Extrae los items de esta OC. Responde SOLO JSON con esta forma:
{"oc_numero": "...", "fecha_oc": "YYYY-MM-DD", "items": [{"modelo": "...", "cantidad": N, "descripcion": "...", "usd_unit": NNN}]}

Si un modelo aparece múltiples veces, consolidar sumando cantidades.

OC TEXT:
${text.slice(0, 15000)}`,
    }],
  });
  const txt = resp.content.find(b => b.type === 'text');
  const jsonStr = txt && txt.type === 'text' ? txt.text : '';
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON extracted');
  const parsed = JSON.parse(jsonMatch[0]);
  console.log(`\nExtracted: oc=${parsed.oc_numero}, fecha=${parsed.fecha_oc}, items=${parsed.items?.length}`);
  console.log(`Total units: ${parsed.items?.reduce((s: number, i: any) => s + Number(i.cantidad || 0), 0)}`);
  for (const it of (parsed.items ?? [])) {
    console.log(`  - ${it.modelo}: ${it.cantidad} × USD ${it.usd_unit}`);
  }

  // Confirmar antes de aplicar
  if (!process.argv.includes('--apply')) {
    console.log('\n*** DRY-RUN. Pasa --apply para invocar inv_procesar_oc_qb ***');
    return;
  }

  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const a = agent as any;

  const t0 = Date.now();
  const result = await executeAgentTool('inv_procesar_oc_qb', {
    oc_numero: parsed.oc_numero,
    fecha_oc: parsed.fecha_oc,
    items: parsed.items,
  }, {
    agentId: a.id, portalEmail: 'camila@acproyectos.com', agentName: 'Nami',
    businessName: 'AC Proyectos', portalToken: a.portal_token ?? '',
    agent: a, supabase: sb as any, channel: 'email', userContext: 'test OC big',
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nElapsed: ${elapsed}s`);
  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, null, 2).slice(0, 1500));
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
