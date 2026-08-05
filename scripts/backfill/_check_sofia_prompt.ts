const key = process.env.VAPI_API_KEY!;
const vapiId = '6b663688-a610-46e8-be2b-c9615d461e85';

async function main() {
  const res = await fetch(`https://api.vapi.ai/assistant/${vapiId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  const sys = data.model?.messages?.[0]?.content ?? '(none)';
  console.log('Model:', data.model?.model);
  console.log('Provider:', data.model?.provider);
  console.log('Prompt length:', sys.length, 'chars');
  console.log('\n--- FACTURA section ---');
  const idx = sys.indexOf('FACTURACIÓN FISCAL');
  if (idx >= 0) console.log(sys.slice(idx, idx + 1500));
  else console.log('❌ FACTURACIÓN FISCAL block NOT in prompt — resync failed');
  console.log('\n--- SIGLAS section ---');
  const idx2 = sys.indexOf('PRONUNCIACIÓN DE SIGLAS');
  if (idx2 >= 0) console.log(sys.slice(idx2, idx2 + 500));
  else console.log('❌ NOT in prompt');
  console.log('\n--- DICTADO section ---');
  const idx3 = sys.indexOf('DICTADO DE CÓDIGOS');
  if (idx3 >= 0) console.log(sys.slice(idx3, idx3 + 500));
  else console.log('❌ NOT in prompt');
  console.log('\n--- NON-LATIN guard ---');
  const idx4 = sys.indexOf('NUNCA respondas en hindi');
  if (idx4 >= 0) console.log(sys.slice(idx4, idx4 + 300));
  else console.log('❌ NOT in prompt');
}
main().catch(console.error);
