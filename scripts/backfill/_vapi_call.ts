const key = process.env.VAPI_API_KEY!;
const vapiCallId = process.argv[2] || '019fcdf5-4db2-7006-aa02-3b86e215898d';

async function main() {
  const res = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  console.log('endedReason:', data.endedReason);
  console.log('startedAt:', data.startedAt);
  console.log('endedAt:', data.endedAt);
  console.log('cost:', data.cost);
  console.log('status:', data.status);
  console.log('\nmessages:');
  for (const m of data.messages ?? []) {
    const t = m.time ? new Date(m.time).toISOString().slice(11,23) : '';
    const kind = m.role ?? m.type;
    const body = (m.message ?? m.content ?? '').slice(0,300);
    console.log(`[${kind}] ${t} ${body}`);
    if (m.toolCalls) console.log('  toolCalls:', JSON.stringify(m.toolCalls));
    if (m.result) console.log('  result:', JSON.stringify(m.result).slice(0,300));
  }
  console.log('\nartifact.messages (raw):');
  for (const m of (data.artifact?.messages ?? []).slice(0, 20)) {
    console.log(`[${m.role}] ${(m.message ?? m.content ?? JSON.stringify(m.toolCalls ?? m)).slice(0, 300)}`);
  }
}
main().catch(console.error);
