'use client';

import { useReportWebVitals } from 'next/web-vitals';

/**
 * Reporta Core Web Vitals (LCP, CLS, INP, FCP, TTFB, FID) a Google
 * Analytics 4 como custom events. Reemplaza @vercel/speed-insights
 * ($10/mes) usando GA que ya está instalado (gratis).
 *
 * Ver los datos en GA4:
 *   Reports → Engagement → Events → filtrar por event_name = "web_vitals"
 *
 * O crear un exploration:
 *   Explore → Free form → dimensiones: metric_name + page_path
 *                       → métricas: metric_value_avg
 *
 * Umbrales Google Core Web Vitals:
 *   LCP: <2500ms good, >4000ms poor
 *   CLS: <0.1 good, >0.25 poor
 *   INP: <200ms good, >500ms poor
 */
export default function WebVitalsReporter() {
  useReportWebVitals(metric => {
    // Solo enviar si GA está disponible
    if (typeof window === 'undefined') return;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== 'function') return;

    // Convertir CLS a int (multiplicado x1000) porque GA no maneja
    // decimales bien. LCP/FCP/TTFB/INP ya vienen en ms enteros.
    const value = metric.name === 'CLS'
      ? Math.round(metric.value * 1000)
      : Math.round(metric.value);

    gtag('event', 'web_vitals', {
      metric_name:  metric.name,        // LCP | CLS | INP | FCP | TTFB | FID
      metric_value: value,
      metric_id:    metric.id,          // Unique per page load
      metric_rating: metric.rating,     // 'good' | 'needs-improvement' | 'poor'
      page_path:    window.location.pathname,
      non_interaction: true,            // No cuenta como user interaction
    });
  });

  return null;
}
