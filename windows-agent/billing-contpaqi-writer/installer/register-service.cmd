@echo off
REM ============================================================================
REM register-service.cmd
REM
REM Registra el Windows Service Centinelia.BillingWriter con el binPath correcto.
REM Se invoca desde el instalador Inno Setup con dos argumentos:
REM   %1 = ruta absoluta al EXE (ej. "C:\Program Files (x86)\Centinelia\BillingWriter\BillingContpaqiWriter.exe")
REM   %2 = DisplayName para el servicio (ej. "Centinelia Billing Writer")
REM
REM Usar batch en vez de embebido en Inno Setup elimina ambigüedades de quoting
REM (auditoría 2026-09-04 detectó que `sc create binPath="..."` con quoting
REM anidado escapado por Inno es propenso a error silencioso).
REM ============================================================================

setlocal
set SERVICE_NAME=Centinelia.BillingWriter
set EXE_PATH=%~1
set DISPLAY_NAME=%~2

if "%EXE_PATH%"=="" (
  echo ERROR: falta ruta al EXE como primer argumento
  exit /b 1
)

echo Deteniendo servicio previo si existe...
sc stop "%SERVICE_NAME%" >nul 2>&1
sc delete "%SERVICE_NAME%" >nul 2>&1

echo Registrando servicio %SERVICE_NAME%...
REM `binPath=` requiere espacio después del `=`. El valor tiene comillas
REM internas escapadas con \" para que sc.exe preserve las comillas del path
REM dentro del valor completo.
sc create "%SERVICE_NAME%" binPath= "\"%EXE_PATH%\" --mode service" start= auto DisplayName= "%DISPLAY_NAME%"
if errorlevel 1 (
  echo ERROR: sc create falló con exit code %errorlevel%
  exit /b %errorlevel%
)

echo Configurando descripción...
sc description "%SERVICE_NAME%" "Procesa XMLs de importación depositados por Nala y timbra CFDIs contra CONTPAQi Comercial vía el SDK nativo."

echo Configurando recovery (3 retries con backoff, luego log fatal)...
REM reset=3600 → si el servicio corre 1h estable, contador se resetea.
REM 3 retries con backoff creciente; después "run" ejecuta un comando que
REM escribe al EventLog para que un monitor externo detecte el fatal.
sc failure "%SERVICE_NAME%" reset= 3600 actions= restart/10000/restart/30000/restart/60000/run/60000
sc failureflag "%SERVICE_NAME%" 1
REM Comando a ejecutar tras el 4to fallo: escribe evento crítico al EventLog.
sc failure "%SERVICE_NAME%" command= "eventcreate /L Application /T ERROR /SO Centinelia.BillingWriter /ID 9999 /D \"Centinelia BillingWriter falló 3 veces consecutivas. Requiere intervención manual.\""

echo Verificando registro exitoso...
sc qc "%SERVICE_NAME%" >nul
if errorlevel 1 (
  echo ERROR: sc qc falló, el servicio no quedó registrado correctamente
  exit /b 1
)

echo Servicio %SERVICE_NAME% registrado OK.
exit /b 0
