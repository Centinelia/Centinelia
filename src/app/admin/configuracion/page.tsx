'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookOpen, Save, Check, Sparkles, ChevronRight } from 'lucide-react';

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
    <div className="p-8 max-w-3xl mx-auto space-y-8">

      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Configuración</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Ajustes globales de la plataforma.
        </p>
      </div>

      {/* Link a Estilo conversacional (movido de sidebar) */}
      <Link
        href="/admin/conversacional"
        className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 transition-colors hover:bg-gray-50"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
      >
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ background: '#F3F0FF' }}>
          <Sparkles size={16} style={{ color: '#7C3AED' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold" style={{ color: '#111827' }}>Estilo conversacional</p>
          <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
            Ajusta tono y muletillas de los empleados en voz.
          </p>
        </div>
        <ChevronRight size={16} style={{ color: '#9CA3AF' }} />
      </Link>

      {/* ── Sección: Base de conocimiento ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={15} style={{ color: '#7C3AED' }} />
          <h2 className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: '#9CA3AF' }}>
            Base de conocimiento
          </h2>
        </div>

        <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
          <p className="text-[12px] mb-4" style={{ color: '#6B7280' }}>
            Información extra que los bots de chat de la landing y el portal del cliente usan para responder mejor. El bot base ya tiene la información general de Centinelia; escribe aquí solo lo adicional: promociones temporales, casos de éxito, FAQs específicas.
          </p>

          {/* Sub-tabs */}
          <div className="flex gap-2 mb-4">
            {(['sales', 'portal'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={{
                  background: tab === t ? '#6C3BFF' : '#FFFFFF',
                  color:      tab === t ? '#FAFBFF'  : '#374151',
                  border:     `1px solid ${tab === t ? '#6C3BFF' : '#E5E7EB'}`,
                }}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="h-48 rounded-xl animate-pulse" style={{ background: '#F3F4F6' }} />
          ) : (
            <textarea
              value={values[currentKey as keyof typeof values]}
              onChange={e => setValues(prev => ({ ...prev, [currentKey]: e.target.value }))}
              placeholder={PLACEHOLDERS[tab]}
              rows={12}
              className="w-full rounded-lg p-3 text-[13px] resize-y focus:outline-none"
              style={{
                background: '#FFFFFF',
                border:     '1px solid #E5E7EB',
                color:      '#111827',
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />
          )}

          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px]" style={{ color: '#9CA3AF' }}>
              {values[currentKey as keyof typeof values]?.length ?? 0} caracteres
            </p>
            <button
              onClick={() => handleSave(tab)}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{
                background: saved === tab ? '#ECFDF5' : '#6C3BFF',
                color:      saved === tab ? '#047857'  : '#FAFBFF',
                border:     saved === tab ? '1px solid #A7F3D0' : 'none',
              }}
            >
              {saved === tab
                ? <><Check size={14} /> Guardado</>
                : <><Save size={14} /> {saving ? 'Guardando' : 'Guardar'}</>
              }
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
