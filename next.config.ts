import type { NextConfig } from "next";

// CSP domains
// script/style: 'unsafe-inline' required — Next.js injects inline scripts for hydration.
//   Upgrade to nonce-based CSP when full nonce support is wired into middleware.
// media-src https: broad — covers Vapi recording CDN and ElevenLabs preview URLs
//   whose exact subdomains vary per account. Tighten once domains are confirmed stable.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    "https://*.supabase.co wss://*.supabase.co",      // Supabase DB + Realtime
    "https://api.stripe.com https://js.stripe.com",   // Stripe
    "https://api.vapi.ai wss://api.vapi.ai",           // Vapi REST + WS
    "wss://*.daily.co https://*.daily.co",             // Daily.co WebRTC (used by Vapi web SDK)
    "https://api.elevenlabs.io",                       // ElevenLabs (voice sample API)
    "https://www.google-analytics.com https://analytics.google.com",  // GA4
    "https://www.googletagmanager.com",                // GTM
  ].join(" "),
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "frame-src https://js.stripe.com https://checkout.stripe.com https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://checkout.stripe.com",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    deviceSizes: [640, 828, 1080, 1200, 1920, 2560, 3840],
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      // URLs comunes que 404 — redirect a la más cercana en intención.
      { source: '/precios',       destination: '/#pricing',    permanent: false },
      { source: '/como-funciona', destination: '/empleados',   permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy',    value: CSP },
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control',     value: 'on' },
          { key: 'Strict-Transport-Security',  value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
