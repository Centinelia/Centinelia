---
title: "Runbook — Sesión con Beatriz"
subtitle: "Configuración de Nala facturación en Tortillería Estrella"
date: "martes 8 de septiembre 2026, 15:00 hrs."
author: "Centinelia"
geometry: margin=2cm
fontsize: 11pt
mainfont: "Segoe UI"
colorlinks: true
linkcolor: "purple"
urlcolor: "purple"
---

# Objetivo de la sesión

Configurar a Nala (facturación) en el portal real de Tortillería Estrella y hacer un smoke controlado del pipeline completo: correo con remisión, extracción, aprobación en portal, timbrado en CONTPAQi vía el Writer y respuesta al remitente.

**Portal REAL**: `servicioalcliente@tortillasestrella.com.mx`.

**Token portal (org-level)**: `TFoAXXWEpElJ`. Es el token de la organización, no de Nala. Sirve para entrar al portal completo desde donde Beatriz ve a todos sus meerkats (Nelia + Nala).

**URL portal**: `https://www.centinelia.mx/portal/TFoAXXWEpElJ`.

**Trial vigente**: hasta 2026-10-08 (30 días). Cuota: 100 tareas + 60 minutos voice.

---

# Estado verificado (11:22 hrs, ya listo)

Los checks técnicos de pre-cita ya corrieron. Todo verde:

| Check | Resultado |
|---|---|
| Vercel deploys en producción | Ready (último hace 29 min) |
| Endpoint `/api/writer/dropbox-token` | HTTP 401 sin bearer (correcto) |
| Writer en bucket | `latest.txt = 0.10.5`, zip existe |
| Nala provisionada trial | `ai_ops_limit=100`, `minutes_included=60`, trial hasta 2026-10-08, active=true |
| Nelia intacta | `ai_ops_limit=1200`, `minutes_included=1200`, active=true |
| Cron `agent-mailboxes` | responde `ok:true` (enabled) |
| Cron `nala-writer-inbox` | procesó 1 portal en la última corrida (enabled) |

Nada más que verificar del lado técnico antes de las 15:00. Arranca directo con el Bloque A cuando llegues.

---

# Bloque A — Discovery con Beatriz (15:00 a 15:15)

Antes de configurar nada, decidir juntos:

## A.1 Correo dedicado para Nala

¿Quiere Beatriz que Nala use un correo dedicado (ej. `nala@tortillasestrella.com.mx` o `facturacion@tortillasestrella.com.mx`) o compartir `servicioalcliente@tortillasestrella.com.mx` con Nelia?

Recomendación: **correo dedicado**. Motivos:

- Las fotos de remisiones que le mandan a Nala no se mezclan con las incidencias de Nelia.
- Nala manda auto-replies con status; separado es más limpio para debug.
- Si Beatriz prefiere una sola bandeja, se puede compartir el mismo correo pero requiere reglas de filtrado.

Anotar la decisión y el password del buzón nuevo (si aplica).

## A.2 Pivot Excel vs foto

Presentar la limitación descubierta en el dry run del 2026-09-07: vision LLM en manuscritos reales tiene tasa de error demasiado alta. Aún con card perfecta en el portal, Beatriz gastaría tiempo corrigiendo cada notita.

**Propuesta alternativa**: el repartidor (o Beatriz) captura remisiones en un Excel simple con columnas:

| folio | fecha | cliente\_codigo | producto\_codigo | cantidad |

Nala parsea el Excel con parser determinístico (sin vision), matchea por CÓDIGO exacto contra el catálogo, timbra el 90 por ciento sin escalación.

Beatriz decide:

- **Hoy con foto**: validamos que el flow completo funciona aunque con errores esperados de extracción.
- **Migramos a Excel**: unas 2 horas de refactor en próxima sesión. Más confiable, menos vistoso.

## A.3 PAC y CONTPAQi

Confirmar que el PAC incluido en CONTPAQi está activo. Pedirle a Beatriz que muestre un CFDI reciente timbrado para validar que la empresa efectivamente timbra hoy.

## A.4 Máquina Windows

Confirmar:

- La PC donde vive CONTPAQi Comercial Pro va a correr también el Writer.
- Beatriz tiene admin en esa máquina o hay que llamar al de sistemas.
- Puede cerrar CONTPAQi durante los tests (el Writer necesita abrir la empresa vía SDK).

---

# Bloque B — Setup portal (15:15 a 15:45)

Se hace todo desde el portal en el navegador de Beatriz. Ella teclea, tú guías.

**Login**: `https://www.centinelia.mx/portal/TFoAXXWEpElJ`

## B.1 Seleccionar Nala

En la vista de meerkats debe aparecer Nala junto a Nelia. Click en Nala.

## B.2 Configurar correo de Nala

Configurar → Herramientas → Correo → **Otro correo**.

Llenar host, puerto, usuario, password del buzón dedicado (Titan/GoDaddy Workspace normalmente).

Activar checkbox **IMAP inbound**.

Click "Probar y guardar". Debe verse un ícono verde de conectado.

## B.3 Correo de escalación (client\_email)

Configurar → Autonomía y Avisos → campo "Correo para avisos y escalaciones".

Poner el correo real de Beatriz donde quiere recibir notificaciones cuando Nala escale. Puede ser `servicioalcliente@tortillasestrella.com.mx` o el personal de Beatriz.

## B.4 Conectar Dropbox

Configurar → Herramientas → Almacenamiento → Dropbox → Conectar.

Autorizar OAuth con la cuenta Dropbox de la tortillería (o una compartida entre Beatriz y el negocio). Verificar que aparece "Conectado" en verde.

## B.5 Setup CONTPAQi

Configurar → Herramientas → Facturación CFDI → click en "CONTPAQi Comercial Pro (con adaptador)". Se expande el panel.

Llenar todos los campos:

- **RFC emisor**: el de la tortillería
- **Régimen fiscal**: elegir en el dropdown (usualmente 601 para persona moral)
- **Código postal**: 5 dígitos
- **Serie default**: usualmente "T" o "A"
- **Uso CFDI default**: G03 (Gastos en general) es lo más común
- **Clave SAT de respaldo**: 50161509 para tortilla y masa (es fallback, cada producto tiene la suya en CONTPAQi)
- **Ruta base en Dropbox**: ej. `/Facturación` (debe existir ya en Dropbox, el Writer crea `Config/`, `Importables_CONTPAQi/`, `timbrados/` y `errores/` adentro)

Click Guardar. Aparece el botón "Descargar Writer para Windows". No lo bajes todavía.

---

# Bloque C — Instalación Writer en la PC de Beatriz (15:45 a 16:15)

Este paso pasa a la máquina Windows con CONTPAQi.

## C.1 Descargar

Desde el mismo portal, click en "Descargar Writer para Windows". Se descarga un zip nombrado tipo `centinelia-writer-servicioalcliente_tortillasestrella_com_mx-v0.10.5.zip` (34 MB aprox).

## C.2 Descomprimir

En una carpeta fácil de recordar. Recomendado: `C:\Centinelia\Writer\`.

Descomprimir ahí. Deben quedar 700+ archivos incluyendo `BillingContpaqiWriter.exe`, `centinelia-config.json`, `LEEME.txt` y muchas DLLs.

## C.3 Abrir consola en esa carpeta

Shift + click derecho en la carpeta → "Abrir ventana de PowerShell aquí". Alternativa: `cmd` desde el menú.

## C.4 Correr el wizard de primer arranque

Ejecutar:

```
BillingContpaqiWriter.exe --mode service
```

El wizard detecta que faltan datos locales y pregunta secuencialmente:

1. **Ruta del SDK CONTPAQi**: default `C:\Program Files (x86)\Compac\COMERCIAL`. Enter si es correcto.
2. **Ruta de la empresa CONTPAQi**: el folder de la BD (usualmente en `C:\Compac\Empresas\ad*`). El wizard auto-detecta empresas y las lista.
3. **Usuario CONTPAQi**: default SUPERVISOR. Enter para aceptar.
4. **Password SUPERVISOR**: teclearlo (o Enter si está vacío).
5. **Concepto FACT**: código interno de CONTPAQi para "4.0 CFDI FACTURA", usualmente `440`. Beatriz lo puede sacar de CONTPAQi mirando la lista de conceptos.
6. **Password del CSD**: teclearlo (o Enter si no tiene).
7. **Conexión SQL Server**: el wizard sugiere una cadena razonable basada en la ruta de la empresa. Revisar antes de aceptar.

Los tokens de Dropbox y la ruta base ya vienen preconfigurados en el zip. No pregunta por esos.

## C.5 Verificar que arrancó bien

Después del wizard, el Writer arranca solo. En la consola deberías ver:

```
[dropbox-fetcher] pidiendo token a https://www.centinelia.mx
[dropbox-fetcher] token OK, expira ...
[service] token Dropbox obtenido via API
[service] sesión CONTPAQi + empresa abiertas OK
[service] arrancando writer contra empresa ...
```

Si truena en `fAbreEmpresa`: Beatriz debe cerrar CONTPAQi (la app) para que el Writer pueda abrir la empresa vía SDK. Una empresa sólo la puede tener abierta un proceso a la vez.

## C.6 (Opcional) Registrar como Windows Service

Para que arranque solo con la máquina, en la misma consola:

```
sc create "Centinelia.BillingWriter" ^
   binPath= "C:\Centinelia\Writer\BillingContpaqiWriter.exe --mode service" ^
   start= auto
sc start "Centinelia.BillingWriter"
```

Requiere consola como administrador. Si Beatriz no tiene admin, saltar este paso hoy. Mientras la consola normal siga abierta, el Writer sigue vivo.

---

# Bloque D — Smoke test end-to-end (16:15 a 17:00)

Verifica el pipeline completo antes de dejar a Beatriz sola.

## D.1 Verificar sync del catálogo CONTPAQi

Esperar 1 a 2 minutos. En Dropbox, dentro de la carpeta base configurada (ej. `/Facturación`), debe aparecer:

- `Config/contpaqi_clientes.csv` con nombres reales de clientes
- `Config/contpaqi_productos.csv` con productos reales
- `Config/last_sync.json`

Si NO aparecen, revisar en la consola del Writer los logs. Causas comunes:

- SQL connection string mal armada (el wizard sugerido puede no matchear la instancia real).
- SUPERVISOR sin permisos de lectura en la BD.
- La ruta de la empresa está mal.

## D.2 Beatriz manda un correo de prueba

Beatriz manda desde su correo personal (o el que quiera) al correo dedicado de Nala (el que puso en B.2). Adjunta 1 foto de una remisión real. Asunto libre (ej. "Prueba remisión").

## D.3 Verificar que la card apareció

Esperar 2 a 3 minutos. En el portal, ir a `/oficina/facturas/pendientes`. Debe aparecer una card con:

- Foto clickeable con lightbox y zoom
- Folio, fecha y total (editables)
- Cliente con autocomplete contra el catálogo Dropbox
- Tabla de productos editable

Si NO aparece:

- Verificar en Vercel que el cron `agent-mailboxes` corrió y encontró la nueva Nala.
- Verificar que el account de correo se marcó como conectado en el portal.
- Revisar `billing_incoming_emails` en Supabase para ver si el correo se ingirió.

## D.4 Aprobar la card

Beatriz revisa la extracción. Si algo está mal:

- Cliente incorrecto: teclear código o nombre en el autocomplete y elegir el correcto.
- Productos mal parseados: editar cantidades, precios o SKUs directo en la tabla.

Click "Aprobar". Confirmación. La card queda con status "Aprobada" y desaparece de pendientes en unos segundos.

## D.5 Verificar timbrado

Esperar 3 a 5 minutos. En Dropbox:

- El XML de importación aparece en `Importables_CONTPAQi/pendientes/`.
- Cuando el Writer lo procesa se mueve a `timbrados/` con el CFDI timbrado adentro.
- Si falla, aparece en `errores/` con detalle del PAC.

En paralelo, en CONTPAQi (mirando desde la máquina de Beatriz):

- Aparece un documento nuevo en el concepto FACT.
- Timbrado exitoso queda con UUID.

## D.6 Verificar el correo de confirmación

El remitente original (Beatriz misma en la prueba) debe recibir un correo threaded con:

- CFDI XML adjunto
- PDF de representación gráfica (si el PAC lo generó)

Si el correo llega, el pipeline completo funciona. Bandera verde.

---

# Riesgos conocidos y planes B

## Worker timeout con muchas fotos

El worker de Vercel tiene 300 segundos. Con más de 4 fotos por correo se puede pasar. **Regla para hoy**: máximo 1 o 2 fotos por correo en las pruebas.

## Vision quality baja

Si la extracción del OCR sale muy mal en la mayoría de las remisiones, es el argumento definitivo para pivotar a Excel. Anotar los ejemplos concretos.

## Cron nala-writer-inbox

Si el timbrado se queda "pendiente" en Dropbox y el correo de confirmación nunca llega, revisar manualmente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.centinelia.mx/api/cron/nala-writer-inbox
```

## CONTPAQi ocupada

Si el Writer no puede abrir la empresa: Beatriz debe cerrar la app CONTPAQi durante los tests. Una empresa sólo puede tenerla abierta un proceso a la vez.

## Serilog EventLog SecurityException

Si el Writer truena al arranque con "The source was not found" del EventLog, es porque no corre como admin. Soluciones:

- Correr consola como administrador (click derecho → Ejecutar como administrador).
- O saltar el registro como Windows Service (paso C.6) por hoy.

## Nala consume tareas del trial

Cada correo procesado consume 1 a 3 tasks del trial (según pipeline). Con 100 tasks alcanza para 30 a 100 pruebas. Si se agota antes, es señal de que hay que subir la cuota o pivotar a Excel.

---

# Al cerrar la sesión

Antes de despedirte:

1. Confirmar con Beatriz que el trial vence el 2026-10-08.
2. Anotar el feedback que dio: pivot Excel sí o no, dolor específico, sorpresas.
3. Actualizar la memoria del proyecto (`project_tortilleria_estrella_trial_nala.md`) con:
   - Correo dedicado final que quedó configurado
   - Decisión sobre Excel vs foto
   - Cualquier bug o rareza descubierta durante la sesión
4. Si algo quedó a medias, crear un handoff con el estado exacto para retomar.

---

*Runbook generado el 2026-09-08 para la sesión de las 15:00 hrs. con Beatriz.*
