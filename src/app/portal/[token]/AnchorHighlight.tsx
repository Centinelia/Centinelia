'use client';

import { useEffect } from 'react';

const KEY = 'portal-anchor';

export function AnchorHighlight() {
  useEffect(() => {
    let lastHash = '';
    let attempts = 0;

    const interval = setInterval(() => {
      const hash = sessionStorage.getItem(KEY);
      if (!hash) { lastHash = ''; attempts = 0; return; }

      if (hash !== lastHash) { lastHash = hash; attempts = 0; }
      attempts++;
      if (attempts > 100) { sessionStorage.removeItem(KEY); return; } // 5s timeout

      const el = document.getElementById(hash);
      if (!el) return;

      sessionStorage.removeItem(KEY);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('anchor-active');
      void el.offsetWidth;
      el.classList.add('anchor-active');
      setTimeout(() => el.classList.remove('anchor-active'), 2000);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return null;
}
