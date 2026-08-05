'use client';

// @deprecated — Portal Fase 2A eliminó dark theme. Este componente ahora
// es un no-op (retorna null) para no romper los ~13 imports existentes
// en V1 headers, admin, setup, configurar, requests. Fase 3+ los remueve
// al migrar cada página al design system.

interface ThemeToggleProps {
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ThemeToggle(_props: ThemeToggleProps = {}) {
  return null;
}
