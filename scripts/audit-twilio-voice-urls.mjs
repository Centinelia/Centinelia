// Audita + repara los Twilio incoming phone numbers para que su voice_url
// apunte a /api/twilio/voice-gate (NO a api.vapi.ai/twilio/inbound_call).
//
// Sin este patch, Twilio manda las calls directo a Vapi y ningún gate nuestro
// corre (blocklist, agent paused, suspended, business hours, pool exhausted,
// daily cap). Policy no-silent-provisioning-failures.
//
// Uso:
//   npx dotenv-cli -e .env.local -- node scripts/audit-twilio-voice-urls.mjs            # solo auditar
//   npx dotenv-cli -e .env.local -- node scripts/audit-twilio-voice-urls.mjs --fix      # auditar + reparar los rotos
//
// Exit 1 si hay phones rotos (útil para cron / CI).

const sid    = process.env.TWILIO_ACCOUNT_SID;
const token  = process.env.TWILIO_AUTH_TOKEN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
const GATE_URL = `${appUrl}/api/twilio/voice-gate`;

const FIX = process.argv.includes('--fix');

if (!sid || !token) {
  console.error('✗ TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN missing');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(sid + ':' + token).toString('base64');

async function main() {
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=100`,
    { headers: { Authorization: auth } },
  );
  if (!r.ok) {
    console.error(`✗ Twilio list HTTP ${r.status}`);
    process.exit(1);
  }
  const data = await r.json();
  const phones = data.incoming_phone_numbers ?? [];
  console.log(`→ ${phones.length} incoming phone numbers en Twilio\n`);

  const correct = [];
  const broken  = [];
  for (const p of phones) {
    const row = { sid: p.sid, number: p.phone_number, name: p.friendly_name, voiceUrl: p.voice_url };
    if ((p.voice_url || '').includes('/api/twilio/voice-gate')) correct.push(row);
    else                                                         broken.push(row);
  }

  console.log(`✓ Correctos (voice_url → gate): ${correct.length}`);
  for (const r of correct) console.log(`  ${r.number} — ${r.name}`);

  if (broken.length === 0) {
    console.log('\n✓ Todos los phones apuntan al gate.');
    return;
  }

  console.log(`\n✗ ROTOS (voice_url NO apunta al gate): ${broken.length}`);
  for (const r of broken) {
    console.log(`  ${r.number} — ${r.name}`);
    console.log(`    voice_url actual: ${r.voiceUrl || '(none)'}`);
  }

  if (!FIX) {
    console.log(`\n→ Agrega --fix para reparar los ${broken.length} rotos.`);
    process.exit(1);
  }

  console.log(`\n→ Reparando ${broken.length} phones a voice_url=${GATE_URL}...`);
  let okCount = 0;
  for (const r of broken) {
    const body = new URLSearchParams({ VoiceUrl: GATE_URL, VoiceMethod: 'POST' });
    const pr = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${r.sid}.json`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    if (pr.ok) {
      console.log(`  ✓ ${r.number}`);
      okCount++;
    } else {
      console.log(`  ✗ ${r.number} — HTTP ${pr.status} ${(await pr.text()).slice(0, 100)}`);
    }
  }
  if (okCount !== broken.length) process.exit(1);
}

main().catch(err => {
  console.error('✗', err.message || err);
  process.exit(1);
});
