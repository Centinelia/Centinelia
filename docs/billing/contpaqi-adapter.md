# CONTPAQi Comercial Pro: Guia Tecnica del Adaptador

Documentacion interna del Plan B del empleado digital de facturacion.
Audiencia: desarrolladores que mantienen o extienden el adaptador CONTPAQi.

---

## 1. Overview

El adaptador CONTPAQi conecta tres subsistemas del Plan B:

| Subsistema | Rol |
|---|---|
| **Empleado digital** (`BillingEmployee`, `employee/loop.ts`) | Razonamiento LLM que procesa notitas de venta. Invoca las 6 operaciones del `BillingAdapter`. |
| **Windows agent** (`BillingContpaqiReader.exe`) | Proceso .NET 8 en la maquina del cliente. Lee la BD Firebird/SQL Server de CONTPAQi y sube CSVs + JSON de frescura a Dropbox cada `SyncIntervalMinutes` minutos (default 15). |
| **CONTPAQiAdapter** (`adapters/contpaqi.ts`) | Implementacion de `BillingAdapter` que vive en Centinelia. Lee los CSVs de Dropbox con cache en memoria (TTL 10 min), expone busqueda fuzzy de clientes y productos, y genera XMLs importables en `submitInvoiceBatch`. |
| **Generador XML** (`contpaqi/xml-import.ts`) | Convierte un array de `BillingInvoice` al formato ADD de CONTPAQi Comercial. Sin dependencias externas. |
| **Registry** (`adapters/index.ts`) | `buildAdapter(config)` recibe el JSONB de `organization_integrations.config` y retorna la instancia correcta (`CONTPAQiAdapter` o `MockBillingAdapter`). |

El flujo de datos es unidireccional a traves de Dropbox: el agent escribe, Centinelia lee. No hay comunicacion directa entre los dos procesos.

```
CONTPAQi BD (Firebird/SQL Server)
    |
    v
BillingContpaqiReader.exe   (Windows, maquina del cliente)
    |  contpaqi_clientes.csv
    |  contpaqi_productos.csv
    |  last_sync.json
    v
Dropbox (<basePath>/Config/)
    |
    v
CONTPAQiAdapter              (Centinelia, servidor)
    |  busqueda fuzzy
    |  freshness check
    |  submitInvoiceBatch -> facturas_YYYY-MM-DD_<8hex>.xml
    v
Dropbox (<basePath>/Importables_CONTPAQi/pendientes/)
    |
    v
CONTPAQi (importacion manual por el contador)
```

---

## 2. Contrato CSV: Windows agent a Centinelia

Este contrato es load-bearing entre ambos subsistemas. Cualquier cambio requiere sincronizar ambos lados (el writer en `CsvWriter.cs` y el parser en `csv-parser.ts`).

### Encoding y formato comun

- Encoding: **UTF-8 con BOM** (0xEF 0xBB 0xBF al inicio del archivo).
- Separador de campos: coma `,`.
- Quoting: **RFC 4180** (campo entre comillas dobles si contiene coma, comilla doble o salto de linea; comilla doble dentro del campo se escapa como `""`).
- Terminador de linea: **CRLF** (`\r\n`).
- Primera linea: cabecera de columnas en minusculas (sin BOM en la cabecera, el BOM va antes de la primera linea).

### `contpaqi_clientes.csv`

Ubicacion en Dropbox: `<basePath>/Config/contpaqi_clientes.csv`

Cabecera exacta:

```
rfc,adapter_client_id,razon_social,uso_cfdi,regimen_fiscal,codigo_postal,email,telefono
```

| Columna | Tipo | Notas |
|---|---|---|
| `rfc` | TEXT | RFC del receptor, normalizado a MAYUSCULAS por el agent. |
| `adapter_client_id` | TEXT | Codigo interno de CONTPAQi (campo `cCodigoCliente` en `admClientes`). |
| `razon_social` | TEXT | Razon social completa. |
| `uso_cfdi` | TEXT | Clave SAT de uso CFDI (ej: `G03`, `P01`). |
| `regimen_fiscal` | TEXT | Clave SAT de regimen fiscal (ej: `601`, `612`). |
| `codigo_postal` | TEXT | Codigo postal del domicilio fiscal del receptor. |
| `email` | TEXT | Email registrado en CONTPAQi. No forma parte de `BillingClient`; solo informativo. |
| `telefono` | TEXT | Telefono registrado en CONTPAQi. No forma parte de `BillingClient`; solo informativo. |

Ejemplo de una fila:

```
XAXX010101000,CLI042,"Publico en General, SA de CV",G03,616,64000,contacto@ejemplo.com,8181234567
```

### `contpaqi_productos.csv`

Ubicacion en Dropbox: `<basePath>/Config/contpaqi_productos.csv`

Cabecera exacta:

```
sku,nombre,unidad,precio,clave_sat,iva_tasa
```

| Columna | Tipo | Notas |
|---|---|---|
| `sku` | TEXT | Codigo de articulo en CONTPAQi (campo `cCodigoProducto` en `admProductos`). |
| `nombre` | TEXT | Nombre del producto o servicio. |
| `unidad` | TEXT | Unidad de medida (ej: `PZA`, `KGS`, `SERV`). |
| `precio` | DECIMAL | Precio unitario base. Punto decimal `.` como separador; nunca coma. Formato `0.0#` (ej: `1500.0`, `18.5`). |
| `clave_sat` | TEXT | Clave del catalogo de productos del SAT. |
| `iva_tasa` | DECIMAL | Tasa de IVA como decimal (ej: `0.16`, `0.0`). Mismo formato que `precio`. |

Ejemplo:

```
SERV001,Servicio de Contabilidad Mensual,SERV,4500.0,84111506,0.16
```

### `last_sync.json`

Ubicacion en Dropbox: `<basePath>/Config/last_sync.json`

Schema completo:

```json
{
  "last_sync_at": "2026-08-18T21:15:00.000Z",
  "status": "ok",
  "records": {
    "clients": 342,
    "products": 87
  },
  "duration_ms": 4321,
  "agent_version": "0.1.0"
}
```

En caso de error parcial o total, se agrega el campo `error_message`:

```json
{
  "last_sync_at": "2026-08-18T21:15:00.000Z",
  "status": "error",
  "records": { "clients": 0, "products": 0 },
  "duration_ms": 312,
  "agent_version": "0.1.0",
  "error_message": "Unable to open database: file not found"
}
```

Valores de `status`:

| Valor | Significado |
|---|---|
| `"ok"` | Ambos CSVs subidos correctamente. |
| `"partial"` | Al menos uno de los dos CSVs fallo; el otro se subio. |
| `"error"` | Ambos CSVs fallaron (ej: BD inaccesible). |

`last_sync_at` registra el timestamp de INICIO del ciclo de sincronizacion (no el fin).

---

## 3. Config JSONB de `organization_integrations`

La columna `config` (tipo JSONB) de la tabla `organization_integrations` contiene la configuracion del adaptador para cada organizacion. El tipo TypeScript es `OrganizationIntegrationConfig` en `src/lib/billing/adapters/index.ts`.

### Schema completo

```typescript
interface OrganizationIntegrationConfig {
  // Discriminador del adaptador
  type: 'contpaqi' | 'mock';

  // Credenciales Dropbox (requerido para type='contpaqi')
  dropbox_token?: string;        // Token de acceso a la cuenta Dropbox de la organizacion
  dropbox_base_path?: string;    // Ruta raiz, ej: '/acme/contpaqi'

  // Datos fiscales del emisor (requerido para type='contpaqi')
  fiscal?: {
    rfc_emisor: string;                  // RFC del emisor (empresa que factura)
    regimen_fiscal: string;              // Clave SAT, ej: '601', '612'
    serie_default: string;               // Serie del comprobante, ej: 'A'
    uso_cfdi_default: string;            // Uso CFDI por defecto, ej: 'G03'
    clave_sat_default_producto: string;  // Clave SAT de producto por defecto, ej: '50161509'
    codigo_postal_emisor: string;        // CP del domicilio fiscal del emisor -> LugarExpedicion en el XML, ej: '64000'
  };

  // Parametros del ciclo de sincronizacion (requerido para type='contpaqi')
  scheduled_task?: {
    expected_sync_interval_minutes: number;  // Intervalo configurado en el agent (informativo)
    stale_warning_minutes: number;           // Minutos de staleness antes de advertencia
    stale_escalation_hours: number;          // Horas de staleness que marcan adaptador no saludable
  };
}
```

### Ejemplo completo para CONTPAQi

```json
{
  "type": "contpaqi",
  "dropbox_token": "sl.AbCdEfGh...",
  "dropbox_base_path": "/acme-tortilleria/contpaqi",
  "fiscal": {
    "rfc_emisor": "ACM860101ABC",
    "regimen_fiscal": "601",
    "serie_default": "A",
    "uso_cfdi_default": "G03",
    "clave_sat_default_producto": "50161509",
    "codigo_postal_emisor": "64000"
  },
  "scheduled_task": {
    "expected_sync_interval_minutes": 15,
    "stale_warning_minutes": 30,
    "stale_escalation_hours": 6
  }
}
```

`fiscal.codigo_postal_emisor` es el codigo postal del domicilio fiscal del emisor. Se usa como `<LugarExpedicion>` en cada XML generado. CONTPAQi rechaza el documento si este campo llega vacio. `buildAdapter` lanza un error explicativo si falta.

### Ejemplo para mock (desarrollo y tests)

```json
{
  "type": "mock"
}
```

### Validacion en `buildAdapter`

`buildAdapter(config)` en `adapters/index.ts` lanza `Error` si `type='contpaqi'` y falta cualquiera de `dropbox_token`, `dropbox_base_path`, `fiscal` o `scheduled_task`. Para `type='mock'` no requiere campos adicionales.

---

## 4. Rutas de archivos en Dropbox

El agente Windows escribe en `<basePath>/Config/` y el empleado digital escribe en subcarpetas distintas. No hay colision de rutas.

| Ruta | Quien escribe | Quien lee |
|---|---|---|
| `<basePath>/Config/contpaqi_clientes.csv` | Windows agent | CONTPAQiAdapter (Centinelia) |
| `<basePath>/Config/contpaqi_productos.csv` | Windows agent | CONTPAQiAdapter (Centinelia) |
| `<basePath>/Config/last_sync.json` | Windows agent | CONTPAQiAdapter (Centinelia) |
| `<basePath>/Importables_CONTPAQi/pendientes/facturas_YYYY-MM-DD_<8hex>.xml` | CONTPAQiAdapter | Contador (importacion manual en CONTPAQi) |

Los XMLs en `pendientes/` son rotados a `procesados/` por el cron `billing-retention` (`/api/cron/billing-retention`) en su ciclo mensual.

---

## 5. Cache en memoria

`CONTPAQiAdapter` mantiene tres caches independientes:

| Cache | TTL default | Invalidacion |
|---|---|---|
| Clientes | 10 minutos (configurable via `cacheTtlMs`) | Por expiracion de TTL |
| Productos | 10 minutos (configurable via `cacheTtlMs`) | Por expiracion de TTL |
| Frescura (`last_sync.json`) | 60 segundos (fijo) | Por expiracion de TTL |

El cache de frescura tiene TTL corto porque el loop LLM consulta `freshness()` al inicio de cada procesamiento y necesita datos razonablemente frescos para decidir si escalar.

En tests, pasar `cacheTtlMs: 0` al constructor fuerza revalidacion inmediata en cada llamada, lo que hace los tests deterministas.

---

## 6. Generador XML ADD

`buildImportXml(invoices, config)` en `contpaqi/xml-import.ts` produce el formato de Documentos que acepta la utilidad de importacion de CONTPAQi Comercial.

Estructura del XML generado:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Documentos xmlns="http://www.contpaqi.com/comercial/import/v1">
  <Documento>
    <Encabezado>
      <Concepto>FACT</Concepto>
      <Serie>A</Serie>
      <Fecha>2026-08-18</Fecha>
      <RfcEmisor>ACM860101ABC</RfcEmisor>
      <RfcReceptor>XAXX010101000</RfcReceptor>
      <UsoCFDI>G03</UsoCFDI>
      <MetodoPago>PUE</MetodoPago>
      <FormaPago>03</FormaPago>
      <Moneda>MXN</Moneda>
      <LugarExpedicion>64000</LugarExpedicion>
      <Subtotal>4500.00</Subtotal>
      <Total>4500.00</Total>
    </Encabezado>
    <Movimientos>
      <Movimiento>
        <CodigoProducto>SERV001</CodigoProducto>
        <Cantidad>1</Cantidad>
        <PrecioUnitario>4500.00</PrecioUnitario>
        <Importe>4500.00</Importe>
        <IvaTasa>0.0</IvaTasa>
      </Movimiento>
    </Movimientos>
  </Documento>
</Documentos>
```

Constantes centralizadas en `contpaqi/xml-import-templates.ts`:

| Constante | Valor | Notas |
|---|---|---|
| `XML_NAMESPACE` | `http://www.contpaqi.com/comercial/import/v1` | Namespace del esquema ADD v1. |
| `CONCEPTO_FACTURA` | `FACT` | Tipo de documento en CONTPAQi. |
| `METODO_PAGO_PUE` | `PUE` | Pago en una sola exhibicion. |
| `FORMA_PAGO_MAP` | `{ efectivo:'01', cheque:'02', transferencia:'03', tarjeta:'04' }` | Claves SAT c_FormaPago. |
| `FORMA_PAGO_DEFAULT` | `99` | Usado cuando `paymentMethod` no tiene correspondencia. |

Notas de implementacion:

- El campo `IvaTasa` siempre es `0.0` en el generador actual. Para habilitar IVA por linea, agregar un campo `ivaTasa` a `BillingLineItem` y pasarlo a `buildMovimiento`.
- `submitInvoiceBatch` retorna `mode: 'file'` y `ref` igual a la ruta Dropbox del XML. El empleado digital reporta esto al contador via correo de confirmacion.
- `supportsAutoStamping()` retorna `false`. CONTPAQi no timbra directamente en Fase 1; la contadora hace el timbrado batch desde la interfaz de CONTPAQi.

---

## 7. Deuda Fase 0 (pendiente para produccion)

Los siguientes puntos requieren verificacion con la contadora y el cliente antes del go-live productivo. Son supuestos documentados del Plan B que pueden requerir ajustes de 1-2 dias.

### 7.1 Motor de BD real del cliente

El agente Windows soporta dos drivers:

| Driver | Cuando aplica | Connection string de referencia |
|---|---|---|
| `firebird` | CONTPAQi Comercial versiones que usan Firebird embedded | `User=SYSDBA;Password=masterkey;Database=C:\CONTPAQi\Empresas\Ejemplo\empresa.fdb;ServerType=1` |
| `sqlserver` | CONTPAQi versiones recientes migradas a SQL Server | `Server=(localdb)\MSSQLLocalDB;Database=CONTPAQI_EMPRESA;Integrated Security=true` |

**Pendiente Fase 0:** confirmar con el cliente piloto (tortilleria) cual usa CONTPAQi Comercial Pro instalado. Si usa Firebird, verificar la ruta exacta del `.fdb`. Si usa SQL Server, verificar instancia y nombre de la base de datos.

### 7.2 Round-trip XML con CONTPAQi real

El XML generado por `buildImportXml` usa el namespace `http://www.contpaqi.com/comercial/import/v1` y la estructura de `<Documentos>/<Documento>/<Encabezado>/<Movimientos>` basada en documentacion publica del ADD de CONTPAQi.

**Pendiente Fase 0:** ejecutar un round-trip real con la contadora:
1. Generar un XML con 1-2 facturas de prueba.
2. Importarlo en el CONTPAQi del cliente.
3. Verificar que los campos se mapeen correctamente (concepto, serie, forma de pago, uso CFDI, codigo de producto).
4. Si hay discrepancias, actualizar `xml-import-templates.ts` (cambios de 1-2 lineas).

### 7.3 Nombres reales de las tablas CONTPAQi

Las queries del agente usan los nombres de tablas y columnas documentados publicamente para CONTPAQi Comercial Pro:

| Tabla usada | Descripcion |
|---|---|
| `admClientes` | Catalogo de clientes |
| `admProductos` | Catalogo de productos/servicios |

Columnas de `admClientes` consultadas: `cRFC`, `cCodigoCliente`, `cRazonSocial`, `cUsoCFDI`, `cRegimenFiscal`, `cCodigoPostal`, `cEmail`, `cTelefono1`.

Columnas de `admProductos` consultadas: `cCodigoProducto`, `cNombreProducto`, `cUnidadNoConvertible`, `cPrecio1`, `cClaveSAT`, `cValorTasaImpuesto1`.

**Pendiente Fase 0:** ejecutar las queries contra la BD real del cliente piloto y verificar que las tablas y columnas existan con estos nombres exactos. Si la version de CONTPAQi usa nombres diferentes, actualizar `FirebirdCatalogRepository.cs` o `SqlServerCatalogRepository.cs` (5-10 lineas de SELECT).

---

## 8. Archivos del modulo

### Windows agent (C#, .NET 8)

| Archivo | Descripcion |
|---|---|
| `windows-agent/billing-contpaqi-reader/src/BillingContpaqiReader.csproj` | Proyecto .NET 8 console app. Dependencias: `FirebirdSql.Data.FirebirdClient`, `Microsoft.Data.SqlClient`, `Dropbox.Api`. |
| `windows-agent/billing-contpaqi-reader/src/Program.cs` | Entry point: carga config, crea dependencias, corre `PeriodicRunner.RunForeverAsync`. |
| `windows-agent/billing-contpaqi-reader/src/Config/AppConfig.cs` | Parseo y validacion de `appsettings.json`. |
| `windows-agent/billing-contpaqi-reader/src/Config/appsettings.example.json` | Template de configuracion para el instalador. |
| `windows-agent/billing-contpaqi-reader/src/Db/ICatalogRepository.cs` | Interfaz `GetClientsAsync()` / `GetProductsAsync()`. |
| `windows-agent/billing-contpaqi-reader/src/Db/FirebirdCatalogRepository.cs` | Implementacion Firebird. Queries contra `admClientes` y `admProductos`. |
| `windows-agent/billing-contpaqi-reader/src/Db/SqlServerCatalogRepository.cs` | Implementacion SQL Server. Mismas queries en T-SQL. |
| `windows-agent/billing-contpaqi-reader/src/Db/DbFactory.cs` | Selector de implementacion segun `config.DbProvider`. |
| `windows-agent/billing-contpaqi-reader/src/Db/Models/ContpaqiClient.cs` | Record con los campos del cliente leidos de CONTPAQi. |
| `windows-agent/billing-contpaqi-reader/src/Db/Models/ContpaqiProduct.cs` | Record con los campos del producto leidos de CONTPAQi. |
| `windows-agent/billing-contpaqi-reader/src/Export/CsvWriter.cs` | Serializacion a CSV UTF-8 BOM RFC 4180. |
| `windows-agent/billing-contpaqi-reader/src/Export/FreshnessWriter.cs` | Escritura de `last_sync.json`. |
| `windows-agent/billing-contpaqi-reader/src/Storage/DropboxUploader.cs` | Wrapper del Dropbox SDK con handler inyectable para tests. |
| `windows-agent/billing-contpaqi-reader/src/Scheduling/PeriodicRunner.cs` | Orquesta un ciclo de sync y lo repite cada `SyncIntervalMinutes` minutos. |
| `windows-agent/billing-contpaqi-reader/src/Logging/FileLogger.cs` | Logger append-only thread-safe. Formato: `TIMESTAMP [LEVEL] mensaje`. |

### Centinelia (TypeScript)

| Archivo | Descripcion |
|---|---|
| `src/lib/billing/adapters/contpaqi.ts` | `CONTPAQiAdapter`: implementa `BillingAdapter`. Cache, fuzzy matching, `submitInvoiceBatch`. |
| `src/lib/billing/adapters/index.ts` | `buildAdapter(config)`: factory que retorna `CONTPAQiAdapter` o `MockBillingAdapter`. |
| `src/lib/billing/contpaqi/csv-parser.ts` | `parseClientsCsv`, `parseProductsCsv`, `parseFreshnessJson`. Parser RFC 4180 inline. |
| `src/lib/billing/contpaqi/xml-import.ts` | `buildImportXml(invoices, config)`: genera el XML ADD. |
| `src/lib/billing/contpaqi/xml-import-templates.ts` | Constantes del esquema XML (namespace, concepto, formas de pago SAT). |
