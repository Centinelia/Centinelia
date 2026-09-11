# Runbook ejecución cita 15-sept -- Meefi -- Nelia + Niva

Documento de ejecución. Impreso o abierto en un dispositivo separado (celular, iPad) durante la cita. Cada paso indica exactamente qué clic, qué URL, qué frase copiar-pegar, qué esperar.

**Regla de oro**: si algo se cae en vivo, no entres en pánico ni intentes debuggear. Pausas 5 segundos, dices "esto es lo que ya vieron funcionar antes; aquí un video del ensayo" y reproduces el Loom del bloque en cuestión. Sigues al siguiente bloque. Post-cita revisas el gap.

---

## D-1 · Domingo 14-sept

### Noche antes (30 min)

- [ ] Enviar correo confirmación a Gera (draft en `24-correo-a-gera-preparacion-15sept.md`). Sin WhatsApp.
- [ ] Cargar laptop al 100%.
- [ ] Verificar que `centinelia.dev@gmail.com` sigue con Gmail conectado a Nelia. Query rápida:
  ```
  https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados
  ```
  → Nelia → Herramientas → sección Correo → debe decir "Gmail Conectado".
- [ ] Correr script preflight desde terminal:
  ```
  cd C:/Users/Nazre/centinelia
  node scripts/meefi/preflight-check.mjs
  ```
  Esperado: **9/9 OK** (con `pnpm dev` local corriendo, o 8/9 sin él — el que falta es el endpoint local).
- [ ] Preparar impresión física del runbook + guion 13b, por si la laptop se queda sin batería.

---

## D-0 · Lunes 15-sept

### 90 min antes de la cita

- [ ] Desayunar. Cero café en exceso (temblor de manos con el trackpad).
- [ ] Ropa: como sueles vestir para reuniones ejecutivas MTY.
- [ ] Cargar laptop hasta 100% otra vez. Empacar cargador.
- [ ] Empacar cable HDMI + adaptador USB-C si el lugar tiene proyector.
- [ ] Empacar hotspot (celular con datos) por si el WiFi del lugar falla.

### 45 min antes

- [ ] Salir con margen para llegar 15 min antes al lugar.

### 15 min antes de entrar

Setup en el estacionamiento o cafetería cercana:

- [ ] Abrir laptop, cerrar Slack/mail personal/Notion para evitar pop-ups.
- [ ] Abrir **6 pestañas en Chrome** en este orden:

  1. `https://www.centinelia.mx/demo/meefi?scenario=1` -- Bloque 1
  2. `https://www.centinelia.mx/demo/meefi?scenario=2` -- Bloque 2 HERO
  3. `https://www.centinelia.mx/demo/meefi?scenario=3` -- Bloque 3 KB
  4. `https://www.centinelia.mx/demo/meefi?scenario=4` -- Bloque 4 2FA
  5. `https://mail.google.com` (con cuenta `nazre20@gmail.com`, filtro `to:nazre20+`)
  6. `https://www.centinelia.mx/portal/login` -- para Bloque Niva

- [ ] En cada pestaña 1-4, hacer clic en la burbuja de Nelia abajo-derecha, verificar que abre el chat. **NO enviar mensaje** (para que el chat aparezca vacío cuando lo abras en vivo).

- [ ] Login en pestaña 6 con `meefi-demo@centinelia.mx` + `MeefiDemo2026!`. Después ir a Empleados → click en **Niva**. Dejar esa pantalla lista.

- [ ] Silenciar notificaciones sistema (Windows: Focus Assist ON, o Do Not Disturb).

- [ ] Verificar zoom del navegador al 110% o 125% para que el widget se vea grande en proyector.

- [ ] Abrir este runbook en el celular o en una pestaña 7 para consultar durante la demo.

### 5 min antes

- [ ] Entrar al lugar. Saludos protocolarios.
- [ ] Preguntar si prefieren proyector o pantalla compartida (Zoom/Meet si es remoto).
- [ ] Conectar. Verificar audio (si hay parlantes, aunque en esta demo no hay audio narrado).
- [ ] Compartir la pestaña 1 (Bloque 1) o pantalla completa según prefieras. Pantalla completa te da más flexibilidad.

---

## Ejecución de la cita (target 45-50 min)

**Recordatorio**: el guion detallado con verbatims está en `13b-guion-detallado-15-sept-nelia.md`. Este documento es solo los pasos accionables.

### Beat 0 · Saludo y contexto (min 0-3)

- [ ] Saludos, presentaciones si hay Alan/Emilio.
- [ ] Pregunta clave: "¿Confirman que vamos con lo que hablamos: chatbot de soporte inteligente para Meefi?". Recibir asentimiento antes de avanzar.
- [ ] Verbatim del guion 13b Beat 0 sobre el dolor de Intercom escalando todo.

### Beat 1 · Contexto de qué van a ver (min 3-5)

- [ ] Verbatim del guion 13b Beat 1 (los 5 bloques que vas a mostrar, 45 min total).

### Bloque 1 · Password reset (min 5-13)

- [ ] Cambiar a **pestaña 1** (`?scenario=1`).
- [ ] Click en burbuja Nelia (abajo-derecha).
- [ ] Copiar-pegar en el chat:
  ```
  Hola, no puedo cambiar mi contrasena. Ya intente varias veces y el link no me funciona.
  ```
- [ ] Enviar. **Esperar respuesta completa** (~15-20 seg).

  Respuesta esperada (dry runs 1+2): Nelia dice "Reviso tu caso. El reset esta bloqueado porque tu correo aun no esta confirmado. Busca el correo de bienvenida y haz clic en Confirmar. Regresa aqui y te mando el link."

- [ ] Verbatim del guion 13b: anclarse en el hecho de que Nelia identificó el motivo real (correo no verificado) en vez de mandar link genérico como haría Intercom.
- [ ] Copiar-pegar segundo turno:
  ```
  Ya confirme mi correo, ahora si.
  ```
- [ ] Enviar. Esperar respuesta.

  Respuesta esperada: Nelia intenta el reset, ve que sigue bloqueado (fixture estático), guía a revisar spam.

- [ ] Verbatim del guion 13b para cerrar el bloque: en producción real esta lógica se conecta al sistema de Meefi y actualiza en tiempo real.

### Bloque 2 HERO · Transferencia no reflejada (min 13-25)

- [ ] Cambiar a **pestaña 2** (`?scenario=2`).
- [ ] Click en burbuja Nelia.
- [ ] Copiar-pegar:
  ```
  Hice una transferencia de 50 mil pesos hace como dos horas y no me aparece en mi cuenta.
  ```
- [ ] Enviar. Esperar respuesta.

  Respuesta esperada: Nelia consulta el estado, dice que va a BBVA, pendiente_rieles, ETA 19:00. Pregunta si hay urgencia.

- [ ] Verbatim del guion 13b sobre el diagnóstico específico (BBVA, ETA, contexto).
- [ ] Copiar-pegar segundo turno:
  ```
  Si, es urgente. Es a un proveedor y tiene cierre de operaciones hoy a las 5.
  ```
- [ ] Enviar. Esperar respuesta.

  Respuesta esperada: Nelia dice "Escalo ahora" y confirma ticket `esc_XXXXXXXX` con Emilio.

- [ ] **Cambiar a pestaña 5 (Gmail)** y verificar que llega el correo. Filtro `to:nazre20+emilio` debería mostrarlo top.
- [ ] Abrir el correo. **Zoom in del navegador (Ctrl+Shift+"+")** al 150% para que se lea desde el proyector.
- [ ] Verbatim del guion 13b: mostrar el resumen ejecutivo estructurado (ticket, prioridad, resumen, hipótesis, próxima acción, CTA morado).
- [ ] Cerrar el zoom (Ctrl+0) y volver a la pestaña 2.

### Bloque 3 · KB Help Center (min 25-31)

- [ ] Cambiar a **pestaña 3** (`?scenario=3`).
- [ ] Click en burbuja Nelia.
- [ ] Copiar-pegar:
  ```
  Cuanto tiempo tarda una transferencia SPEI a otro banco?
  ```
- [ ] Enviar. Esperar respuesta.

  Respuesta esperada: Nelia cita literalmente del artículo con detalles por banco (BBVA 15 min, Banorte 30 min, HSBC hora en punto) + 2 links a `help.meefi.io/tiempos-spei` y `/horarios-spei`.

- [ ] Verbatim del guion 13b: el contenido sale del Help Center real (o va a salir cuando conecten el suyo). Nelia no inventa tiempos, no aproxima.

### Bloque 4 · 2FA recovery (min 31-42)

- [ ] Cambiar a **pestaña 4** (`?scenario=4`).
- [ ] Click en burbuja Nelia.
- [ ] Copiar-pegar:
  ```
  Perdi el celular donde tenia el Authenticator. Ya no puedo entrar a mi cuenta.
  ```
- [ ] Enviar. Esperar respuesta.

  Respuesta esperada: Nelia abre ticket `rec_XXXXXXXX` y pide 4 items en lista clara (INE frente, INE reverso, selfie con INE, últimos 4 cuenta).

- [ ] Verbatim del guion 13b: contraste con Intercom que solo escalaría "un momento por favor".
- [ ] Copiar-pegar segundo turno:
  ```
  Listo, subi las tres fotos (INE frente, reverso y selfie con la INE). Los ultimos 4 digitos son 4872.
  ```
- [ ] Enviar. Esperar respuesta.

  Respuesta esperada: Nelia confirma que tiene los 4 items y escala con `esc_XXXXXXXX` a Ashley.

- [ ] **Cambiar a pestaña 5 (Gmail)** y verificar correo en `nazre20+ashley@`. Zoom 150%.
- [ ] Verbatim del guion 13b: mostrar el resumen ejecutivo (mismo template que Bloque 2 pero para Ashley cuentas).

### Bloque Niva · Compliance (min 42-48)

- [ ] Cambiar a **pestaña 6 (portal Meefi)**.
- [ ] Ya deberías estar en el chat de Niva desde el setup.
- [ ] Verbatim del guion 13b Beat N.0 sobre transición: el mismo patrón aplica a compliance, relevante por el Head of Compliance nuevo.
- [ ] Copiar-pegar el prompt completo del expediente:
  ```
  Niva, tengo el expediente de Comercializadora Bajio SA de CV, importadora de refacciones de EEUU. Datos: representante legal Juan Perez Ramirez, INE vigente. RFC CBA850101ABC, opinion 32-D positiva al 2026-08-15, domicilio Monterrey NL vigente. BCF: Ana Sanchez Romero (65%, mexicana, residente MX) y Luis Ramirez Torres (35%, mexicano, residente MX). Volumen mensual estimado 300 mil USD, corredor USD-MXN, bancos origen BBVA-Banorte. Frecuencia semanal. Corre checks OFAC, UIF, PLD y screening PEP, dame el analisis con recomendacion para Sofia.
  ```
- [ ] Enviar. Esperar respuesta (~60-90 seg, es la más larga).

  Respuesta esperada: memo estructurado con 5 secciones (Resumen expediente, Checks OFAC/UIF/PEP, Análisis de riesgo, Gaps documentales, Recomendación). Aprobación condicionada con lista de docs faltantes.

- [ ] Scroll para mostrar cada sección. Zoom en la sección de "Gaps documentales" y "Recomendación".
- [ ] Los 3 verbatims anchor del guion 13b:
  1. "Detecto Ana Sanchez con 65% activa revision enhanced."
  2. "Nota metodologica honesta: la busqueda web publica no equivale a API OFAC. En produccion se conecta a WorldCheck."
  3. "Le dio a Sofia 7 documentos concretos que le faltan. Ya priorizado."

### Cierre comercial (min 48-52)

- [ ] Verbatim del guion 13b Beat C.1 (resumen y propuesta).
- [ ] Pricing según catálogo o custom según lo que hayas decidido.
- [ ] Pregunta explícita: "¿Quién queda como owner operativo del piloto de tu lado — tú, Alan, Emilio, los 3?".
- [ ] Confirmar siguiente cita para arrancar setup.
- [ ] Recoger tarjetas / correos formales si aplica.

---

## Contingencias durante la cita

### Si el widget no responde en un bloque

- Cerrás la pestaña, abrís nueva con la misma URL, reintentás una vez.
- Si tampoco responde: dices "aquí un video del ensayo del sábado" y reproduces el Loom del bloque en cuestión.
- Sigues al siguiente bloque sin invertir tiempo en debuggear.

### Si el correo no llega en Bloque 2 o 4 en <10 seg

- Esperás 30 seg más sin cambiar de pantalla (el proceso puede tardar).
- Si sigue sin llegar: dices "el correo está en la cola, mientras tanto les muestro el HTML que Emilio recibe" y abres un screenshot preparado del correo (`26-anexo-correos-screenshots.png` — tenerlo listo).

### Si Niva pide más info en vez de dar el memo

- Ese comportamiento defensivo es válido. Verbatim: "Esta bien, mira lo que hace. Antes de decidir te pide el expediente. Este es el opuesto de un chatbot que aprueba sin datos. Ahora se lo doy."
- Pegar el mismo prompt otra vez. Segunda corrida debería producir el memo.

### Si el portal está caído

- Verificás en `vercel.com` (celular) que el deploy siga live.
- Si está caído: pausás, tomás agua, dices "les enseño el sistema en un video del ensayo" y reproduces los 5 Loom en secuencia.

### Si Gera te interrumpe con una pregunta técnica compleja

- No entres en tecnicismos. Responde: "Buena pregunta. Eso lo dejamos para la próxima sesión donde revisamos setup con tu equipo. Sigo con el bloque para no perder el hilo, ¿te parece?".

### Si te preguntan por precio ANTES de terminar la demo

- "Al final del recorrido te doy el número con contexto de lo que estás pagando. Sigo con esto que es lo importante primero."

---

## Post-cita (mismo día)

- [ ] Correo de gracias + siguiente paso a Gera (draft en `25-correos-post-cita-drafts.md`). Antes de las 5 PM.
- [ ] Si dijeron sí al piloto: correo con pricing exacto por separado.
- [ ] Anotar en tu bitácora personal: qué preguntas hicieron, qué objecciones salieron, qué feedback sobre Nelia/Niva. Estos son inputs para calibración futura.
- [ ] Reactivar Nash (opcional, solo si vas a monitorear el piloto activo post-cita):
  ```sql
  UPDATE organizations SET pilot_notify_email = 'nazre20@gmail.com' WHERE portal_email = 'meefi-demo@centinelia.mx';
  ```

---

## Referencias rápidas

- Portal Meefi login: `https://www.centinelia.mx/portal/login` -- `meefi-demo@centinelia.mx` -- `MeefiDemo2026!`
- Portal Meefi directo con token: `https://www.centinelia.mx/portal/5RP13tnLK6XX`
- Nelia agent_id: `e17bc13d-8624-4792-89d7-eac00edad051`
- Gmail conectado: `centinelia.dev@gmail.com`
- Aliases correo: `nazre20+emilio@`, `nazre20+ashley@`, `nazre20+jaime@`, `nazre20+gera@`

## Ver también

- `13b-guion-detallado-15-sept-nelia.md` -- verbatims completos y narrativa detallada
- `25-correos-post-cita-drafts.md` -- 3 variantes de correo mismo lunes
- `dry-run-gaps-2026-09-11.md` -- resultado dry run 1 con todos los gaps arreglados
- `dry-run-gaps-2026-09-11-corrida-2.md` -- dry run 2, 5/5 PASS sin regresiones
