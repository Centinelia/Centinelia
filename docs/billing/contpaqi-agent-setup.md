# CONTPAQi Windows Agent: Compilacion y Desarrollo

Guia para compilar, configurar y correr el agente `BillingContpaqiReader.exe` en un entorno de desarrollo.
Esta guia cubre el modo desarrollo. Para produccion, ver la nota al final sobre Plan D (instalador MSI + Windows Scheduled Task).

---

## 1. Requisitos

| Requisito | Version minima | Notas |
|---|---|---|
| Windows | 10 o 11 (64-bit) | El agente usa la API de Dropbox por HTTPS; no requiere firewall adicional mas alla de salida a `api.dropboxapi.com`. |
| .NET 8 SDK | 8.0.x | Instalar desde [dot.net/download](https://dotnet.microsoft.com/download). Verificar con `dotnet --version`. |
| CONTPAQi Comercial Pro | Cualquier version que use Firebird o SQL Server | Requerido para produccion. En desarrollo se usan fixtures de base de datos en memoria. |
| Dropbox token | Token de acceso a la cuenta Dropbox del cliente | Tipo "App token" con permiso `files.content.write`. Generarlo en [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps). |

---

## 2. Clonar y ubicar el proyecto

El agente vive en el monorepo de Centinelia, bajo el directorio `windows-agent/`:

```
windows-agent/billing-contpaqi-reader/
    src/    <- Codigo fuente del agente
    tests/  <- Suite xUnit con Firebird embedded
```

Asegurarse de estar en la rama `feat/empleado-facturacion-plan-b-contpaqi` del worktree.

---

## 3. Compilar

### Modo debug (desarrollo rapido)

```powershell
cd windows-agent\billing-contpaqi-reader\src
dotnet build
```

El binario queda en `bin\Debug\net8.0\BillingContpaqiReader.exe`.

### Modo release self-contained (distribuible)

```powershell
cd windows-agent\billing-contpaqi-reader\src
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

El binario final queda en:

```
bin\Release\net8.0\win-x64\publish\BillingContpaqiReader.exe
```

Este EXE incluye el runtime de .NET 8 y no requiere que la maquina del cliente tenga .NET instalado. Es el artefacto que se entrega al cliente en Fase 1.

---

## 4. Configuracion (`appsettings.json`)

Copiar el template e incorporar los valores reales:

```powershell
copy windows-agent\billing-contpaqi-reader\src\Config\appsettings.example.json appsettings.json
```

Editar `appsettings.json`:

```json
{
  "DbProvider": "firebird",
  "DbConnectionString": "User=SYSDBA;Password=masterkey;Database=C:\\CONTPAQi\\Empresas\\NombreEmpresa\\empresa.fdb;ServerType=1",
  "DropboxAccessToken": "sl.AbCdEfGhIjKlMnOpQrStUvWx",
  "DropboxBasePath": "/Centinelia/CONTPAQi",
  "AgentVersion": "0.1.0",
  "SyncIntervalMinutes": 15
}
```

### Descripcion de cada campo

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| `DbProvider` | `"firebird"` o `"sqlserver"` | Si | Motor de base de datos de CONTPAQi en la maquina del cliente. |
| `DbConnectionString` | STRING | Si | Cadena de conexion completa al motor seleccionado. |
| `DropboxAccessToken` | STRING | Si | Token de acceso Dropbox. Nunca commitear este valor. |
| `DropboxBasePath` | STRING | Si | Ruta raiz en Dropbox. Debe coincidir con `dropbox_base_path` en `organization_integrations.config` del lado de Centinelia. |
| `AgentVersion` | STRING | No | Version del agente. Se incluye en `last_sync.json` para diagnostico. Default: `"0.1.0"`. |
| `SyncIntervalMinutes` | INT | No | Minutos entre ciclos de sincronizacion. Default: `15`. |

### Connection strings de referencia

**Firebird embedded (CONTPAQi Comercial Pro tipico):**

```
User=SYSDBA;Password=masterkey;Database=C:\CONTPAQi\Empresas\NombreEmpresa\empresa.fdb;ServerType=1
```

`ServerType=1` indica Firebird embedded (sin servidor separado). La ruta al `.fdb` depende de la version de CONTPAQi y el nombre de la empresa; la contadora puede ubicarla desde CONTPAQi en `Administracion > Empresa > Propiedades`.

**SQL Server (versiones recientes de CONTPAQi que migraron a SQL Server):**

```
Server=(localdb)\MSSQLLocalDB;Database=CONTPAQI_EMPRESA;Integrated Security=true
```

---

## 5. Correr en desarrollo

```powershell
cd windows-agent\billing-contpaqi-reader\src
.\BillingContpaqiReader.exe appsettings.json
```

Si no se pasa el path del archivo de configuracion, el agente busca `appsettings.json` en el directorio de trabajo actual.

Salida esperada al arrancar:

```
Billing CONTPAQi Reader v0.1.0 started. Provider: firebird
Log: C:\ruta\actual\agent.log
Press Ctrl+C to stop.
```

El agente escribe un log en `agent.log` junto al archivo de configuracion. Cada linea tiene el formato:

```
2026-08-18T21:15:00.000Z [INFO] Sync cycle started
2026-08-18T21:15:03.421Z [INFO] Uploaded clients CSV (342 records) -> /Centinelia/CONTPAQi/Config/contpaqi_clientes.csv
2026-08-18T21:15:04.103Z [INFO] Uploaded products CSV (87 records) -> /Centinelia/CONTPAQi/Config/contpaqi_productos.csv
2026-08-18T21:15:04.201Z [INFO] Uploaded freshness JSON (status=ok, duration=3789ms) -> /Centinelia/CONTPAQi/Config/last_sync.json
2026-08-18T21:15:04.201Z [INFO] Sync cycle complete. status=ok clients=342 products=87 duration=3789ms
```

Para detener: `Ctrl+C`. El agente termina limpiamente despues de completar el ciclo en curso.

---

## 6. Correr los tests

### Tests unitarios (sin CONTPAQi real)

```powershell
cd windows-agent\billing-contpaqi-reader\tests
dotnet test
```

La suite cubre:

- `AppConfigTests.cs` -- Parseo y validacion de `appsettings.json`.
- `CsvWriterTests.cs` -- Serializacion CSV UTF-8 BOM RFC 4180.
- `FirebirdCatalogRepositoryTests.cs` -- Queries contra Firebird embedded en tempdir.
- `SqlServerCatalogRepositoryTests.cs` -- Queries contra SQL Server LocalDB (se omite si LocalDB no esta disponible).
- `DropboxUploaderTests.cs` -- Upload con handler mockeado.
- `PeriodicRunnerTests.cs` -- Orquestacion del ciclo de sync con repo y uploader mockeados.
- `Integration/FullExportFlowTests.cs` -- Flujo completo: fixture BD a CSV a upload mockeado.

### Firebird embedded en tests

Los tests de `FirebirdCatalogRepositoryTests` usan Firebird embedded para crear una BD temporal real en `%TEMP%` durante cada test. No requieren CONTPAQi instalado.

**Para correr los tests de Firebird localmente, primero ejecutar:**

```powershell
powershell -ExecutionPolicy Bypass -File tests\setup-fb-native.ps1
```

El script descarga Firebird 3.0 embedded de la pagina oficial de GitHub y lo descomprime en `tests/fb-native/`. Es idempotente: si `fbembed.dll` ya existe, no hace nada. Los binarios estan gitignoreados por tamano (~10 MB).

Los binarios nativos de Firebird necesarios estan en `tests/fb-native/` y se copian automaticamente al directorio de salida del test por el `.csproj`:

```xml
<None Include="fb-native\*.dll;fb-native\*.dat;fb-native\*.conf;fb-native\*.msg"
      CopyToOutputDirectory="PreserveNewest"
      Link="%(Filename)%(Extension)" />
<None Include="fb-native\plugins\**\*"
      CopyToOutputDirectory="PreserveNewest"
      Link="plugins\%(RecursiveDir)%(Filename)%(Extension)" />
<None Include="fb-native\intl\**\*"
      CopyToOutputDirectory="PreserveNewest"
      Link="intl\%(RecursiveDir)%(Filename)%(Extension)" />
```

Archivos incluidos: `fbembed.dll`, `fbclient.dll`, `firebird.conf`, `databases.conf`, `firebird.msg`, `ib_util.dll`, DLLs de ICU (`icudt63.dll`, `icuin63.dll`, `icuuc63.dll`), DLLs de MSVC (`msvcp140.dll`, `vcruntime140.dll`), subdirectorios `plugins/` e `intl/`.

La clave es que `fbembed.dll` (el motor Firebird embebido) debe estar en el mismo directorio que el DLL de tests para que `FirebirdSql.Data.FirebirdClient` lo encuentre en tiempo de ejecucion. El `.csproj` lo garantiza via `Link="%(Filename)%(Extension)"` (sin subdirectorio destino).

Si se agregan nuevos tests de Firebird en otra suite, replicar este patron de copia en el `.csproj` correspondiente.

### SQL Server LocalDB en tests

`SqlServerCatalogRepositoryTests` se omite automaticamente si SQL Server LocalDB no esta disponible en la maquina. El patron de guard es:

```csharp
private static bool LocalDbAvailable()
{
    try { using var conn = new SqlConnection("Server=(localdb)\\MSSQLLocalDB;..."); conn.Open(); return true; }
    catch { return false; }
}
```

Si LocalDB no esta disponible, el test llama a `Skip.If(!LocalDbAvailable(), "LocalDB not available")`. Esto es aceptable porque la implementacion SQL Server se ejercita implicitamente por el `DbFactory` test.

---

## 7. Estructura de directorios del agente compilado

Despues de `dotnet publish`, el directorio de salida contiene solo `BillingContpaqiReader.exe` (cuando `PublishSingleFile=true`). El agente crea los siguientes archivos en la misma carpeta donde esta el `appsettings.json`:

```
<directorio de trabajo>/
    appsettings.json       <- Configuracion (editada por el cliente)
    agent.log              <- Log append-only (creado automaticamente)
```

---

## 8. Nota sobre Plan D: produccion con MSI + Windows Scheduled Task

Esta guia cubre el modo desarrollo. Para el despliegue productivo en la maquina del cliente (Fase 4), el Plan D contempla:

1. **Instalador MSI**: empaquetar `BillingContpaqiReader.exe` + `appsettings.json` en un instalador con interfaz grafica que solicite al usuario el token de Dropbox y la ruta al `.fdb`. Herramientas candidatas: WiX Toolset v4 o NSIS.

2. **Windows Scheduled Task**: registrar una tarea programada en el Programador de Tareas de Windows que ejecute el agente al inicio de sesion y lo reinicie si falla. Alternativa: ejecutarlo como Windows Service con `sc.exe` o la libreria `Microsoft.Extensions.Hosting.WindowsServices`.

3. **Actualizaciones**: el campo `AgentVersion` en `appsettings.json` y en `last_sync.json` permite detectar desde Centinelia cuando el cliente tiene una version desactualizada del agente.

Estos tres puntos estan fuera del alcance del Plan B y quedaron documentados como Fase 4 en `docs/billing/README.md`.
