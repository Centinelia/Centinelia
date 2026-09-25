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

export default function ConocimientoPage() {
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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.12)' }}>
          <BookOpen size={18} style={{ color: '#9B6DFF' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1A0A3B' }}>Base de conocimiento</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6B6480' }}>
            Información extra que los bots de chat usan para responder mejor
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['sales', 'portal'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t ? '#6C3BFF' : '#FFFFFF',
              color:      tab === t ? '#fff'     : '#6B6480',
              border:     `1px solid ${tab === t ? '#6C3BFF' : '#E8E3F5'}`,
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
        <p className="text-xs mb-3" style={{ color: '#6B6480' }}>
          Este texto se agrega al contexto del bot. Úsalo para información específica, promociones vigentes, casos de éxito, FAQs o cualquier detalle que no esté en el prompt base.
        </p>
        {loading ? (
          <div className="h-48 rounded-xl animate-pulse" style={{ background: '#FFFFFF' }} />
        ) : (
          <textarea
            value={values[currentKey as keyof typeof values]}
            onChange={e => setValues(prev => ({ ...prev, [currentKey]: e.target.value }))}
            placeholder={PLACEHOLDERS[tab]}
            rows={12}
            className="w-full rounded-xl p-3 text-sm resize-y focus:outline-none"
            style={{
              background: '#FFFFFF',
              border:     '1px solid #E8E3F5',
              color:      '#1A0A3B',
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
        )}

        <div className="flex items-center justify-between mt-3">
          <p className="text-xs" style={{ color: '#9B8FB5' }}>
            {values[currentKey as keyof typeof values]?.length ?? 0} caracteres
          </p>
          <button
            onClick={() => handleSave(tab)}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{
              background: saved === tab ? 'rgba(34,197,94,0.15)' : '#6C3BFF',
              color:      saved === tab ? '#22c55e'               : '#fff',
              border:     saved === tab ? '1px solid rgba(34,197,94,0.3)' : 'none',
              opacity:    saving ? 0.6 : 1,
            }}
          >
            {saved === tab
              ? <><Check size={14} /> Guardado</>
              : <><Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}</>
            }
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: '#9B6DFF' }}>¿Cómo funciona?</p>
        <p className="text-xs" style={{ color: '#6B6480' }}>
          El bot base ya tiene la información general de Centinelia: planes, precios, funcionalidades y manejo de objeciones.
          Lo que escribas aquí se añade encima de ese contexto, útil para promociones temporales, preguntas frecuentes específicas o casos de éxito.
        </p>
      </div>
    </div>
  );
}
