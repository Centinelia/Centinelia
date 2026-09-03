// Registry PAC id → provider singleton.
// Un nuevo PAC solo requiere agregar una entry aqui + su implementacion en
// src/lib/invoicing/{id}/index.ts (implements InvoicingProvider).
//
// Los ids deben matchear PAC_CATALOG en SolucionFactibleSection.tsx y el valor
// que se persiste en organizations.invoicing_provider.

import type { InvoicingProvider } from './provider';
import { solucionFactibleProvider } from './solucion-factible';
import { contpaqiTimbraProvider } from './contpaqi';
import { facturamaProvider } from './facturama';

export const PROVIDER_REGISTRY: Record<string, InvoicingProvider> = {
  solucion_factible: solucionFactibleProvider,
  contpaqi_timbra:   contpaqiTimbraProvider,
  facturama:         facturamaProvider,
};

export function getProvider(id: string | null | undefined): InvoicingProvider | null {
  if (!id) return null;
  return PROVIDER_REGISTRY[id] ?? null;
}
