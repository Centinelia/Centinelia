import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';

/**
 * Diagnostic-only. Reports whether ADMIN_DELETE_PASSWORD is loaded at runtime
 * WITHOUT leaking the value. Delete after debugging.
 */
export async function GET(_req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = process.env.ADMIN_DELETE_PASSWORD;
  return NextResponse.json({
    admin_delete_password: {
      defined:  raw !== undefined,
      truthy:   !!raw,
      length:   raw?.length ?? 0,
      trimmed_length: raw?.trim().length ?? 0,
      first_char: raw ? (raw[0] === ' ' ? '<space>' : raw[0] === '"' ? '<quote>' : 'ok') : null,
      last_char:  raw ? (raw[raw.length - 1] === ' ' ? '<space>' : raw[raw.length - 1] === '"' ? '<quote>' : 'ok') : null,
    },
    node_env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV ?? null,
    all_env_starting_with_admin: Object.keys(process.env).filter(k => k.toUpperCase().startsWith('ADMIN')),
  });
}
