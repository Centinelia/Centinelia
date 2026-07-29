'use client';

import { motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  children:   ReactNode;
  className?: string;
  style?:     CSSProperties;
  delay?:     number;
  y?:         number;
}

/**
 * Sección con fade-in cuando entra en viewport. Con failsafes:
 * - Si el usuario prefiere reducir movimiento, aparece inmediatamente.
 * - Si el observer tarda >800ms en dispararse (bug de hydration o full-page
 *   screenshot), fuerza la aparición para evitar contenido invisible.
 * - Si `useInView` no matchea nunca (por ejemplo cuando el elemento ya está
 *   dentro del viewport en primer render), después de un timer de 200ms
 *   marca como visible.
 */
export default function AnimatedSection({ children, className, style, delay = 0, y = 32 }: Props) {
  const ref            = useRef(null);
  const inView         = useInView(ref, { once: true, margin: '-60px 0px' });
  const reduceMotion   = useReducedMotion();
  const [forceVisible, setForceVisible] = useState(false);

  useEffect(() => {
    // Failsafe: si después de 800ms el intersection observer no disparó,
    // asume que la sección ya está en viewport (o el observer falló) y muestra.
    const id = window.setTimeout(() => setForceVisible(true), 800);
    return () => window.clearTimeout(id);
  }, []);

  const visible = inView || forceVisible || reduceMotion;

  return (
    <motion.div
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, y }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
