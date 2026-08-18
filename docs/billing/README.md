# Empleado Digital de Facturacion

Documentacion tecnica interna del modulo de facturacion de Centinelia.

---

## 1. Overview

El empleado digital de facturacion es un proceso interno que recibe correos con notitas de venta manuscritas, las interpreta via vision computacional, resuelve clientes y productos contra el catalogo del sistema contable del cliente, y registra los datos en archivos Excel estructurados en Dropbox. No timbra CFDIs directamente: su responsabilidad es dejar todo listo para que el contador lo timbre.

### Arquitectura de dos capas

**Capa compartida (Plan A, este modulo)**

Contiene toda la logica que es igual sin importar que ERP o PAC use el cliente:

- Razonamiento LLM (`employee/loop.ts`)
- Extraccion visual de notitas (`vision/`)
- Matching fuzzy de clientes y productos (`matching/`)
- Gestion de reglas por cliente (`rules/`)
- Lectura y escritura de archivos Excel con snapshot obligatorio (`excel/`, `storage/`)
- Correo entrante y saliente (`inbox/`, `mail/`)
- Cola de trabajos y reintentos (`employee/queue.ts`)
- Reportes periodicos y retencion (`reports/`)

**Capa adaptador (por ERP/PAC)**

Cada sistema contable del cliente implementa la interfaz `BillingAdapter` (`src/lib/billing/adapter.ts`). El adaptador expone busqueda fuzzy de clientes y productos, busqueda por RFC/SKU exacto, envio de lotes de facturas y estado de frescura de los datos.

Durante la Fase 1 se usa `MockBillingAdapter` con catalogo en memoria. La Fase 2 conectara el `CONTPAQiAdapter` real.

---

## 2. Estructura del modulo

```
src/lib/billing/
|
|-- adapter.ts                   # Interfaz BillingAdapter + tipos compartidos
|
|-- adapters/
|   |-- mock.ts                  # MockBillingAdapter (testing / Fase 1)
|   `-- __tests__/
|       `-- mock.test.ts
|
|-- employee/
|   |-- loop.ts                  # BillingEmployee: razonamiento LLM principal
|   |-- system-prompt.ts         # Generador de system prompt con parametros dinamicos
|   |-- tools.ts                 # Registro de herramientas del empleado
|   |-- queue.ts                 # Cola de trabajos billing_jobs con claim atomico
|   |-- reassign.ts              # Re-asignacion de jobs a otra integracion
|   `-- __tests__/
|       |-- loop.test.ts
|       |-- queue.test.ts
|       `-- reassign.test.ts
|
|-- matching/
|   |-- client.ts                # matchClient(), learnClientAlias()
|   |-- product.ts               # matchProduct(), learnProductAlias()
|   `-- __tests__/
|       |-- client.test.ts
|       `-- product.test.ts
|
|-- vision/
|   |-- extract.ts               # extractNoteFromImage() via Anthropic claude vision
|   |-- prompt.ts                # Prompt del modelo de vision
|   `-- __tests__/
|       `-- extract.test.ts
|
|-- excel/
|   |-- workbook.ts              # ExcelWorkbook: leer, agregar fila, serializar
|   |-- schemas.ts               # DailySalesSchema, PendingClientSchema
|   `-- __tests__/
|       `-- workbook.test.ts
|
|-- storage/
|   |-- dropbox.ts               # DropboxClient: readFile(), writeFile()
|   |-- snapshot.ts              # SnapshotStorage: snapshot() antes de escritura
|   `-- __tests__/
|       |-- dropbox.test.ts
|       `-- snapshot.test.ts
|
|-- inbox/
|   |-- parse.ts                 # Parser del webhook de correo entrante
|   `-- __tests__/
|       `-- parse.test.ts
|
|-- mail/
|   |-- send.ts                  # sendBillingMail(), replyToInboundEmail()
|   `-- __tests__/
|       `-- send.test.ts
|
|-- rules/
|   |-- apply.ts                 # Aplicacion de reglas de billing_client_rules
|   `-- __tests__/
|       `-- apply.test.ts
|
|-- reports/
|   |-- daily.ts                 # Reporte diario de corte
|   `-- __tests__/
|       `-- daily.test.ts
|
|-- fallback-notify.ts           # Notificaciones de fallback del pool de facturacion
|-- fallback-restore.ts          # Restauracion de estado tras fallo
|-- fallback-validate.ts         # Validacion pre-escritura
|-- plans.ts                     # Planes de facturacion disponibles
|-- pool-loss-notify.ts          # Notificacion de perdida en pool
|-- require-stripe-eligible.ts   # Guard: organización elegible para billing
|-- rollover-cap-notify.ts       # Notificacion de tope de rollover
|-- routing-log.ts               # Log de enrutamiento de facturas
|-- topup-reminder.ts            # Recordatorio de recarga
|-- auto-refill.ts               # Recarga automatica del pool
`-- tz.ts                        # Utilidad de zona horaria
```

Rutas de API relacionadas:

```
src/app/api/billing/
|-- worker/route.ts              # Despacha dequeueAndRun() (cron cada 1 min)
|-- inbox/route.ts               # Webhook de correo entrante (Resend Inbound)
|-- create-checkout/route.ts     # Checkout de Stripe (billing pool)
|-- portal-session/route.ts      # Session de portal Stripe
|-- grace-period-check/route.ts  # Verifica gracia de pago
`-- webhook/route.ts             # Webhook de Stripe

src/app/api/cron/
|-- billing-periodic-cuts/route.ts   # Cortes periodicos semanales/mensuales
`-- billing-retention/route.ts       # Limpieza de datos antiguos
```

---

## 3. Como agregar un adaptador nuevo

### Paso 1: Crear el archivo del adaptador

Crear `src/lib/billing/adapters/<nombre>.ts` e implementar la interfaz `BillingAdapter`:

```typescript
import type {
  BillingAdapter,
  BillingClient,
  BillingClientMatch,
  BillingProduct,
  BillingProductMatch,
  BillingInvoice,
  BillingBatchResult,
  BillingAdapterHealth,
} from '../adapter';

export class MiEmpresaAdapter implements BillingAdapter {
  // REQUERIDO: identificador legible del adaptador. Aparece en logs y system prompt.
  readonly name = 'MiEmpresaAdapter';

  async searchClient(query: string, limit = 3): Promise<BillingClientMatch[]> {
    // Consultar API o BD del ERP externo
    // Ordenar por score descendente, filtrar a score >= 0.3
  }

  async searchProduct(query: string, limit = 3): Promise<BillingProductMatch[]> {
    // Igual que searchClient pero para productos
  }

  async getClientByRFC(rfc: string): Promise<BillingClient | null> {
    // Busqueda exacta por RFC
  }

  async getProductBySKU(sku: string): Promise<BillingProduct | null> {
    // Busqueda exacta por SKU
  }

  async submitInvoiceBatch(invoices: BillingInvoice[]): Promise<BillingBatchResult> {
    // mode 'file': generar XML/ZIP para carga manual
    // mode 'api': enviar al PAC y retornar UUID(s)
  }

  async freshness(): Promise<BillingAdapterHealth> {
    // Retornar lastSyncAt, minutesStale, healthy
  }

  supportsAutoStamping(): boolean {
    // true solo si conecta con PAC y puede timbrar sin intervencion humana
    return false;
  }
}
```

La interfaz completa esta en `src/lib/billing/adapter.ts`. Los tipos `BillingClient`, `BillingProduct`, `BillingInvoice`, `BillingBatchResult` y `BillingAdapterHealth` estan definidos ahi.

### Paso 2: Escribir tests con fixtures reales

Crear `src/lib/billing/adapters/__tests__/<nombre>.test.ts`. Usar fixtures del ERP o PAC real: catalogos de prueba, respuestas de API grabadas (mocks de red). Referencia: `adapters/__tests__/mock.test.ts`.

### Paso 3: Registrar en el factory

Crear o modificar `src/lib/billing/adapters/index.ts` para exportar el nuevo adaptador y registrarlo en el factory. El factory sera usado por `employee/queue.ts` en la Fase 2 (funcion `loadAdapterForIntegration(integrationId)`).

Ejemplo de factory minimo:

```typescript
import { MockBillingAdapter } from './mock';
import { MiEmpresaAdapter } from './mi-empresa';
import type { BillingAdapter } from '../adapter';

export function createAdapter(type: string, config: Record<string, unknown>): BillingAdapter {
  switch (type) {
    case 'mock':
      return new MockBillingAdapter({ clients: [], products: [] });
    case 'mi-empresa':
      return new MiEmpresaAdapter(config);
    default:
      throw new Error(`Adaptador desconocido: ${type}`);
  }
}
```

### Paso 4: Documentar en el spec

Agregar una nueva seccion "Capa adaptador: <Nombre del ERP/PAC>" en el spec de billing:

```
docs/superpowers/specs/2026-08-17-empleado-digital-facturacion-notas-design.md
```

La seccion debe describir: credenciales requeridas, modo de envio (`file` o `api`), proceso de sincronizacion del catalogo y limitaciones conocidas.

---

## 4. Estructura de archivos en Dropbox

La convencion de nombres y carpetas de los archivos Excel que el empleado crea y mantiene esta descrita en el spec, Seccion 5:

```
docs/superpowers/specs/2026-08-17-empleado-digital-facturacion-notas-design.md
```

Resumen rapido:

- `Ventas_YYYY-MM-DD.xlsx` -- ventas del dia de clientes con frecuencia diaria. Una fila por notita.
- `Pendientes_<RFC>.xlsx` -- acumulado de ventas para clientes con frecuencia semanal o mensual.
- Cada escritura crea un snapshot previo via `SnapshotStorage` antes de sobrescribir.

---

## 5. Modelo de datos

Todas las tablas usan `service_role` (admin client). No tienen politicas RLS abiertas al portal.

| Tabla | Descripcion |
|---|---|
| `billing_client_rules` | Reglas por cliente: RFC, frecuencia (`daily`/`weekly`/`monthly`), forma de pago, aliases y notas. |
| `billing_product_aliases` | Aliases aprendidos de productos: SKU del adaptador y texto tal como aparecio en la notita. |
| `billing_activity_log` | Bitacora de actividad del empleado: action_type, severity (`info`/`warning`/`error`), entity_ref y contexto JSON. |
| `billing_incoming_emails` | Correos entrantes: from_address, subject, body_text, attachments_meta, received_at. |
| `billing_jobs` | Cola de trabajos: kind (`process_notes`/`reply_missing_attachments`), status (`pending`/`running`/`done`/`failed`), attempts, last_error. |
| `organization_integrations` | Configuracion de la integracion ERP/PAC por organizacion: tipo de adaptador, credenciales cifradas, ultima sincronizacion. |

Todas las tablas tienen columna `portal_email` (TEXT) como referencia a la organizacion y columna `integration_id` (UUID) para el registro en `organization_integrations`.

---

## 6. Reasoning loop

El loop de razonamiento esta en:

```
src/lib/billing/employee/loop.ts
```

`BillingEmployee.runOnEmail(emailId)` es el punto de entrada:

1. Lee el correo de `billing_incoming_emails`.
2. Verifica frescura del adaptador. Si supera 6 horas sin sincronizacion, escala de inmediato.
3. Carga reglas y aliases actuales para inyectarlos en el system prompt.
4. Construye el system prompt dinamico via `buildSystemPrompt()` (`system-prompt.ts`).
5. Registra las herramientas del empleado via `buildEmployeeTools()` (`tools.ts`).
6. Ejecuta el loop LLM (max 20 iteraciones, `max_tokens: 4096`).
7. Despacha los tool calls que el modelo invoca.
8. Retorna `RunResult` con contadores: `processed`, `escalated`, `consulted`, `errors`.

**System prompt:** `src/lib/billing/employee/system-prompt.ts`

`buildSystemPrompt(params)` recibe `emailId`, `orgName`, `adapterName`, `freshnessSummary`, `reglasJson` y `aliasesJson`. Genera el prompt con identidad del empleado, filosofia de autonomia y el procedimiento estandar de procesamiento de notitas.

**Tools:** `src/lib/billing/employee/tools.ts`

`buildEmployeeTools(ctx)` retorna el array de herramientas disponibles para el LLM:

| Tool | Descripcion |
|---|---|
| `extract_note_from_image` | Extrae datos de foto de notita via modelo de vision. |
| `match_client` | Busqueda fuzzy de cliente en el catalogo del adaptador. |
| `match_product` | Busqueda fuzzy de producto en el catalogo del adaptador. |
| `learn_client_alias` | Registra alias aprendido para un cliente. |
| `learn_product_alias` | Registra alias aprendido para un producto. |
| `get_billing_rules` | Lee las reglas configuradas para un RFC en `billing_client_rules`. |
| `read_excel` | Lee un archivo Excel de Dropbox. |
| `write_excel` | Escribe un archivo Excel (incluye snapshot obligatorio). |
| `append_daily_sale` | Helper de alto nivel: agrega fila a `Ventas_YYYY-MM-DD.xlsx`. |
| `append_pending_client_sale` | Helper de alto nivel: agrega fila a `Pendientes_<RFC>.xlsx`. |
| `send_email` | Envia correo saliente via Resend. |
| `reply_email` | Responde al correo original preservando threading SMTP. |
| `log_activity` | Registra evento en `billing_activity_log`. |
| `escalate` | Escalacion urgente: correo al responsable + log con severity=error. |
| `freshness_check` | Consulta estado del adaptador. |

---

## 7. Cron endpoints

| Endpoint | Schedule | Descripcion |
|---|---|---|
| `/api/billing/worker` | `* * * * *` (cada 1 min) | Llama `dequeueAndRun()`: toma un job pendiente y ejecuta el loop LLM. |
| `/api/cron/billing-periodic-cuts` | `0 18 * * *` (18:00 diario) | Genera cortes para clientes con frecuencia semanal o mensual. |
| `/api/cron/billing-retention` | `0 3 1 * *` (3 AM el 1 de cada mes) | Rota archivos viejos de Dropbox (`Diarios/` e `Importables_CONTPAQi/procesados/`) a carpetas `_Historico/`. Prueba snapshots de Supabase Storage, conservando los 30 mas recientes por archivo. No limpia `billing_activity_log` (pendiente). |

Todos los cron endpoints se autentican con el header `Authorization: Bearer <CRON_SECRET>` via `src/lib/auth/cron-auth.ts`.

El webhook de correo entrante esta en `/api/billing/inbox` y se autentica con `EMAIL_INBOUND_SECRET`.

---

## 8. Configuracion

Variables de entorno requeridas para el modulo de facturacion:

| Variable | Descripcion |
|---|---|
| `BILLING_LOOP_MODEL` | Modelo LLM para el loop de razonamiento. Default: `claude-sonnet-4-6`. |
| `BILLING_VISION_MODEL` | Modelo para extraccion visual de notitas. |
| `BILLING_DROPBOX_TOKEN` | Token de acceso a Dropbox de la organizacion. |
| `BILLING_DROPBOX_BASE_PATH` | Ruta base en Dropbox donde se crean los Excel. Ej: `/Facturacion/2026`. |
| `BILLING_ESCALATION_EMAIL` | Email al que el empleado envia alertas de escalacion urgente. |
| `CRON_SECRET` | Secret para autenticar los endpoints de cron. |
| `EMAIL_INBOUND_SECRET` | Secret para autenticar el webhook de correo entrante. |

Variables de entorno ya presentes en el proyecto y usadas por este modulo:

| Variable | Descripcion |
|---|---|
| `ANTHROPIC_API_KEY` | Clave del SDK de Anthropic para LLM y vision. |
| `RESEND_API_KEY` | Clave de Resend para correo saliente. |
| `RESEND_FROM_EMAIL` | Direccion de envio para correos del empleado. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de service_role para `createAdminClient()`. |

---

## 9. Estado actual

### Fase 1: completa (semi-automatico con MockBillingAdapter)

- Toda la capa compartida implementada y con tests.
- Loop LLM funcional, tools completas, cola de trabajos con reintentos.
- Correo entrante y saliente operativos.
- Snapshots obligatorios en Dropbox antes de cada escritura.
- Adaptador activo: `MockBillingAdapter` (catalogo en memoria, modo `file`).
- No timbra CFDIs directamente: genera filas en Excel para carga manual por el contador.

### Fase 2: pendiente (adaptador CONTPAQi real)

- Implementar `CONTPAQiAdapter` en `src/lib/billing/adapters/contpaqi.ts`.
- Conectar la cola a `organization_integrations` para cargar el adaptador correcto por integracion.
- Tests con fixtures reales del catalogo CONTPAQi.
- Documentar en el spec, Seccion 8 (Puente CONTPAQi).

### Fase 3: pendiente (UI portal)

- Vista en el portal del cliente para revisar `billing_activity_log` y `billing_jobs`.

### Fase 4: pendiente (go-live produccion)

- Instalador MSI para servicio Windows de sincronizacion CONTPAQi.
- Certificados CSD por organizacion en el vault.

---

## 10. Referencias

| Recurso | Ubicacion |
|---|---|
| Spec de diseno completo | `docs/superpowers/specs/2026-08-17-empleado-digital-facturacion-notas-design.md` |
| Plan de implementacion A | `docs/superpowers/sdd/2026-08-17-empleado-facturacion-plan-a-base/` |
| Interfaz BillingAdapter | `src/lib/billing/adapter.ts` |
| Loop de razonamiento | `src/lib/billing/employee/loop.ts` |
| System prompt | `src/lib/billing/employee/system-prompt.ts` |
| Tools del empleado | `src/lib/billing/employee/tools.ts` |
| Adaptador mock | `src/lib/billing/adapters/mock.ts` |
| Infra existente de facturacion (PAC/CSD) | `src/lib/invoicing/` |
