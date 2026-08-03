export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

interface VoCRow {
  id:                  string;
  portal_email:        string;
  source:              string;
  window_days:         number;
  sample_count:        number;
  phrases:             string[];
  objections:          string[];
  retention_reasons:   string[];
  churn_reasons:       string[];
  headline_candidates: string[];
  summary:             string;
  created_at:          string;
}

const SOURCE_LABEL: Record<string, string> = {
  calls:   'Llamadas',
  emails:  'Correos',
  tickets: 'Tickets',
  all:     'Todos',
};

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--c-text-3)' }}>{title}</h4>
      <ul className="space-y-1 text-sm" style={{ color: 'var(--c-text)' }}>
        {items.map((it, i) => (
          <li key={i} className="leading-snug">
            <span style={{ color: 'var(--c-text-3)' }}>{i + 1}.</span> {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function VozDelClientePage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voc_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  const rows = (data ?? []) as VoCRow[];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold">Voz del cliente</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Extracciones históricas del lenguaje real de los clientes por organización. Las generan los empleados digitales cuando el dueño se los pide o durante sus check-ins programados.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
          Todavía no hay extracciones. La primera se creará cuando un empleado llame la herramienta extraer_voz_del_cliente.
        </p>
      )}

      {rows.map(r => (
        <article key={r.id} className="rounded-lg border p-6 space-y-4" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}>
          <header className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">{r.portal_email}</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                {SOURCE_LABEL[r.source] ?? r.source} · {r.sample_count} muestras · últimos {r.window_days} días · {new Date(r.created_at).toLocaleString('es-MX')}
              </p>
            </div>
          </header>

          {r.summary && (
            <p className="text-sm italic leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{r.summary}</p>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <List title="Frases exactas del cliente" items={r.phrases ?? []} />
            <List title="Objeciones frecuentes" items={r.objections ?? []} />
            <List title="Razones por las que se quedan" items={r.retention_reasons ?? []} />
            <List title="Razones por las que se van" items={r.churn_reasons ?? []} />
            <div className="md:col-span-2">
              <List title="Candidatos de titular" items={r.headline_candidates ?? []} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
