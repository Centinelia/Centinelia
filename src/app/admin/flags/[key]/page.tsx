export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { FlagEditor } from '@/components/admin/FlagEditor';
import type { FlagRow } from '@/lib/feature-flags/types';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type AuditRow = {
  id:         number;
  actor:      string;
  action:     string;
  before:     unknown;
  after:      unknown;
  created_at: string;
};

interface Params { params: Promise<{ key: string }> }

export default async function FlagDetailPage({ params }: Params) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { key } = await params;
  const decoded = decodeURIComponent(key);

  const supabase = createAdminClient();
  const { data: flag } = await supabase.from('feature_flags').select('*').eq('flag_key', decoded).maybeSingle();
  if (!flag) notFound();

  const { data: audit } = await supabase
    .from('feature_flag_audit')
    .select('id, actor, action, before, after, created_at')
    .eq('flag_key', decoded)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/admin/flags" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--c-text-2)' }}>
        <ArrowLeft size={14} /> Todos los flags
      </Link>

      <FlagEditor flag={flag as FlagRow} mode="edit" />

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--c-text)' }}>Historial (ultimas 20)</h2>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: 'var(--c-surface-2)' }}>
              <tr>
                <th className="text-left px-3 py-2" style={{ color: 'var(--c-text-2)' }}>fecha</th>
                <th className="text-left px-3 py-2" style={{ color: 'var(--c-text-2)' }}>actor</th>
                <th className="text-left px-3 py-2" style={{ color: 'var(--c-text-2)' }}>accion</th>
              </tr>
            </thead>
            <tbody>
              {((audit as AuditRow[]) ?? []).length === 0 && (
                <tr><td colSpan={3} className="text-center px-3 py-4" style={{ color: 'var(--c-text-2)' }}>Sin cambios registrados.</td></tr>
              )}
              {((audit as AuditRow[]) ?? []).map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                  <td className="px-3 py-2 font-mono" style={{ color: 'var(--c-text-2)' }}>{new Date(a.created_at).toLocaleString('es-MX')}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{a.actor}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: 'var(--c-text)' }}>{a.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
