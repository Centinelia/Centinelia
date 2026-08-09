'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pulseAnchor } from '@/lib/portal/highlight-anchor';

/**
 * Reads window.location.hash on mount, on hashchange, and on route
 * navigation (pathname/searchParams change). When a hash exists, waits for
 * the target element to appear in the DOM and then:
 *   1. Smooth-scrolls to it with a 80px top offset
 *   2. Applies a lila pulse highlight via pulseAnchor (walks down to the
 *      first rounded descendant if the anchor is a transparent wrapper)
 *
 * Mount once at page level — decoupled from sidebar so it works whether the
 * user clicked a sidebar item, hit back/forward, or opened a shared link.
 */
export default function HashScrollHighlight() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const scrollAndPulse = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (attempts > 100) { clearInterval(timer); return; }
        const el = document.getElementById(hash);
        if (!el) return;
        clearInterval(timer);

        const rect = el.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' });
        pulseAnchor(hash);
      }, 50);

      return () => clearInterval(timer);
    };

    const cleanup = scrollAndPulse();
    window.addEventListener('hashchange', scrollAndPulse);
    return () => {
      cleanup?.();
      window.removeEventListener('hashchange', scrollAndPulse);
    };
  }, [pathname, searchParams]);

  return null;
}
