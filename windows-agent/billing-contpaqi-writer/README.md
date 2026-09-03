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

## Estado actual — Days 1-4 completos y timbrando end-to-end

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

Pendientes (Day 5-10):
- Day 5: extraer XML timbrado (queda en BD, no en disco — usar
  `fBuscarXMLdeDocumento` o similar) + envío por correo al receptor.
- Day 6: watcher Dropbox `pendientes/` → SDK → mover a `timbrados/` o
  `errores/`.
- Day 7: retries, structured logging, error escalation a Nala.
- Day 8: tests contra CONTPAQi real (empresa piloto Tortillería).
- Day 9-10: MSI installer + Windows Service + tarea programada.

Legacy: (originalmente el plan describía Day 2 crear header, Day 3 líneas
y afectar. En realidad afectar sucede automático al agregar la primera
línea, así que Day 2 y Day 3 colapsaron en uno).
- Day 4: timbrar (llama al PAC de CONTPAQi).
- Day 5: envío CFDI al receptor + descarga XML/PDF.
- Day 6: watcher Dropbox `pendientes/` → SDK → mover a `timbrados/` o `errores/`.
- Day 7: error handling, retries, logging estructurado.
- Day 8: tests contra CONTPAQi real (empresa piloto).
- Day 9-10: packaging MSI + Windows Service + tarea programada.

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
