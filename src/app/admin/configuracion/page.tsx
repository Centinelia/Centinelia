'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Save, Check } from 'lucide-react';

type Tab = 'sales' | 'portal';

const PLACEHOLDERS: Record<Tab, string> = {
  sales: `Ejemplos de info extra que puedes agregar:
- Casos de éxito: "Una clínica dental en Monterrey redujo sus llamadas perdidas en un 70% con Centinelia."
- Preguntas frecuentes adicionales
- Restricciones geográficas u horarios de atención del equipo de ventas
- Promociones o descuentos vigentes`,

  portal: `Ejemplos de info extra para soporte:
- Pasos para conectar el dominio personalizado
- Cómo interpretar los resultados de las llamadas
- Preguntas frecuentes de clientes activos
- Información de contacto del equipo de soporte`,
};

const TAB_LABELS: Record<Tab, string> = {
  sales:  'Bot de ventas (landing)',
  portal: 'Bot de soporte (portal)',
};

export default function ConfiguracionPage() {
  const [tab, setTab]         = useState<Tab>('sales');
  const [values, setValues]   = useState({ kb_sales: '', kb_portal: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState<Tab | null>(null);

  useEffect(() => {
    fetch('/api/admin/knowledge-base')
      .then(r => r.json())
      .then(d => { setValues(d); setLoading(false); });
  }, []);

  const handleSave = async (t: Tab) => {
    setSaving(true);
    const key   = t === 'sales' ? 'kb_sales' : 'kb_portal';
    const value = t === 'sales' ? values.kb_sales : values.kb_portal;
    await fetch('/api/admin/knowledge-base', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key, value }),
    });
    setSaving(false);
    setSaved(t);
    setTimeout(() => setSaved(null), 2000);
  };

  const currentKey = tab === 'sales' ? 'kb_sales' : 'kb_portal';

  return (
    <div className="p-4 md:p-8 max-w-3xl">

      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Configuración</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          Ajustes globales de la plataforma
        </p>
      </div>

      {/* ── Sección: Base de conocimiento ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={15} style={{ color: '#9B6DFF' }} />
          <h2 className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Base de conocimiento
          </h2>
        </div>

        <div className="rounded-2xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
            Información extra que los bots de chat de la landing y el portal del cliente usan para responder mejor. El bot base ya tiene la información general de Centinelia — escribe aquí solo lo adicional: promociones temporales, casos de éxito, FAQs específicas.
          </p>

          {/* Sub-tabs */}
          <div className="flex gap-2 mb-4">
            {(['sales', 'portal'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: tab === t ? '#6C3BFF' : 'var(--c-surface-2)',
                  color:      tab === t ? '#fff'     : 'var(--c-text-3)',
                  border:     `1px solid ${tab === t ? '#6C3BFF' : 'var(--c-border)'}`,
                }}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--c-input-bg)' }} />
          ) : (
            <textarea
              value={values[currentKey as keyof typeof values]}
              onChange={e => setValues(prev => ({ ...prev, [currentKey]: e.target.value }))}
              placeholder={PLACEHOLDERS[tab]}
              rows={12}
              className="w-full rounded-xl p-3 text-sm resize-y focus:outline-none"
              style={{
                background: 'var(--c-input-bg)',
                border:     '1px solid var(--c-border)',
                color:      'var(--c-text)',
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />
          )}

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              {values[currentKey as keyof typeof values]?.length ?? 0} caracteres
            </p>
            <button
              onClick={() => handleSave(tab)}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{
                background: saved === tab ? 'rgba(34,197,94,0.15)' : '#6C3BFF',
                color:      saved === tab ? '#22c55e'               : '#fff',
                border:     saved === tab ? '1px solid rgba(34,197,94,0.3)' : 'none',
              }}
            >
              {saved === tab
                ? <><Check size={14} /> Guardado</>
                : <><Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}</>
              }
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
