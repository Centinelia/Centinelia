import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface ConfigInput {
  enabled?:                       boolean;
  day_of_week?:                   number;
  hour?:                          number;
  recipients?:                    string[];
  include_monthly_last_saturday?: boolean;
}

function isValidEmail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalize(input: ConfigInput) {
  const cfg = {
    enabled:                       Boolean(input.enabled),
    day_of_week:                   Number.isInteger(input.day_of_week) ? (input.day_of_week as number) : 6,
    hour:                          Number.isInteger(input.hour) ? (input.hour as number) : 14,
    recipients:                    Array.isArray(input.recipients) ? input.recipients.filter(isValidEmail) : [],
    include_monthly_last_saturday: input.include_monthly_last_saturday !== false,
  };
  cfg.day_of_week = Math.max(0, Math.min(6, cfg.day_of_week));
  cfg.hour        = Math.max(0, Math.min(23, cfg.hour));
  return cfg;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  let body: ConfigInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const cfg = normalize(body);

  // Guardrail: si enabled=true, exigir al menos 1 recipient.
  if (cfg.enabled && cfg.recipients.length === 0) {
    return NextResponse.json({ error: 'Agrega al menos un destinatario antes de activar' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({ bitacora_weekly_config: cfg })
    .eq('portal_email', resolved.portalEmail);

  if (error) {
    console.error('[delivery-config] update failed:', error);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config: cfg });
}
