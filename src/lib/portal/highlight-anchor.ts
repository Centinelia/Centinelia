/**
 * Highlights an anchor element with a lila pulse, walking down to the first
 * rounded descendant if the anchor itself is a transparent wrapper. Keeps
 * the pulse shape matching the visible card instead of drawing sharp corners
 * around an invisible div.
 *
 * Shared by HashScrollHighlight (URL-driven) and both PortalSidebar
 * variants (click-driven) so all pulses have consistent rounded corners.
 */
export function pulseAnchor(anchorId: string): void {
  const anchor = document.getElementById(anchorId);
  if (!anchor) return;

  const parseR = (v: string) => parseFloat(v) || 0;
  const cs = window.getComputedStyle(anchor);
  let target: HTMLElement = anchor;
  if (parseR(cs.borderTopLeftRadius) === 0) {
    const candidate = anchor.querySelector<HTMLElement>(
      '[class*="rounded"], [style*="border-radius"]',
    );
    if (candidate) {
      const ccs = window.getComputedStyle(candidate);
      if (parseR(ccs.borderTopLeftRadius) > 0) target = candidate;
    }
  }

  target.style.transition = 'box-shadow 0.15s';
  target.style.boxShadow  = '0 0 0 3px rgba(108,59,255,0.7), inset 0 0 0 9999px rgba(108,59,255,0.15)';
  setTimeout(() => {
    target.style.transition = 'box-shadow 1.5s ease-out';
    target.style.boxShadow  = '';
    setTimeout(() => { target.style.transition = ''; }, 1500);
  }, 600);
}
