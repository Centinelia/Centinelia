'use client';

/**
 * TagSuggestionsChips — chips de etiquetas sugeridas para una ficha informativa.
 *
 * Muestra las etiquetas asignadas a una ficha y permite que el cliente
 * las confirme, quite o agregue manualmente. Guarda cambios vía
 * PATCH /api/portal/[token]/fichas/[fichaId].
 *
 * Si la API no devuelve etiquetas (ficha sin autotag aún o endpoint no
 * disponible), el componente se colapsa silenciosamente.
 */

import { useState, useEffect } from 'react';
import { Tag, X, Plus, Loader2, Check } from 'lucide-react';

interface Props {
  token:    string;
  fichaId:  string;
  /** Etiquetas iniciales (del response del POST, o cargadas luego). */
  initialTags?: string[];
}

// Catálogo de etiquetas conocidas (espejo del enum en DB — ficha_tags migration).
// Se usa para mostrar el selector de "agregar etiqueta".
export const TAG_CATALOG: readonly { slug: string; label: string }[] = [
  { slug: 'contabilidad',        label: 'Contabilidad' },
  { slug: 'cobranza',            label: 'Cobranza' },
  { slug: 'ventas',              label: 'Ventas' },
  { slug: 'atencion_cliente',    label: 'Atención al cliente' },
  { slug: 'catalogo_productos',  label: 'Catálogo de productos' },
  { slug: 'politicas',           label: 'Políticas' },
  { slug: 'rh',                  label: 'Recursos humanos' },
  { slug: 'operaciones',         label: 'Operaciones' },
  { slug: 'logistica',           label: 'Logística' },
  { slug: 'marketing',           label: 'Marketing' },
  { slug: 'finanzas',            label: 'Finanzas' },
  { slug: 'legal',               label: 'Legal' },
  { slug: 'fiscal',              label: 'Fiscal' },
  { slug: 'onboarding_clientes', label: 'Onboarding de clientes' },
  { slug: 'soporte_tecnico',     label: 'Soporte técnico' },
];

export default function TagSuggestionsChips({ token, fichaId, initialTags = [] }: Props) {
  const [tags,       setTags]       = useState<string[]>(initialTags);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Si el componente recibe nuevas initialTags (tras recargar la ficha), actualizar.
  useEffect(() => {
    if (initialTags.length > 0) setTags(initialTags);
  }, [initialTags.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tags.length === 0 && !showPicker) {
    // Si no hay etiquetas y no se abrió el picker, mostrar solo el botón de agregar
    return (
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-opacity hover:opacity-80"
        style={{ background: 'rgba(108,59,255,0.06)', color: '#9B8FB5', border: '1px solid rgba(108,59,255,0.15)' }}
      >
        <Tag size={10} />
        Agregar etiqueta
      </button>
    );
  }

  async function saveTags(newTags: string[]) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/fichas/${fichaId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tags: newTags }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch { /* Falla silenciosa */ }
    setSaving(false);
  }

  function removeTag(tag: string) {
    const next = tags.filter(t => t !== tag);
    setTags(next);
    saveTags(next);
  }

  function addTag(tag: string) {
    if (tags.includes(tag)) return;
    const next = [...tags, tag];
    setTags(next);
    setShowPicker(false);
    saveTags(next);
  }

  const available = TAG_CATALOG.filter(t => !tags.includes(t.slug));

  return (
    <div className="flex flex-col gap-1.5">
      {/* Etiquetas activas */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tag size={11} style={{ color: '#9B8FB5', flexShrink: 0 }} />
          {tags.map(tag => {
            const entry = TAG_CATALOG.find(t => t.slug === tag);
            const displayLabel = entry ? entry.label : tag;
            return (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full"
                style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
              >
                {displayLabel}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:opacity-60"
                  aria-label={`Quitar etiqueta ${displayLabel}`}
                >
                  <X size={9} />
                </button>
              </span>
            );
          })}
          {saving && <Loader2 size={11} className="animate-spin" style={{ color: '#9B8FB5' }} />}
          {saved  && <Check   size={11} style={{ color: '#22c55e' }} />}
          {available.length > 0 && !showPicker && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-80"
              style={{ background: '#FAFAFB', color: '#9B8FB5', border: '1px solid #E8E3F5' }}
            >
              <Plus size={9} />
            </button>
          )}
        </div>
      )}

      {/* Picker de etiquetas disponibles */}
      {showPicker && available.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {available.map(t => (
            <button
              key={t.slug}
              type="button"
              onClick={() => addTag(t.slug)}
              className="text-xs px-2.5 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
            >
              + {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ color: '#9B8FB5' }}
            aria-label="Cerrar selector"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
