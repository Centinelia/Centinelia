import { createAdminClient } from '@/lib/supabase/admin';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I — easy to read/dictate

function generate(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return `CNT-${s}`;
}

export async function getOrCreateSerial(portalEmail: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('account_serials')
    .select('serial')
    .eq('portal_email', portalEmail)
    .single();

  if (existing?.serial) return existing.serial;

  for (let attempt = 0; attempt < 10; attempt++) {
    const serial = generate();
    const { data, error } = await supabase
      .from('account_serials')
      .insert({ portal_email: portalEmail, serial })
      .select('serial')
      .single();
    if (!error && data?.serial) return data.serial;
  }

  throw new Error('No se pudo generar un número de cuenta único');
}

export async function resolveSerial(serial: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('account_serials')
    .select('portal_email')
    .ilike('serial', serial.toUpperCase())
    .single();
  return data?.portal_email ?? null;
}
