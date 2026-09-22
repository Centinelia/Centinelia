import { describe, it, expect } from 'vitest';
import { generateLlmsFullContent } from '@/lib/llms/full-content';
import {
  FEATURE_PLAN_CONFIG,
  JORNADA_CONFIG,
  MINUTES_RATE_EXTRA,
  NOX_JORNADA_CONFIG,
  TIER_PRICE_MXN,
} from '@/lib/billing/plans';

const content = generateLlmsFullContent();

describe('llms-full.txt', () => {
  it('no contiene em-dashes (regla dura de copy)', () => {
    expect(content.includes('—')).toBe(false);
  });

  it('no vende WhatsApp saliente (feedback descartado)', () => {
    // "WhatsApp saliente" o "escalación a WhatsApp" como feature es un
    // reclamo falso. Solo mensajería entrante es válida.
    expect(content).not.toMatch(/escalación a WhatsApp/i);
    expect(content).not.toMatch(/manda WhatsApp saliente\s*$/im);
  });

  it('no usa el término obsoleto "Plan Comercial" o "Plan Pro"', () => {
    expect(content).not.toMatch(/Plan Comercial/);
    expect(content).not.toMatch(/Plan Pro\b/);
  });

  it('incluye los 13 empleados digitales (roster real)', () => {
    const roster = ['Nox', 'Niva', 'Nia', 'Noah', 'Nara', 'Neo', 'Naia', 'Nico', 'Nelia', 'Nova', 'Nala', 'Nalú', 'Nami'];
    for (const nombre of roster) {
      expect(content, `Falta ${nombre} en llms-full`).toContain(nombre);
    }
  });

  it('los precios coinciden con plans.ts (source of truth)', () => {
    for (const price of Object.values(TIER_PRICE_MXN)) {
      if (price === 0) continue;
      expect(content, `Falta precio $${price.toLocaleString('es-MX')}`).toContain(price.toLocaleString('es-MX'));
    }
  });

  it('la asignación de minutos y tareas de la jornada combinada refleja plans.ts', () => {
    const tiers = ['starter', 'growth', 'scale'] as const;
    for (const tier of tiers) {
      const cfg = JORNADA_CONFIG.combinada[tier];
      expect(content).toContain(`${cfg.minutes.toLocaleString('es-MX')} min y ${cfg.aiOps.toLocaleString('es-MX')} tareas`);
    }
  });

  it('las asignaciones de Solo Minutos y Solo Tareas reflejan plans.ts', () => {
    const tiers = ['starter', 'growth', 'scale'] as const;
    for (const tier of tiers) {
      const min = JORNADA_CONFIG.minutos[tier];
      const tar = JORNADA_CONFIG.tareas[tier];
      expect(content).toContain(`${min.minutes.toLocaleString('es-MX')} min`);
      expect(content).toContain(`${tar.aiOps.toLocaleString('es-MX')} tareas`);
    }
  });

  it('coordinadores Nox y Niva reflejan NOX_JORNADA_CONFIG', () => {
    for (const cfg of Object.values(NOX_JORNADA_CONFIG)) {
      if (cfg.aiOps === 0) continue;
      expect(content).toContain(cfg.aiOps.toLocaleString('es-MX'));
    }
  });

  it('incorporación única refleja FEATURE_PLAN_CONFIG.pro.setupFee', () => {
    expect(content).toContain(FEATURE_PLAN_CONFIG.pro.setupFee.toLocaleString('es-MX'));
  });

  it('tarifa de minutos extra refleja MINUTES_RATE_EXTRA', () => {
    expect(content).toContain(`$${MINUTES_RATE_EXTRA.toLocaleString('es-MX')}`);
  });

  it('incluye ambos teléfonos correctos (ventas + demo Nia)', () => {
    expect(content).toContain('+52 81 1633 3559'); // ventas
    expect(content).toContain('+52 81 2188 8490'); // demo Nia
  });

  it('incluye las 5 industrias con sus URLs canónicas', () => {
    const industrias = ['clinicas', 'restaurantes', 'despachos', 'inmobiliarias', 'tiendas'];
    for (const slug of industrias) {
      expect(content).toContain(`https://www.centinelia.mx/industrias/${slug}`);
    }
  });

  it('categoriza como "empleado digital", no "agente de voz"', () => {
    expect(content).toMatch(/empleado[s]? digital(es)?/i);
    expect(content).not.toMatch(/^Categoría:.*agente de voz/im);
  });

  it('tiene las secciones numeradas obligatorias', () => {
    const sections = [
      '## 1. Qué es Centinelia',
      '## 2. El equipo de empleados digitales',
      '## 3. Precios y planes',
      '## 4. Diferenciadores clave',
      '## 5. Cómo funciona técnicamente',
      '## 6. Casos por industria',
      '## 7. Pack Ciclo OC-CFDI',
      '## 8. Comparación con otras plataformas',
      '## 9. Preguntas frecuentes generales',
      '## 10. Contacto',
      '## 11. Páginas del sitio',
      '## 12. Categorización',
    ];
    for (const s of sections) {
      expect(content, `Falta sección ${s}`).toContain(s);
    }
  });

  it('incluye las 3 comparaciones vs competidor', () => {
    for (const slug of ['bland-ai', 'retell-ai', 'vapi']) {
      expect(content).toContain(`https://www.centinelia.mx/vs/${slug}`);
    }
    expect(content).toContain('Bland AI');
    expect(content).toContain('Retell AI');
    expect(content).toContain('Vapi.ai');
  });

  it('el body es sustancialmente más largo que llms.txt corto', () => {
    // llms.txt corto ronda 6-8 KB. llms-full debe ser >20 KB para justificar
    // su existencia (si no, no aporta sobre el corto).
    expect(content.length).toBeGreaterThan(20_000);
  });
});
