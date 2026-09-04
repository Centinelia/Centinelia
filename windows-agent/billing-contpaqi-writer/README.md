# billing-contpaqi-writer

Windows agent que consume XMLs de importación depositados en Dropbox por Nala
(en Vercel) y los inyecta a CONTPAQi Comercial vía el SDK nativo.

Este agente es la **Fase 2** del pilot facturación. Complementa a
`billing-contpaqi-reader/` (Fase 1, ya productivo) que exporta los catálogos
de CONTPAQi hacia Dropbox para que Nala tenga referencia de los códigos.

## Ciclo end-to-end objetivo

```
[Cliente manda foto por correo] → Nala en Vercel procesa → XML a Dropbox
                                              ↓
                             billing-contpaqi-writer (este proyecto)
                                              ↓
                    CONTPAQi crea + afecta + timbra con su PAC
                                              ↓
                              CFDI timbrado al receptor por correo
```

## Estado actual — Days 1-7 completos: watcher + storage abstracta + retries + logging

Validado contra empresa dedicada `Kemper Urgate PRUEBAS SDK` (RFC de pruebas
SAT `EKU9003173C9`, CSD público SAT descargado de facturoporti, password
`12345678a`). El ciclo completo funciona:

- Session + PAQ + open empresa ✅
- Buscar cliente y producto por código ✅
- Crear documento (`fAltaDocumento`) ✅
- Agregar movimiento (`fAltaMovimiento`) ✅
- Afectar (auto — colapsa con Day 3) ✅
- **Timbrar (`fEmitirDocumento`) ✅** → devuelve éxito, UUID poblado en BD
  con prefijo `00000000-` (marca sandbox de CONTPAQi trial). El PAC del
  trial es un mock interno que no llama al SAT real — perfecto para dev.
- **Extraer XML timbrado (`fEntregEnDiscoXML`) ✅** → escribe el CFDI 4.0
  completo (con nodo `TimbreFiscalDigital` y sello del PAC) a
  `{empresa}\XML_SDK\{serie}{folio}.xml`. El writer lo lee y lo devuelve
  al caller por stdout o a la ruta `--out`.
- **UUID directo (`fDocumentoUUID`) ✅** → recupera solo el UUID sin
  materializar el XML completo (útil para verificar rápido).
- **Watcher local (`--mode watch --storage local`) ✅** → bucle de polling que lee XMLs
  de importación multi-factura depositados por Nala en `--inbox`,
  procesa cada uno contra CONTPAQi, escribe los CFDIs timbrados a
  `--outbox/timbrados/` y mueve el original a `procesados/` o `errores/`.
- **Watcher Dropbox (`--mode watch --storage dropbox`) ✅** → mismo loop pero contra
  Dropbox API v2 vía la App autorizada del cliente (`--dropbox-token` + `--dropbox-root`).
  Inbox = `{root}/pendientes`, outbox = `{root}/{timbrados|procesados|errores}`.
- **Retries en timbrado ✅** → `fEmitirDocumento` reintenta hasta 3 veces con
  backoff exponencial (2s, 4s, 8s) para tolerar fallas transient del PAC.
  Errores permanentes (RFC ghost, XML mal formado) fallan al primer intento.
- **Structured logging ✅** → `Microsoft.Extensions.Logging` con timestamps UTC,
  level, source y line-oriented. Facilita grep/tail y futura ingesta a Loki/Datadog.

## Setup requerido en la máquina donde corre este agente

Además de tener CONTPAQi Comercial Premium/Pro instalado con la empresa
del cliente, hay 2 cambios de registro que tuvimos que hacer:

1. `HKLM:\SOFTWARE\WOW6432Node\Computación en Acción, SA CV\CONTPAQ I SDK\NOMBRESERVIDOR`
   debe apuntar al SQL Server que sirve la BD de CONTPAQi. En la instalación
   del piloto era `tcp:LAPTOP-RDIHSMS9,1433` (el valor original `localhost`
   no resolvía porque la instancia real es `SQLEXPRESS`).
2. La empresa debe crearse en CONTPAQi UI con CSD cargado desde el
   momento de la creación (el diálogo Nueva Empresa tiene la sección
   "Datos generales del certificado" — no se puede saltar).

## Ambiente de pruebas sin timbrar de verdad

Para desarrollar sin riesgo fiscal:
- Descargar CSD público SAT de pruebas (RFC `EKU9003173C9` persona moral)
  desde https://software.facturoporti.com.mx/TaaS/Json/Api/Csd-Prueba.zip
- Password del `.key`: `12345678a`
- Crear empresa CONTPAQi con ese RFC y cargar el CSD
- El PAC del trial CONTPAQi devuelve UUIDs sandbox (prefijo `00000000-`)
  sin llamar al SAT — desarrollo ilimitado sin costo ni riesgo

Pendientes (Day 8-10):
- Day 8: tests contra CONTPAQi real (empresa piloto Tortillería, no la de pruebas).
  Con RFCs reales y catálogo real del cliente. Validar que las conversiones de
  fecha, la lookup por RFC y el manejo de errores mensajean bien al usuario.
  Además: primera integración real con Dropbox App de Beatriz (token real).
- Day 9-10: MSI installer + Windows Service + tarea programada.
  Escalation de errores irrecoverables: Nala en Vercel monitorea `errores/` y
  ella misma responde al cliente pidiendo aclaración (no el writer via HTTP).
- Day 8: tests contra CONTPAQi real (empresa piloto Tortillería).
- Day 9-10: MSI installer + Windows Service + tarea programada.

### Uso del modo fetch-xml

```powershell
# XML a disco
BillingContpaqiWriter.exe --mode fetch-xml --concepto 440 --serie FTEN --folio 3 \
  --empresa "C:\Compac\Empresas\adKemper_Urgate_PRUEBA" \
  --out C:\timbrados\FTEN-3.xml

# XML a stdout (para pipeline). Los logs [writer] van a stderr.
BillingContpaqiWriter.exe --mode fetch-xml --concepto 440 --serie FTEN --folio 3 \
  --empresa "C:\Compac\Empresas\adKemper_Urgate_PRUEBA" | Out-File cfdi.xml

# Solo UUID (fast path para verificar timbrado)
BillingContpaqiWriter.exe --mode uuid --concepto 440 --serie FTEN --folio 3 \
  --empresa "C:\Compac\Empresas\adKemper_Urgate_PRUEBA"
```

### Uso del modo watch — backend local (dev)

```powershell
BillingContpaqiWriter.exe --mode watch `
  --empresa "C:\Compac\Empresas\adKemper_Urgate_PRUEBA" `
  --concepto 440 `
  --csd-pwd 12345678a `
  --storage local `
  --inbox  "C:\centinelia-inbox" `
  --outbox "C:\centinelia-outbox" `
  --sql "Server=localhost\SQLEXPRESS;Database=adKemper_Urgate_PRUEBA;User Id=SA;Password=xxx;TrustServerCertificate=True" `
  --poll-secs 10
```

### Uso del modo watch — backend Dropbox (prod)

```powershell
BillingContpaqiWriter.exe --mode watch `
  --empresa "C:\Compac\Empresas\adPilotoBeatriz" `
  --concepto 440 `
  --csd-pwd <pwd-real> `
  --storage dropbox `
  --dropbox-token <sl.abc...> `
  --dropbox-root '/Apps/Centinelia/piloto-estrella' `
  --sql "Server=...;Database=adPilotoBeatriz;..." `
  --poll-secs 15
```

Layout de carpetas resultante:
```
inbox/
  facturas_2026-09-03_abc123.xml   ← Nala deposita aquí (formato importación multi-factura)

outbox/
  timbrados/
    facturas_2026-09-03_abc123_FTEN12.xml   ← un CFDI 4.0 por factura del lote
    facturas_2026-09-03_abc123_FTEN13.xml
  procesados/
    facturas_2026-09-03_abc123.xml          ← original, movido cuando allOk
  errores/
    facturas_2026-09-03_def456.xml          ← original, movido cuando algo falló
    facturas_2026-09-03_def456.json         ← reporte por factura (camelCase JSON)
```

El reporte de errores tiene shape:
```json
{
  "sourceFile": "facturas_2026-09-03_def456.xml",
  "processedAt": "2026-09-03T18:10:00Z",
  "results": [
    { "index": 0, "rfc": "XAXX010101000", "ok": true, "serie": "FTEN", "folio": 6, "uuid": "00000000-...", "timbradoPath": "...", "error": null },
    { "index": 1, "rfc": "NOEXISTE999", "ok": false, "serie": "FTEN", "folio": 0, "uuid": null, "timbradoPath": null, "error": "..." }
  ],
  "allOk": false
}
```

Nota: el plan original tenía Day 2 = header, Day 3 = líneas + afectar. En la
realidad afectar sucede automático al agregar la primera línea, así que Day
2 y Day 3 colapsaron en uno. El Day 5 original ("envío CFDI + descarga
XML/PDF") se dividió en Day 5 (fetch-xml, este) y Day 6 (watcher + envío).

## Por qué .NET 8 en target **x86** y NO AnyCPU/x64

El SDK CONTPAQi (`MGW_SDK.dll`, `CONTPAQ_I_DLL.dll`, `contpaqi_rt.dll`,
`librerias.dll`) es una serie de DLLs nativas compiladas para **32-bit**.
Un proceso 64-bit las cargará y fallará al instante con `BadImageFormatException`.

Por eso el csproj declara:

```xml
<Platforms>x86</Platforms>
<PlatformTarget>x86</PlatformTarget>
```

## Cómo correr el smoke test

Requisitos:
- .NET 8 SDK instalado
- CONTPAQi Comercial Premium/Pro instalado en la misma máquina
- La empresa piloto restaurada (`C:\Compac\Empresas\adTortillasEstrella_PILOTO_D`)

```powershell
cd windows-agent\billing-contpaqi-writer\src
dotnet run --arch x86 -- `
  --sdk "C:\Program Files (x86)\Compac\COMERCIAL\SDK" `
  --empresa "C:\Compac\Empresas\adTortillasEstrella_PILOTO_D"
```

Salida esperada:
```
[writer] BillingContpaqiWriter Day 1 smoke
[writer] SDK path:  C:\Program Files (x86)\Compac\COMERCIAL\SDK
[writer] Empresa:   C:\Compac\Empresas\adTortillasEstrella_PILOTO_D
[writer] Usuario:   SUPERVISOR
[writer] SDK version: <alguna cadena>
[writer] Sesión + empresa abiertas OK
[writer] Cerrando sesión (Dispose automático al salir del using)
[writer] Smoke test completado OK
```

Si sale `BadImageFormatException`: el proceso arrancó en 64-bit. Verificar que
`<PlatformTarget>x86</PlatformTarget>` esté en el csproj y que `dotnet run`
use `--arch x86`.

Si sale `SetDllDirectory falló`: la ruta al SDK está mal. Verificar que
`MGW_SDK.dll` existe en esa carpeta.

Si sale `fInicioSesionSDK falló con código N`: leer el mensaje traducido; los
más comunes son usuario/password inválidos o SDK no licenciado.

## Licencia del SDK

Verificado 2026-09-03: **el SDK oficial de CONTPAQi Comercial Premium/Pro
está incluido sin costo adicional en la licencia anual del sistema**. No
requiere licencia developer separada para uso propio del cliente. El wrapper
open-source de AndresRamos ($300 USD/año/RFC) es opcional; este proyecto
llama al SDK nativo directamente vía P/Invoke.
