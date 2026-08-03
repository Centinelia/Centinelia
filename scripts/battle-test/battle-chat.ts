/**
 * Battle-test helper: mint a portal session cookie for Pneuma Studio and drive
 * a real chat conversation against production. Streams SSE, prints text +
 * tool_use events + tool results as they happen, and returns the collected
 * transcript so downstream checks can assert on it.
 *
 * Usage from another script:
 *   const t = await battleChat({ agentId: SOFIA_ID, message: '...' });
 *   console.log(t.text, t.toolUses);
 */
import { readFileSync } from 'fs';
import { join } from 'path';
// Load .env.local manually (no dotenv dep in this project)
for (const line of readFileSync(join(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
import { createSession, PORTAL_COOKIE } from '../../src/lib/portal/auth';

const PROD_URL     = process.env.BATTLE_TEST_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
const PORTAL_EMAIL = 'studio@pneumastudio.mx';
const PORTAL_TOKEN = '8892c013-b122-4f11-a9d4-e88a04aff732'; // Sofia's portal token

export interface BattleChatArgs {
  agentId?:   string;   // optional target agent (default = agent bound to the portal token)
  message:    string;
  priorTurns?: { role: 'user' | 'assistant'; content: string }[];
}

export interface ToolUseSeen {
  id:    string;
  name:  string;
  input: unknown;
}

export interface BattleChatResult {
  text:      string;
  toolUses:  ToolUseSeen[];
  toolResults: { id: string; result: string }[];
  rawEvents: string[];
}

export async function battleChat(args: BattleChatArgs): Promise<BattleChatResult> {
  const cookie = await createSession(PORTAL_EMAIL);
  const messages = [
    ...(args.priorTurns ?? []),
    { role: 'user' as const, content: args.message },
  ];

  const res = await fetch(`${PROD_URL}/api/portal/${PORTAL_TOKEN}/agent-chat`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie':       `${PORTAL_COOKIE}=${cookie}`,
    },
    body: JSON.stringify({ messages, agentId: args.agentId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const dec    = new TextDecoder();
  let   buffer = '';
  const out: BattleChatResult = {
    text: '', toolUses: [], toolResults: [], rawEvents: [],
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });

    // Parse SSE frames — each terminated by \n\n
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer      = buffer.slice(idx + 2);
      out.rawEvents.push(frame);
      handleSseFrame(frame, out);
    }
  }
  return out;
}

function handleSseFrame(frame: string, out: BattleChatResult) {
  // Frames look like "event: xxx\ndata: {...}" but the exact shape depends on
  // the endpoint. We just look for lines starting with "data:".
  const lines = frame.split('\n').filter(l => l.startsWith('data:'));
  for (const line of lines) {
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    try {
      const payload = JSON.parse(raw);
      collect(payload, out);
    } catch {
      // Not JSON — probably a plain text delta prefixed differently. Ignore.
    }
  }
}

function collect(payload: any, out: BattleChatResult) {
  // agent-chat endpoint only streams { text: "..." } deltas + [DONE].
  // Tool calls happen server-side and aren't emitted; we discover them via DB post-hoc.
  if (typeof payload?.text === 'string') {
    out.text += payload.text;
    process.stdout.write(payload.text);
    return;
  }
  if (payload?.error) {
    process.stdout.write(`\n[ERROR] ${payload.error}\n`);
  }
}

// Direct CLI mode: `npx tsx scripts/battle-test/battle-chat.ts "message"`
if (require.main === module) {
  const msg = process.argv.slice(2).join(' ');
  if (!msg) {
    console.error('Usage: npx tsx scripts/battle-test/battle-chat.ts "message"');
    process.exit(1);
  }
  battleChat({ message: msg }).then(r => {
    console.log('\n---\nSUMMARY');
    console.log('text length:', r.text.length);
    console.log('tool uses:',   r.toolUses.map(t => t.name));
    console.log('tool results:', r.toolResults.length);
    console.log('\n--- FIRST 3 RAW EVENTS ---');
    r.rawEvents.slice(0, 3).forEach((e, i) => console.log(`[${i}]`, e.slice(0, 500)));
    console.log('\n--- LAST 3 RAW EVENTS ---');
    r.rawEvents.slice(-3).forEach((e, i) => console.log(`[${i}]`, e.slice(0, 500)));
    console.log('total events:', r.rawEvents.length);
  }).catch(err => {
    console.error('FAIL:', err);
    process.exit(1);
  });
}
