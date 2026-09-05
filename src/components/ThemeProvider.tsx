'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});

export function ThemeProvider({ children, storageKey = 'Centinelia-theme', defaultTheme = 'dark' }: {
  children: React.ReactNode;
  storageKey?: string;
  defaultTheme?: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  useEffect(() => {
    const stored = (localStorage.getItem(storageKey) as Theme | null) ?? defaultTheme;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored);
    document.documentElement.setAttribute('data-theme', stored);
  }, [storageKey, defaultTheme]);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(storageKey, next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
