# Deploy guide — Centinelia BillingWriter

Guía para instalar el writer como Windows Service en la máquina del cliente
(la que tiene CONTPAQi Comercial Premium/Pro y la BD SQL activa).

## Prerequisitos (setup humano en la máquina del cliente)

1. **CONTPAQi Comercial Premium/Pro instalado** — el instalador asume que
   `C:\Program Files (x86)\Compac\COMERCIAL\MGWServicios.dll` existe.
2. **SQL Server accesible** — típicamente `localhost\SQLEXPRESS`. Se necesita
   un login con permisos de lectura sobre las tablas `admClientes` y
   `admDocumentos` de la BD de la empresa (usualmente `SA` sirve; en prod
   crear un login dedicado con `db_datareader`).
3. **Registro NOMBRESERVIDOR** apuntando al SQL server. Editar como admin:
   ```powershell
   $regPath = 'HKLM:\SOFTWARE\WOW6432Node\Computación en Acción, SA CV\CONTPAQ I SDK'
   Set-ItemProperty -Path $regPath -Name 'NOMBRESERVIDOR' -Value 'tcp:LAPTOP-XXXX,1433'
   ```
   (Sustituir el nombre real del host + instancia. Valor por default
   `localhost` no resuelve porque la instancia real suele ser `SQLEXPRESS`.)
4. **Empresa CONTPAQi creada** con CSD cargado desde la creación (el diálogo
   Nueva Empresa tiene la sección "Datos generales del certificado"; no se
   puede saltar y agregar después).

## Compilar el instalador

Requisitos en la máquina de build (Nazre / CI, no la del cliente):

- .NET 8 SDK con workload `windowsdesktop`
- [Inno Setup 6+](https://jrsoftware.org/isdl.php) — el compilador es
  `ISCC.exe`, típicamente en `C:\Program Files (x86)\Inno Setup 6\`.

Pasos:

```powershell
cd windows-agent\billing-contpaqi-writer

# 1) Publicar el binario self-contained x86
dotnet publish src\BillingContpaqiWriter.csproj `
    -c Release -r win-x86 --self-contained true -o dist

# 2) Compilar el instalador
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\BillingWriter.iss

# 3) Resultado
ls installer\Output\BillingWriter-Setup-*.exe
```

## Instalar en la máquina del cliente

1. Copiar `BillingWriter-Setup-<version>.exe` a la máquina del cliente.
2. Ejecutarlo como administrador (el instalador registra un Windows Service,
   requiere admin).
3. Al final del install, un mensaje recuerda editar `appsettings.json`.
4. Editar `C:\ProgramData\Centinelia\BillingWriter\appsettings.json` con
   los valores reales del cliente:
   - `EmpresaPath` — ruta absoluta de la empresa CONTPAQi
     (`C:\Compac\Empresas\adPILOTO...`).
   - `Concepto` — código interno del concepto CONTPAQi (típicamente `440`
     para "4.0 CFDI FACTURA"). Se puede confirmar consultando `admConceptos`.
   - `CsdPassword` — password del CSD cargado en CONTPAQi.
   - `SqlConnectionString` — ej.
     `Server=localhost\SQLEXPRESS;Database=<nombre_bd_empresa>;User Id=SA;Password=<pwd>;TrustServerCertificate=True`.
   - Sección `Storage`:
     - Backend `dropbox` en prod: rellenar `DropboxToken` (access token de la
       App autorizada del cliente) y `DropboxRoot` (ej.
       `/Apps/Centinelia/piloto-estrella/Importables_CONTPAQi`).
     - Backend `local` para dev/testing: rellenar `InboxPath` y `OutboxPath`.
5. Arrancar el servicio:
   ```powershell
   Start-Service Centinelia.BillingWriter
   Get-Service Centinelia.BillingWriter
   ```

## Verificación post-install

- **Logs** — `C:\ProgramData\Centinelia\BillingWriter\logs\writer-YYYYMMDD.log`
  (rotación diaria, 14 días de retención).
- **Event Viewer** — Application log, source `Centinelia.BillingWriter`
  (nivel Warning y arriba).
- **Smoke** — depositar un XML de test en el inbox configurado (backend
  local) o Dropbox `pendientes/` (backend dropbox), esperar el próximo tick
  (`PollSeconds`) y verificar:
  - Aparece CFDI en `timbrados/`.
  - Archivo original movido a `procesados/`.
  - Log muestra `[batch] ... timbrada como <serie><folio> uuid=...`.

## Config vía variables de entorno (override)

Cualquier valor de `appsettings.json` se puede sobrescribir con env vars
con prefijo `CENTINELIA_` y separador `__` para anidamiento:

```
CENTINELIA_Writer__EmpresaPath = C:\Compac\Empresas\adFoo
CENTINELIA_Writer__Storage__Backend = dropbox
CENTINELIA_Writer__Storage__DropboxToken = sl.abc123...
```

Útil para no dejar tokens en disco cuando el orquestador los inyecta desde
Azure Key Vault u otro secret manager.

## Recovery / operación

- El servicio tiene recovery automático configurado: si crashea, SCM lo
  reinicia 3 veces con delays crecientes (10s, 30s, 60s) antes de rendirse.
- Para reiniciar manualmente:
  `Restart-Service Centinelia.BillingWriter`.
- Para actualizar a nueva versión: re-ejecutar el instalador nuevo; detiene
  el service, reemplaza binarios, lo re-registra. `appsettings.json` en
  ProgramData NO se sobrescribe (`onlyifdoesntexist`).

## Desinstalar

- Panel de Control → Programas → "Centinelia Billing Writer" → Desinstalar.
- El uninstaller detiene y remueve el service, borra los binarios de
  Program Files, y **conserva** `ProgramData\Centinelia\BillingWriter\` con
  logs históricos y appsettings.json editado. Si quieres limpiar todo:
  ```powershell
  Remove-Item -Recurse -Force C:\ProgramData\Centinelia\BillingWriter
  ```
