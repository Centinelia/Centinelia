'use client';

/**
 * EducationalTooltip — banner informativo de primera visita.
 *
 * Se muestra la primera vez que el usuario entra a una sección nueva
 * y se persiste en localStorage para que no vuelva a aparecer.
 *
 * Uso:
 *   <EducationalTooltip storageKey="centinelia_rules_tooltip_seen">
 *     Regla es cómo opera tu negocio siempre...
 *   </EducationalTooltip>
 */

import { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';

interface Props {
  /** Clave única de localStorage — determina si ya fue visto */
  storageKey: string;
  /** Contenido del tooltip */
  children: React.ReactNode;
  /** Color de acento (default: #6C3BFF) */
  accentColor?: string;
}

export default function EducationalTooltip({
  storageKey,
  children,
  accentColor = '#6C3BFF',
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(storageKey);
      if (!seen) setVisible(true);
    } catch { /* SSR / incognito */ }
  }, [storageKey]);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(storageKey, '1'); } catch { /* ok */ }
  }

  if (!visible) return null;

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl relative"
      style={{
        background: `${accentColor}0a`,
        border:     `1px solid ${accentColor}33`,
      }}
    >
      <Info
        size={16}
        style={{ color: accentColor, flexShrink: 0, marginTop: 1 }}
      />
      <div className="text-sm leading-relaxed flex-1" style={{ color: '#4A3B6B' }}>
        {children}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="p-1 rounded-lg transition-opacity hover:opacity-60"
        style={{ color: '#9B8FB5', flexShrink: 0 }}
        aria-label="Cerrar sugerencia"
      >
        <X size={14} />
      </button>
    </div>
  );
}
