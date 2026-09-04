; BillingWriter.iss — Inno Setup script para el Windows Service del writer.
;
; Compilar con:
;   ISCC.exe BillingWriter.iss
;
; Prerequisitos ANTES de correr el instalador (setup humano en la máquina del cliente):
;   1. CONTPAQi Comercial Premium/Pro instalado (MGWServicios.dll en Program Files).
;   2. SQL Server accesible (usualmente localhost\SQLEXPRESS).
;   3. Registro CONTPAQ I SDK\NOMBRESERVIDOR apuntando al SQL server (ver README).
;   4. Empresa creada en CONTPAQi UI con CSD cargado.
;
; El instalador:
;   - Copia el EXE + dependencias a Program Files (x86)\Centinelia\BillingWriter\
;   - Copia appsettings.json template a ProgramData\Centinelia\BillingWriter\
;     (editable por admin post-install; NO se sobrescribe en upgrades).
;   - Registra el Windows Service con arranque automático.
;   - Al desinstalar, para y remueve el service.

#define AppName        "Centinelia Billing Writer"
#define AppVersion     "0.10.2"
#define AppPublisher   "Centinelia"
#define ServiceName    "Centinelia.BillingWriter"
#define ExeName        "BillingContpaqiWriter.exe"

[Setup]
AppId={{5F7A6C82-4C7B-4B0A-9F5C-9A2D3E8B1F42}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Centinelia\BillingWriter
DefaultGroupName=Centinelia
DisableProgramGroupPage=yes
OutputBaseFilename=BillingWriter-Setup-{#AppVersion}
Compression=lzma
SolidCompression=yes
; MSI-style single-user machine install; requires admin (Windows Service).
PrivilegesRequired=admin
; SDK CONTPAQi es x86, empaquetamos x86 puro.
ArchitecturesAllowed=x86 x64compatible
ArchitecturesInstallIn64BitMode=

[Files]
; Todo lo que produce `dotnet publish -r win-x86 -o dist` va al install dir.
; Excepto appsettings.json que va aparte a ProgramData (editable por admin).
Source: "..\dist\*"; DestDir: "{app}"; Excludes: "appsettings.json"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist\appsettings.json"; DestDir: "{commonappdata}\Centinelia\BillingWriter"; \
    Flags: onlyifdoesntexist uninsneveruninstall
; Batch auxiliar para registrar el service (evita ambigüedad de quoting anidado).
Source: "register-service.cmd"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\Centinelia\BillingWriter\logs"; Permissions: users-modify
Name: "{commonappdata}\Centinelia\BillingWriter"; Permissions: users-modify

[Run]
; Registra el service via batch auxiliar. El batch maneja stop + delete +
; create + description + recovery + verify en un solo lugar; evita la
; ambigüedad de quoting anidado que Inno tiene con `sc create binPath=...`.
Filename: "{app}\register-service.cmd"; \
    Parameters: """{app}\{#ExeName}"" ""{#AppName}"""; \
    Flags: runhidden waituntilterminated; \
    StatusMsg: "Registrando Windows Service..."

; Endurecer ACL de appsettings.json: contiene CSD password, SQL password y
; Dropbox token en plaintext. Solo SYSTEM (donde corre el service) y
; Administrators pueden leerlo. Se elimina la herencia primero para que
; Users no herede acceso de ProgramData.
Filename: "icacls.exe"; \
    Parameters: """{commonappdata}\Centinelia\BillingWriter\appsettings.json"" /inheritance:r /grant:r ""SYSTEM:(F)"" ""Administrators:(F)"""; \
    Flags: runhidden; StatusMsg: "Endureciendo permisos de appsettings.json..."

; Solo arrancar automáticamente si el admin marca la casilla (default off para
; que primero edite appsettings.json).
Filename: "sc.exe"; Parameters: "start {#ServiceName}"; Flags: runhidden; \
    StatusMsg: "Iniciando servicio..."; Tasks: startservice

[Tasks]
Name: "startservice"; Description: "Arrancar el servicio ahora (recomendado si ya configuraste appsettings.json)"; Flags: unchecked

[UninstallRun]
Filename: "sc.exe"; Parameters: "stop {#ServiceName}"; Flags: runhidden; RunOnceId: "StopService"
Filename: "sc.exe"; Parameters: "delete {#ServiceName}"; Flags: runhidden; RunOnceId: "DeleteService"

[Code]
// Recuerda al admin editar appsettings.json en ProgramData antes de arrancar.
procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: string;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{commonappdata}\Centinelia\BillingWriter\appsettings.json');
    MsgBox(
      'Instalación completa.' + #13#10 + #13#10 +
      'Antes de arrancar el servicio, edita:' + #13#10 +
      ConfigPath + #13#10 + #13#10 +
      'Debes rellenar: EmpresaPath, Concepto, CsdPassword, SqlConnectionString y la sección Storage.',
      mbInformation, MB_OK);
  end;
end;
