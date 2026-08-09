import type { LucideIcon } from 'lucide-react';

interface OficinaPageHeroProps {
  /** Ícono lucide del hero — debe coincidir con el ícono que muestra el sidebar (ver OficinaSidebarV2.tsx). */
  icon:        LucideIcon;
  /** Categoría/área en uppercase small caps — 10-14 chars idealmente. */
  eyebrow:     string;
  /** Título grande del hero — 1-4 palabras. */
  title:       string;
  /** Descripción de contexto (opcional). Un párrafo corto que oriente al usuario. */
  description?: React.ReactNode;
  /** Elemento a la derecha del hero (botón, chip, etc.) opcional. */
  right?:      React.ReactNode;
}

/**
 * Hero estandarizado para páginas de Oficina.
 * Patrón: badge lila 56x56 con ícono + eyebrow uppercase + h1 28px + descripción.
 * Los íconos usados aquí deben ser los mismos que en `OficinaSidebarV2.tsx` para
 * mantener consistencia entre el menú lateral y el header de cada página.
 */
export default function OficinaPageHero({ icon: Icon, eyebrow, title, description, right }: OficinaPageHeroProps) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <Icon size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            {eyebrow}
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            {title}
          </h1>
          {description && (
            <p className="text-[14px]" style={{ color: '#6B6480' }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
