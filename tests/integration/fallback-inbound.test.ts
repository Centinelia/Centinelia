import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mutable state shared across tests
// ---------------------------------------------------------------------------
const mockOrg: {
  account_status:         string;
  suspended_until:        string | null;
  calendar_type:          string | null;
  fallback_phone_number:  string | null;
  fallback_notified_at:   string | null;
  minutes_reset_date:     string | null;
  guardia_schedule:       null;
} = {
  account_status:         'active',
  suspended_until:        null,
  calendar_type:          null,
  fallback_phone_number:  null,
  fallback_notified_at:   null,
  minutes_reset_date:     null,
  guardia_schedule:       null,
};

const mockAgent = {
  id:                    'agent-uuid',
  agent_name:            'Nia',
  business_name:         'Negocio Piloto',
  active:                true,
  phone_number:          '+528000000000',
  portal_email:          'piloto@example.com',
  transfer_whatsapp:     '+528111111111',
  transfer_number:       null,
  minutes_included:      100,
  minutes_used:          100,
  business_hours:        null,
  timezone:              'America/Monterrey',
  features:              {},
  plan:                  'pro',
  elevenlabs_voice_id:   'voice-xyz',
  speech_style:          'usted',
  daily_minutes_cap:     null,
  knowledge_base:        null,
  outbound_role:         null,
};

const mockAcctMins = { minutes_used: 100, minutes_included: 100 };

// ---------------------------------------------------------------------------
// Supabase mock — differentiates by table name
// ---------------------------------------------------------------------------
const from = vi.fn((table: string) => {
  const q: Record<string, unknown> = {};

  q.select  = vi.fn(() => q);
  q.eq      = vi.fn(() => q);
  q.ilike   = vi.fn(() => q);
  q.neq     = vi.fn(() => q);
  q.not     = vi.fn(() => q);
  q.order   = vi.fn(() => q);
  q.contains = vi.fn(() => q);
  q.is      = vi.fn(() => q);
  q.insert  = vi.fn(async () => ({ error: null }));
  q.update  = vi.fn(async () => ({ error: null }));
  q.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  q.limit   = vi.fn(async () => ({ data: [], error: null }));

  q.single = vi.fn(async () => {
    if (table === 'voice_agents')   return { data: mockAgent, error: null };
    if (table === 'organizations')  return { data: { ...mockOrg }, error: null };
    if (table === 'account_minutes') return { data: mockAcctMins, error: null };
    if (table === 'qb_integrations') return { data: null, error: null };
    if (table === 'surveys')        return { data: [], error: null };
    return { data: null, error: null };
  });

  // surveys query uses .limit() not .single()
  if (table === 'surveys') {
    q.limit = vi.fn(async () => ({ data: [], error: null }));
  }

  return q;
});

const rpc = vi.fn(async () => ({ data: 0, error: null }));

// ---------------------------------------------------------------------------
// vi.mock calls — MUST be at module top level (hoisted by Vitest)
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from, rpc }),
}));

// next/server — keep NextRequest/NextResponse real, override `after` to run sync
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}); } };
});

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsApp: vi.fn(async () => true),
}));

vi.mock('@/lib/voice/prompt-builder', () => ({
  buildSystemPrompt: vi.fn(async () => 'mock-system-prompt'),
}));

vi.mock('@/lib/voice/business-hours', () => ({
  isWithinBusinessHours: vi.fn(() => true),
  nextOpenTime:          vi.fn(() => null),
}));

vi.mock('@/lib/memory/recall', () => ({
  recallForCaller: vi.fn(async () => ({ block: null, callerName: null, factCount: 0 })),
}));

vi.mock('@/lib/portal/directory', () => ({
  loadOrgDirectory: vi.fn(async () => []),
  toTeamNumbers:    vi.fn(() => []),
}));

vi.mock('@/lib/creativity/meerkat-gates', () => ({
  MEERKAT_TOOL_ACCESS: {},
}));

vi.mock('@/lib/tools/definitions/sheets', () => ({
  sheetsTools: vi.fn(() => []),
}));

vi.mock('@/lib/services/sheets', () => ({
  hasAnyMapping: vi.fn(async () => false),
}));

vi.mock('@/lib/billing/fallback-validate', () => ({
  isValidE164: vi.fn((v: unknown) => {
    if (typeof v !== 'string' || !v) return false;
    return /^\+[1-9]\d{7,14}$/.test(v);
  }),
}));

vi.mock('@/lib/billing/routing-log', () => ({
  logRoutingTransition: vi.fn(async () => {}),
}));

vi.mock('@/lib/billing/fallback-notify', () => ({
  notifyFallbackActivated: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Helper: call the inbound route with fixed test parameters
// ---------------------------------------------------------------------------
async function callInbound(
  vapiNumber = '+528000000000',
  callerNumber = '+528122223333',
): Promise<Record<string, unknown>> {
  process.env.VAPI_SERVER_SECRET = 'test';
  // Re-import fresh each time so module cache doesn't bleed between tests
  const { POST } = await import('@/app/api/voice/inbound/route');
  const req = new Request('http://localhost/api/voice/inbound?secret=test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        phoneNumber: { number: vapiNumber },
        customer:    { number: callerNumber },
      },
    }),
  }) as Request & { nextUrl: { searchParams: URLSearchParams } };
  req.nextUrl = { searchParams: new URLSearchParams('secret=test') };
  const res = await POST(req as Parameters<typeof POST>[0]);
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Reset mutable state before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockOrg.fallback_phone_number = null;
  mockOrg.fallback_notified_at  = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('/api/voice/inbound — minutes exhausted', () => {
  it('returns PausedByLimit when no fallback configured', async () => {
    mockOrg.fallback_phone_number = null;
    const body = await callInbound();
    expect((body.assistant as Record<string, unknown>).name).toBe('PausedByLimit');
  });

  it('returns FallbackForward with transferCall when fallback set', async () => {
    mockOrg.fallback_phone_number = '+528155556666';
    const body = await callInbound();
    const assistant = body.assistant as Record<string, unknown>;
    expect(assistant.name).toBe('FallbackForward');
    const tools = assistant.tools as Array<Record<string, unknown>>;
    expect(tools[0].type).toBe('transferCall');
    const destinations = tools[0].destinations as Array<Record<string, unknown>>;
    expect(destinations[0].number).toBe('+528155556666');
  });

  it('returns PausedByLimit when fallback is malformed', async () => {
    mockOrg.fallback_phone_number = 'not-a-phone';
    const body = await callInbound();
    expect((body.assistant as Record<string, unknown>).name).toBe('PausedByLimit');
  });
});
