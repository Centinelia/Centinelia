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

## Estado actual

**Day 1 (scaffold + hello world)**: valida que el proyecto compila 32-bit, que
las bindings P/Invoke cargan el SDK nativo, y que se puede abrir/cerrar una
sesión + empresa.

Pendientes (Day 2-10):
- Day 2: crear documento vacío con encabezado.
- Day 3: agregar movimientos + afectar.
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
