'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={className}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          34,
        height:         34,
        borderRadius:   10,
        background:     'var(--c-surface-2)',
        border:         '1px solid var(--c-border)',
        cursor:         'pointer',
        color:          'var(--c-text-2)',
        flexShrink:     0,
        transition:     'background 0.15s, color 0.15s',
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
