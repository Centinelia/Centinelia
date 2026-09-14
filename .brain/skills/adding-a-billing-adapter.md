---
name: adding-a-billing-adapter
description: Use when adding a new PAC (billing provider) to Centinelia — InvoiceOne, Facturama, Solución Factible, CONTPAQi, etc. Enforces InvoicingProvider interface + contract tests + never-throws invariant.
type: skill
owner: nazre
last_verified: 2026-09-14
inputs:
  - PAC name (facturama | solucion_factible | invoiceone | contpaqi_timbra | otro)
  - transport (REST/JSON | SOAP | writer .NET)
  - soporta REP (Complemento de Pago)?
  - creds sandbox reales o mock mode
output: PR con nueva clase implementando InvoicingProvider + entry en registry + contract test verde
---

# Adding a billing adapter (PAC)

## Antes de escribir código

Los adapters de facturación son el sistema más brittle de Centinelia:
- Cada PAC tiene shape de respuesta distinta (Facturama devuelve `Complement` sin -o pero el request usa `Complemento`)
- Errores impredecibles (SF regresa namespace mismatch como SOAP Fault; Contpaqi puede throw si `SUB_KEY` no está set)
- Sin contract → adapter X funciona en cancelaciones pero adapter Y throws en el mismo caso
- Cada bug de divergencia se descubre cuando un cliente real intenta timbrar

Todos estos casos están cubiertos por el contract suite. **NO agregues un adapter sin correr `runProviderContract` contra él** — la divergencia se detecta la primera vez.

---

## Interface obligatoria

Tu adapter debe implementar `InvoicingProvider` de `src/lib/invoicing/provider.ts`:

```ts
export interface InvoicingProvider {
  timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult>;
  timbrarPago(pago: PagoInput, opts: TimbrarOpts): Promise<StampResult>;
  cancelar(uuid, motivo, uuidSustituto, creds, csd, opts): Promise<CancelSubmitResult>;
  consultarEstatusCancelacion(uuid, creds, opts): Promise<CancelStatus>;
}
```

---

## Contrato duro (never-throws)

**Los 4 methods DEBEN atrapar todos los errores y retornar una respuesta shaped.** Si el transport falla (network, timeout, malformed response), NO lances — retorna:

| Método | En caso de error de transport |
|---|---|
| `timbrar` | `{ ok: false, code: 502, message, retryable: true }` |
| `timbrarPago` (unsupported) | `{ ok: false, code: 501, message, retryable: false }` |
| `cancelar` | `{ status: 'rejected', code: 502, message }` |
| `consultarEstatusCancelacion` | `{ status: 'pending', message }` (safe fallback) |

**Por qué**: los callers (Nala, Neka, empleado facturación) confían en el shape para tomar decisiones. Un throw propaga hasta el LLM que lo interpreta como un fallo genérico y escala mal.

---

## Pattern estándar

```ts
export class MiPacProvider implements InvoicingProvider {
  async timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult> {
    try {
      const payload = buildPayload(cfdi);
      const resp = await httpCall(url, payload, opts.timeoutMs);
      if (resp.status !== 200) {
        return { ok: false, code: resp.status, message: extract(resp), retryable: retryableCode(resp.status) };
      }
      return { ok: true, uuid: ..., selloSat: ..., xmlTimbrado: ..., qrPng: ..., providerRef: ... };
    } catch (err) {
      return { ok: false, code: 502, message: errorMessage(err), retryable: true };
    }
  }

  async timbrarPago(_pago, _opts): Promise<StampResult> {
    // Si el PAC no soporta REP, retorna 501:
    return { ok: false, code: 501, message: 'REP no soportado por este PAC', retryable: false };
  }

  async cancelar(uuid, motivo, uuidSustituto, creds, _csd, opts): Promise<CancelSubmitResult> {
    try {
      const resp = await httpCall(...);
      if (resp.status !== 200) return { status: 'rejected', code: resp.status, message: '...' };
      return { status: 'sent_to_sat', message: '...' };
    } catch (err) {
      return { status: 'rejected', code: 502, message: errorMessage(err) };
    }
  }

  async consultarEstatusCancelacion(uuid, creds, opts): Promise<CancelStatus> {
    try {
      const resp = await httpCall(...);
      // Mapear el string del PAC a UNO de: 'accepted' | 'pending' | 'rejected' | 'expired'.
      // NUNCA retornes un string libre — el enum es fijo.
      return { status: 'accepted', message: '...' };
    } catch (err) {
      return { status: 'pending', message: errorMessage(err) };
    }
  }
}

export const miPacProvider = new MiPacProvider();
```

---

## Registrar el adapter

En `src/lib/invoicing/registry.ts`:

```ts
export const PROVIDER_REGISTRY: Record<string, InvoicingProvider> = {
  ...
  mi_pac: miPacProvider,
};
```

El `id` debe matchear `PAC_CATALOG` en `FacturacionSection.tsx` y el valor que se persiste en `organizations.invoicing_provider`.

---

## Contract test obligatorio

Crea `src/lib/invoicing/<mi-pac>/__tests__/contract.test.ts`:

```ts
import { runProviderContract } from '../../__tests__/contract';
import { miPacProvider } from '../index';

runProviderContract('mi-pac', {
  provider:              () => miPacProvider,
  supportsRep:           true,   // false si el PAC no soporta REP
  hasSelfContainedMock:  false,  // true solo si tienes modo mock in-memory (como invoiceone)
});
```

El suite verifica:
- Los 4 methods están expuestos y son funciones
- Si `supportsRep=false`: `timbrarPago` retorna code 501
- `consultarEstatusCancelacion` NUNCA throws (fallback 'pending')
- `cancelar` NUNCA throws (fallback 'rejected')
- Si `hasSelfContainedMock=true`: happy path retorna shape válido de StampResult

**Si tu contract test falla en "never throws", es un bug real del adapter — NO lo silences.** Agrega try/catch al final del method con el fallback correcto.

---

## Bugs históricos que el contract previene

- **SF cancelar/consultarEstatus** (fix 2026-09-14): SOAP fault "namespace mismatch" throwed hasta el caller. Nala interpretaba como fallo total en vez de rechazo del SAT.
- **CONTPAQi cancelar/consultarEstatus** (fix 2026-09-14): env var `CONTPAQI_TIMBRA_SUB_KEY` no set throwed en `baseHeaders()`. Cliente sin config veía 500 en vez de mensaje claro.
- **Facturama `Complement` vs `Complemento`** (docs 2026-09-02): request usa `Complemento`, response devuelve `Complement`. Catchado por type guard antes de que llegara al contract test.

---

## Custom transport helpers

Cada PAC tiene su propio módulo de transport:
- **Facturama** (REST/JSON): `facturama/api-client.ts` — Basic Auth + fetch
- **SF** (SOAP): `solucion-factible/soap-client.ts` — XML envelope + fetch
- **Contpaqi** (REST/JSON): inline `jsonCall` — Azure APIM
- **InvoiceOne** (SOAP + mock): `invoiceone/soap-client.ts` + `mock.ts`

Reusa los helpers cuando puedas (ej. `signXml` de SF para adapters SOAP), pero cada adapter tiene lo suyo. Lo COMÚN vive en `provider.ts` (types) y `__tests__/contract.ts` (invariantes).

---

## Cuándo NO usar esta skill

- Modificar payload builder de un PAC existente sin cambiar el shape del response → commit normal
- Agregar entry en el registry para un adapter que ya existe → 1-linea PR
- Cambiar el orquestador (`emitir-factura.ts`) sin tocar adapters → no aplica esta skill

---

## Ver también

- `src/lib/invoicing/provider.ts` — canonical interface + tipos
- `src/lib/invoicing/__tests__/contract.ts` — contract test factory
- `src/lib/invoicing/registry.ts` — cómo registrar un provider
- `src/lib/invoicing/invoiceone/mock.ts` — ejemplo de modo mock in-memory (útil como referencia)
