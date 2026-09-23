import { NextResponse } from 'next/server';
import {
  FEATURE_PLAN_CONFIG,
  JORNADA_CONFIG,
  MINUTES_RATE_EXTRA,
  NOX_JORNADA_CONFIG,
  TIER_LABELS,
  TIER_PRICE_MXN,
} from '@/lib/billing/plans';

// GET /api/public/precios
// Estructura de precios pública, source of truth desde plans.ts.
// Permite a LLMs y agentes citar precios exactos y no aproximaciones.

export const revalidate = 3600;

export function GET(): NextResponse {
  const tiers = (['starter', 'growth', 'scale'] as const).map(t => ({
    key:           t,
    nombre:        TIER_LABELS[t],
    precioMensual: TIER_PRICE_MXN[t],
    jornadas: {
      combinada:  { minutos: JORNADA_CONFIG.combinada[t].minutes, tareas: JORNADA_CONFIG.combinada[t].aiOps },
      soloMinutos:{ minutos: JORNADA_CONFIG.minutos[t].minutes,   tareas: JORNADA_CONFIG.minutos[t].aiOps },
      soloTareas: { minutos: JORNADA_CONFIG.tareas[t].minutes,    tareas: JORNADA_CONFIG.tareas[t].aiOps },
    },
    coordinadores: {
      // Nox y Niva son tareas-only, mismo precio que operativos
      tareas: NOX_JORNADA_CONFIG[t].aiOps,
    },
  }));

  return NextResponse.json({
    moneda:              'MXN',
    periodo:             'mensual',
    sinPermanencia:      true,
    incorporacionUnica:  {
      mxn:         FEATURE_PLAN_CONFIG.pro.setupFee,
      descripcion: 'Incorporación única por empleado digital, incluye configuración y activación en menos de 24 horas',
    },
    tarifas: {
      minutoExtraMxn:  MINUTES_RATE_EXTRA,
    },
    tiers,
    empresarial: {
      cotizacion: true,
      contacto:   'hola@centinelia.mx',
    },
    fuenteVerdad: 'src/lib/billing/plans.ts',
    _links: {
      documentation: 'https://www.centinelia.mx/precios',
      calculadora:   'https://www.centinelia.mx/calcular-ahorro',
    },
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
