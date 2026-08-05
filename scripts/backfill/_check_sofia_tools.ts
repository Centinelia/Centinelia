const key = process.env.VAPI_API_KEY!;
const vapiId = '6b663688-a610-46e8-be2b-c9615d461e85';

async function main() {
  const res = await fetch(`https://api.vapi.ai/assistant/${vapiId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  const toolIds: string[] = data.model?.toolIds ?? [];
  console.log(`Sofia has ${toolIds.length} toolIds\n`);

  const names: string[] = [];
  for (const id of toolIds) {
    const r = await fetch(`https://api.vapi.ai/tool/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const t = await r.json();
    const name = t.function?.name ?? '(transfer/native)';
    names.push(name);
  }
  console.log('Tools:');
  for (const n of names.sort()) console.log(`  - ${n}`);
  console.log(`\nconsultar_factura present: ${names.includes('consultar_factura') ? '❌ TODAVÍA EXISTE' : '✅ removida'}`);
  console.log(`solicitar_factura present: ${names.includes('solicitar_factura') ? '✅' : '❌ FALTA'}`);
}
main().catch(console.error);
