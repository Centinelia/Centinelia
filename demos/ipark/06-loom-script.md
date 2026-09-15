# Loom script — Nala IPark, 3 minutos

Guión palabra por palabra + click por click para grabar en 1 solo take. Target: 2:30 - 3:00 min.

## Credenciales listas (provisionadas 2026-09-09)

- **URL login:** https://www.centinelia.mx/portal/login
- **Email:** `ipark-demo@centinelia.mx`
- **Password:** `demo1234`
- **URL bandeja directa (post-login):** https://www.centinelia.mx/portal/Et9uwwRLzwdW/oficina/bandeja

Token portal: `Et9uwwRLzwdW`
Agent ID Nala: `30986654-b509-43d3-9ac7-cd3c18e56d3f`

## Setup 5 min antes de grabar

1. Abre Chrome ventana **nueva** (Cmd/Ctrl+N) — fondo limpio, sin extensiones visibles
2. Login: pega el email + password arriba
3. Confirma que la bandeja abre y muestra los 10 correos
4. Cierra cualquier notificación de "Bienvenido" o setup que aparezca
5. Prepara Loom Desktop: modo "Screen + Cam", 720p mínimo, mic en tu headset
6. Silencia Slack, WhatsApp Desktop, iMessage, correo personal
7. Practica el guión abajo 1 vez en voz alta antes de grabar

## Guión (2:30-3:00)

### [0:00-0:15] Intro — cámara

*(Cámara al centro, sonriendo, hablas al lente)*

> "Hola, soy Nazre de Centinelia. Como platicamos, les preparé un demo corto de cómo funciona Nala, la facturista digital que se conectaría al inbox de facturación de IPark. Son dos minutos y medio. Vamos."

### [0:15-0:40] La bandeja

*(Compartes pantalla con la bandeja ya abierta. Ves 10 correos en lista)*

> "Aquí está el inbox de facturación de IPark con los últimos 10 correos que entraron. Nala ya los procesó todos. Fíjense cómo los clasificó..."

*(Con el cursor señala los correos, agrupando visualmente)*

> "...cinco de ellos son facturación y Nala los atendió. Los otros cinco son otra cosa — quejas operativas, marketing, notificaciones del banco — y Nala los dejó intactos porque no le competen a facturación. Se quedan aquí para que el equipo humano los siga viendo como siempre."

### [0:40-1:30] Caso happy path — Grupo Mex (pending, HERO)

*(Click en el correo de Laura Morales — Grupo Mex)*

> "Este es el caso feliz. Laura de Grupo Mex mandó su solicitud con todos los datos: RFC, folio del boleto, régimen fiscal, uso CFDI. Fíjense qué hizo Nala..."

*(El panel muestra: ai_summary, invoice_data con RFC/folio/etc, ai_draft de respuesta)*

> "...extrajo los datos, validó el RFC contra el catálogo del SAT, ya tiene lista la respuesta con el CFDI para adjuntar."

*(Muestra el draft del correo — lo lees en voz alta rápido)*

> "'Listo, aquí tiene su factura por su estancia en IPark aeropuerto MTY del 3 al 6 de septiembre. Adjunto XML y PDF del CFDI. Cualquier ajuste me avisa. Facturación IPark.' Corto, directo, en el idioma del cliente, sin mencionar que es una IA ni Centinelia. Es simplemente Facturación IPark contestando."

*(No hace falta que le des click a "aprobar" en vivo — si la UI tiene el botón visible, opcionalmente lo clickeas y muestras el "enviado". Si no, sigues al siguiente correo)*

### [1:30-2:00] Caso info incompleta — Héctor

*(Click en el correo de Héctor Villareal)*

> "Este otro correo también pide factura pero le falta info. Nala detectó qué falta específicamente..."

*(Muestra invoice_data con "faltantes: regimen, uso_cfdi, cp")*

> "...régimen fiscal, uso CFDI, código postal. En vez de timbrar a medias o mandarle un formulario largo, Nala solo pide lo específico que le hace falta..."

*(Lees el draft)*

> "'Para generar su factura me falta: régimen fiscal, uso CFDI, código postal fiscal. En cuanto me los mande le genero el CFDI de inmediato.' Cuando Héctor responda con esos tres datos, Nala continúa el mismo hilo y timbra."

### [2:00-2:30] Caso escalación — Patricia mes vencido

*(Click en el correo de Patricia Moreno)*

> "Y aquí el caso que Nala NO se mete a resolver sola. Cliente pidió factura de una estancia hace 6 semanas — mes fiscal ya cerrado — y además perdió el boleto. Dos condiciones que requieren criterio humano."

*(Muestra el ai_summary y el status: escalated)*

> "Fíjense lo que hace: primero le responde al cliente que va a verificarlo y le responde hoy — no lo deja colgado. Y segundo, escala al equipo humano con todo el contexto pre-digerido: RFC, importe aproximado, razón por la que no procede, propuesta de siguiente paso. La persona humana pasa de leer 1,000 correos al mes a leer 100 o 150 que sí requieren su cerebro. Y cada uno le llega con la tarea a medio hacer."

### [2:30-3:00] Cierre — cámara

*(Dejas de compartir. Vuelves a cámara)*

> "Eso es Nala en 3 minutos. Los correos que ven ahí son ficticios porque es demo, pero el flujo end-to-end es el que correría con la cuenta de InvoiceOne de IPark el día uno. Cuando ustedes quieran, agendamos siguiente paso para dimensionar cómo se ve el POC. Cualquier duda por acá me avisan. Gracias."

## Detalles técnicos importantes

**Estado del demo en el momento de grabar:**

- Correo #1 (Laura Morales) → status: `pending`, ai_draft listo → HERO MOMENT
- Correo #2 (Héctor) → status: `info_requested`, muestra "esperando respuesta cliente"
- Correo #3 (M. Fernández RFC mal) → status: `info_requested`, muestra "esperando confirmación RFC"
- Correo #4 (Robert Chen inglés) → status: `auto_replied`, respuesta en inglés — menciona brevemente si tienes tiempo, es power move
- Correo #5 (Patricia mes vencido) → status: `escalated` → usado en el caso escalación
- Correos #6, #7, #8 (rayón, marketing, BBVA) → status: `skipped` → los "no facturación" ignorados
- Correo #9 (TechMex re-envío) → status: `auto_replied`, encontrada y reenviada
- Correo #10 (Constructora corrección) → status: `escalated`

**Si algo en la UI se ve diferente a lo esperado:**

- El componente `OpsInboxSection` renderiza los items desde `ops_inbox`. Los estados y drafts que ves están pre-cargados en la DB, no hay LLM corriendo durante el video.
- Si algún panel dice "no hay drafts" cuando debería haber uno, refresca la página o revisa que el token de sesión esté vigente.
- Si el botón "Aprobar y enviar" del Correo #1 no existe en la UI actual, no importa — el video no requiere que envíes en vivo. Basta con mostrar el draft ya redactado.

## Post-grabación

1. Descarga el video de Loom.
2. Recorta al target 2:30-3:00 si es más largo (Loom permite trim inline).
3. Comparte el link privado (no público) a la asistente de Bichara junto con el PDF de propuesta que ya tienes.
4. Body del correo:

> "Hola [nombre], como comentamos te mando este demo corto de Nala facturista (2:30 min) y el PDF con la propuesta ejecutiva. Cuando lo veas y quieras avanzar al siguiente paso, me avisas por acá o me marcas. Un abrazo, Nazre."

## Reset del demo entre grabaciones (si necesitas re-take)

Si grabaste una vez y quieres volver a arrancar desde cero con la bandeja limpia:

```sql
-- Ejecutar en Supabase Studio o vía MCP
UPDATE ops_inbox
SET status = CASE
  WHEN email_from = 'laura.morales@grupomex.com.mx' THEN 'pending'
  WHEN email_from IN ('hector.villareal@outlook.com', 'mfernandez@bufete-mx.mx') THEN 'info_requested'
  WHEN email_from IN ('robert.chen@meridian-partners.com', 'contabilidad@techmex.mx') THEN 'auto_replied'
  WHEN email_from IN ('patricia.moreno@gmail.com', 'admin@constructoralm.com.mx') THEN 'escalated'
  ELSE 'skipped'
END,
sent_at = NULL,
updated_at = NOW()
WHERE agent_id = '30986654-b509-43d3-9ac7-cd3c18e56d3f';
```

## Después del cliente (si cierra)

1. Reemplazar credenciales InvoiceOne mock (`demo/demo`) por reales de sandbox
2. Cambiar `organizations.portal_email` de `ipark-demo@centinelia.mx` a el correo real (`facturacion@ipark.com.mx`)
3. Cargar el CSD real de IPark en la cuenta InvoiceOne
4. Activar reenvío del inbox real de IPark hacia Centinelia
5. Marcar `enabled: true` para `invoiceone` en `PAC_CATALOG`
6. Correr smoke tests E2E antes de flippear a prod
