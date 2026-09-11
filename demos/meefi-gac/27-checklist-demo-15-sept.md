# Demo Meefi 15-sept -- Checklist paso a paso

Documento único para el día de la cita. Cero preparación previa el mismo lunes. Solo llegar, abrir esta hoja, seguir los pasos numerados.

**Cómo usar**: cada paso te dice qué link abrir y qué copiar. Después de cada paso hay 1-2 líneas de qué decir mientras la empleada responde. Todos los links son clicables desde esta hoja.

**Para convertir a PDF**: abrir este archivo en Chrome (o VS Code) → Ctrl+P → Guardar como PDF. O usar pandoc si tenés: `pandoc 27-checklist-demo-15-sept.md -o demo-15-sept.pdf`.

---

## Referencias que tenés que tener a mano

- **Gmail**: `nazre20@gmail.com` -- ya logueado siempre en tu Chrome.
- **Portal Meefi**: `meefi-demo@centinelia.mx` -- `MeefiDemo2026!`.
  - Login: <https://www.centinelia.mx/portal/login>
  - Si ya te loguéaste una vez en las últimas 2 semanas, la cookie sigue viva y no te va a pedir contraseña otra vez.

---

## PASO 0 · Apertura (verbal, 2-3 min)

Sin nada que abrir aún. Solo hablás.

Gera, Alan, Emilio (si asisten): gracias por hacer espacio. Hoy les voy a mostrar 5 casos que hoy escalan a su equipo por Intercom, resueltos por dos empleadas: Nelia en soporte, Niva en compliance. Vamos a ver caso por caso cómo la reciben, cómo trabajan y cómo entregan. Empezamos con soporte.

---

## PASO 1 · Abrir Bloque 1 (Password reset)

**Clic acá**: <https://www.centinelia.mx/demo/meefi?scenario=1>

Se abre el dashboard de Meefi simulado. Abajo a la derecha vas a ver una burbuja azul con la "N" de Nelia. Clic en la burbuja para abrir el chat.

**Mientras se carga (2 seg)**: "Esta es la vista del usuario. Nelia vive abajo a la derecha, como cualquier chatbot del que ya están acostumbrados con Intercom."

---

## PASO 2 · Enviar mensaje del usuario

**Copiar y pegar en el chat de Nelia** (Ctrl+C acá, Ctrl+V en el chat):

```
Hola, no puedo cambiar mi contrasena. Ya intente varias veces y el link no me funciona.
```

Presionar Enter para enviar.

**Mientras Nelia responde (~15 seg)**:
"Miren la diferencia con Intercom. Intercom les mandaría un link genérico y listo. Nelia primero está revisando la cuenta real del usuario en Meefi para saber por qué el reset no le está funcionando."

**Respuesta esperada**: Nelia dice algo como "el reset está bloqueado porque tu correo aún no está confirmado" y guía a buscar el correo de bienvenida.

**Después de que responda, decís**: "Detectó el motivo real. Correo no confirmado. Le está guiando al paso concreto: revisar el correo de bienvenida y confirmar. Si no funciona, entonces sí escalamos. Pero primero: diagnóstico."

---

## PASO 3 · Segundo mensaje del usuario

**Copiar y pegar en el mismo chat**:

```
Ya confirme mi correo, ahora si.
```

Enter.

**Mientras Nelia responde**:
"Ahora que el usuario dice que confirmó, Nelia va a reintentar el envío del link."

**Respuesta esperada**: Nelia intenta enviar el link, ve que el sistema todavía muestra la cuenta como no verificada, guía al usuario a esperar 2-3 minutos y revisar spam.

**Cierre Bloque 1**: "Esa segunda respuesta es clave. Nelia no le miente al usuario ni le manda un link roto. Le da la información honesta: dame 2-3 minutos, revisa spam, si no funciona seguimos. Un chatbot que aprueba a ciegas te destruye la confianza del usuario. Nelia no lo hace."

---

## PASO 4 · Abrir Bloque 2 HERO (Transferencia)

**Clic acá**: <https://www.centinelia.mx/demo/meefi?scenario=2>

Nueva pestaña. Clic en la burbuja de Nelia abajo-derecha.

**Verbal**: "Este es el caso que más les escala Intercom. Transferencia no reflejada."

---

## PASO 5 · Enviar mensaje del usuario

**Copiar y pegar**:

```
Hice una transferencia de 50 mil pesos hace como dos horas y no me aparece en mi cuenta.
```

Enter.

**Mientras Nelia responde (~15 seg)**:
"Intercom aquí simplemente escalaría diciendo 'un momento por favor' porque no tiene acceso al sistema. Nelia sí lo tiene."

**Respuesta esperada**: Nelia consulta el estado, dice que la transferencia va a BBVA, está pendiente_rieles, con ETA antes de las 19:00 CDMX. Pregunta si hay urgencia.

**Después**: "Sin escalar. Le dio al usuario: monto, destino, estado y ETA. Y le está preguntando activamente si hay urgencia, para decidir si escalar o no. Ese pregunta activa es lo que un buen agente humano hace."

---

## PASO 6 · Segundo mensaje del usuario (urgencia declarada)

**Copiar y pegar**:

```
Si, es urgente. Es a un proveedor y tiene cierre de operaciones hoy a las 5.
```

Enter.

**Mientras Nelia responde**:
"Ahora sí escala. Y esta es la parte que quiero que vean."

**Respuesta esperada**: Nelia confirma el escalamiento con ticket `esc_XXXXXXXX` a Emilio de Operaciones.

**Cuando Nelia confirme el ticket, decís**: "Y ahora vamos a ver qué es exactamente lo que Emilio recibe."

---

## PASO 7 · Ver el correo que Nelia le mandó a Emilio

**Clic acá**: <https://mail.google.com/mail/u/0/#search/from%3Acentinelia+transferencia_urgente>

Se abre Gmail con el filtro. El correo más reciente arriba será el que Nelia acaba de enviar.

**Clic en el correo para abrirlo.**

**Verbal mientras lo abrís**:
"Esto es lo que Emilio recibe. Miren el nivel de contexto."

**Punto a punto, señalás con el cursor**:
- Header morado: "Meefi Soporte -- Escalamiento"
- Título: "Nelia te delega un caso"
- Tabla con Ticket, Prioridad, Tema, Responsable (Emilio Operaciones), Usuario, Fecha y hora
- Sección Resumen: nombre del cliente, monto, destino, transfer_id, motivo de urgencia
- Sección Hipótesis: interpretación de Nelia
- Sección Próxima acción sugerida: qué debería hacer Emilio
- Botón morado: "Abrir conversación en Meefi"

**Verbatim**: "Emilio no tiene que preguntarle nada al usuario. Recibe el caso con el contexto ejecutivo listo. Sabe el monto, sabe el destino, sabe que el deadline es hoy a las 5. Y tiene la conversación original a un clic. Esto es lo que quisieran que Intercom hiciera cuando escala."

---

## PASO 8 · Abrir Bloque 3 (Consulta de tiempos SPEI)

**Clic acá**: <https://www.centinelia.mx/demo/meefi?scenario=3>

Nueva pestaña. Clic en la burbuja.

**Verbal**: "Este es un caso simple pero importante. Preguntas informativas sobre su plataforma."

---

## PASO 9 · Enviar mensaje del usuario

**Copiar y pegar**:

```
Cuanto tiempo tarda una transferencia SPEI a otro banco?
```

Enter.

**Mientras Nelia responde**:
"Fijense de dónde saca la respuesta. No la inventa."

**Respuesta esperada**: Nelia cita literalmente del artículo del Help Center con detalle por banco (BBVA/Santander 15 min, Banorte 30 min, HSBC hora en punto) + 2 links al `help.meefi.io`.

**Después**: "Ese contenido sale del Help Center de Meefi ingerido. Nelia no memoriza, no aproxima. Cita textualmente y da el link. Si mañana ustedes cambian ese artículo, Nelia responde con el nuevo texto sin retocar nada."

---

## PASO 10 · Abrir Bloque 4 (2FA perdido)

**Clic acá**: <https://www.centinelia.mx/demo/meefi?scenario=4>

Nueva pestaña. Clic en la burbuja.

**Verbal**: "Y este es el caso más ambicioso. Recovery de 2FA cuando el usuario perdió el celular. Hoy con Intercom esto se convierte en un ping-pong de 10 correos con Ashley."

---

## PASO 11 · Enviar mensaje del usuario

**Copiar y pegar**:

```
Perdi el celular donde tenia el Authenticator. Ya no puedo entrar a mi cuenta.
```

Enter.

**Mientras Nelia responde**:
"Miren cómo estructura el recovery."

**Respuesta esperada**: Nelia abre ticket `rec_XXXXXXXX` y pide 4 items en lista clara (INE frente, INE reverso, selfie con INE, últimos 4 de la cuenta bancaria).

**Después**: "En un solo mensaje. Los 4 items exactos que Ashley necesita para autorizar el reset. No 3 correos separados. No 'espera 24 horas para que te contactemos'. Cinco segundos de respuesta con el checklist completo."

---

## PASO 12 · Segundo mensaje del usuario (evidencia)

**Copiar y pegar**:

```
Listo, subi las tres fotos (INE frente, reverso y selfie con la INE). Los ultimos 4 digitos son 4872.
```

Enter.

**Mientras Nelia responde**:
"Ahora Nelia detecta que tiene los 4 items completos y escala con Ashley."

**Respuesta esperada**: Nelia confirma que tiene todo y escala con `esc_XXXXXXXX` a Ashley.

**Después**: "El escalamiento con contexto completo, igual que el de Emilio. Ashley recibe todo pre-empacado."

---

## PASO 13 · Ver el correo que Nelia le mandó a Ashley

**Clic acá**: <https://mail.google.com/mail/u/0/#search/from%3Acentinelia+recovery_2fa>

Gmail con filtro. Clic en el correo más reciente.

**Verbal**: Mismo template que el de Emilio pero para Ashley. Señala:
- Prioridad: media
- Responsable: Ashley (Cuentas)
- Sección Resumen: incluye los 4 items de evidencia
- Sección Hipótesis: recovery legítimo con evidencia completa
- Próxima acción: validar INE vs KYC, resetear 2FA, notificar QR nuevo

"Ashley abre esto y ya sabe exactamente qué hacer. No tiene que armar el rompecabezas. Nelia se lo armó."

---

## PASO 14 · Transición a Niva (Compliance)

**Verbal (sin nada que abrir todavía)**:
"Todo lo que vieron hasta ahora aplica a soporte. La misma lógica de diagnóstico, acción, escalamiento con contexto completo, aplica igual en compliance. Y esto es relevante porque van a tener un Head of Compliance nuevo entrando. Les enseño lo que ya está operando debajo. Cambio de empleada. Vamos con Niva, la directora de análisis y compliance."

---

## PASO 15 · Abrir el chat de Niva en el portal

**Clic acá**: <https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados>

Si te pide login, usar `meefi-demo@centinelia.mx` + `MeefiDemo2026!`. Si ya estás logueado (probable), vas directo a la lista de empleados.

**Clic en la tarjeta de Niva** (la que tiene "Directora" y una N morada).

**En su página, buscar el botón para abrir chat con ella o su bandeja**. Depende del layout — puede estar como pestaña "Chat" o "Bandeja" o similar.

**Verbal mientras cargás**:
"Esta es la vista interna. Es como el equipo de ustedes hoy operaría. Niva vive acá, procesa casos, deja bitácora, escala si hace falta."

---

## PASO 16 · Enviar prompt del expediente a Niva

**Copiar y pegar en el chat de Niva** (largo, es un solo copy-paste):

```
Niva, tengo el expediente de Comercializadora Bajio SA de CV, importadora de refacciones de EEUU. Datos: representante legal Juan Perez Ramirez, INE vigente. RFC CBA850101ABC, opinion 32-D positiva al 2026-08-15, domicilio Monterrey NL vigente. BCF: Ana Sanchez Romero (65%, mexicana, residente MX) y Luis Ramirez Torres (35%, mexicano, residente MX). Volumen mensual estimado 300 mil USD, corredor USD-MXN, bancos origen BBVA-Banorte. Frecuencia semanal. Corre checks OFAC, UIF, PLD y screening PEP, dame el analisis con recomendacion para Sofia.
```

Enter.

**Mientras Niva responde (~60-90 seg, es la respuesta más larga)**:
"Este es el tipo de expediente que un analista jr en tu equipo tardaría 30 min en procesar. Niva lo hace en 90 segundos y con estructura."

Podés hacer una pausa acá para tomar agua. La respuesta va a tardar más que las de Nelia.

**Respuesta esperada**: memo estructurado con 5 secciones:
1. Resumen del expediente
2. Checks OFAC, UIF, PEP
3. Análisis de riesgo
4. Gaps documentales
5. Recomendación

---

## PASO 17 · Recorrer el memo con 3 anchors verbatim

Cuando aparece el memo completo, hacés scroll de arriba a abajo mostrando cada sección. En cada punto clave decís:

**Anchor 1 -- cuando muestres análisis de riesgo o recomendación**:
"Fíjense en esto. Detectó que Ana Sánchez con 65% activa revisión enhanced. Un analista jr sin experiencia hubiera pasado por alto ese threshold porque son mexicanos ambos y sin flags OFAC. Niva no."

**Anchor 2 -- cuando muestres la sección de checks OFAC**:
"Y esto es lo que va a apreciar tu Head of Compliance. Niva es honesta sobre sus límites. Ahí dice, cito literal: 'la búsqueda web pública no equivale a la API OFAC directa'. En producción esto se conecta a WorldCheck o LexisNexis y Niva lo declara. No pretende ser algo que no es."

**Anchor 3 -- cuando muestres gaps documentales y recomendación**:
"Y le dio a Sofía 7 documentos concretos que le faltan al expediente. Sofía no tiene que preguntar 'qué me falta'. Ya lo tiene priorizado. Y le dio condiciones operativas de monitoreo desde el mes 1 con baseline 3-sigma. Eso lo aprende de los casos de ustedes, no de mí."

**Cierre Niva**: "Y esto queda en expediente auditable. El Head of Compliance llega y ya tiene historial de los casos procesados, los criterios que se aplicaron, los escalamientos. Puede calibrar los thresholds si quiere."

---

## PASO 18 · Cierre comercial

**Verbal**:

"Vieron 5 casos. Los 4 primeros son los que hoy más escalan a su equipo por Intercom. El quinto es el que va a ocupar buena parte del tiempo del Head of Compliance que están contratando.

Nelia y Niva no reemplazan a Ashley, Emilio, Jaime, ni al Head of Compliance. Los liberan del ping-pong para que se concentren en los casos que sí requieren criterio humano.

Propuesta: arrancamos con Nelia sola durante 3 semanas. Semana 1 setup e ingesta de su Help Center real, calibración de reglas de escalamiento. Semana 2 dry runs contra su ambiente sandbox. Semana 3 shadow con tu equipo. Semana 4 producción gradual con 20% del tráfico y monitoreo. Si en un mes los KPIs de escalamiento se reducen 60% o más, agregamos Niva en compliance como fase 2.

Pricing base es plan Pro combinado (minutos + tareas): 320 tareas y 40 minutos al mes por empleada. Con el volumen que manejan y las 2 empleadas trabajando, el número mensual está alrededor de los $12,000 pesos. Cotización formal se las mando esta semana con el detalle desglosado.

Una pregunta antes de cerrar: ¿quién queda como owner operativo del piloto de su lado, tú, Alan, Emilio, o los 3?

[Escuchar respuesta.]

Perfecto. Les mando esta misma tarde el correo con próximos pasos y el bloque de calendario para arrancar setup el miércoles 17 o jueves 18. ¿Les funciona?"

---

## Contingencias durante la cita

### Si el chat de Nelia no responde en un bloque

Cerrás la pestaña, abrís nueva con el mismo link, reintentás una vez.
Si tampoco responde: "Este bloque se demoró más de lo normal. Les enseño el video del ensayo de sábado" y reproducís el Loom del bloque.
Sigues al siguiente sin invertir tiempo en debugear.

### Si el correo no llega en Gmail en 20 segundos

Refrescás la pestaña de Gmail. Si sigue sin llegar en 30 seg total: "Está tardando más de lo normal. En producción el envío es asincrónico y el destinatario lo recibe en menos de 5 segundos. Mientras tanto les muestro cómo se ve el correo cuando llega." Abres un screenshot o el correo del dry run 1 que ya está en tu bandeja.

### Si Niva pide más info en vez de dar el memo

"Está bien, miren lo que hace. Antes de decidir les pide el expediente completo. Este es el opuesto del chatbot genérico que aprueba cualquier cosa sin datos. Ahora se lo doy y procesa." Pegás el mismo prompt otra vez o le agregás más detalle.

### Si Gera pregunta el precio ANTES del Paso 18

"Al final del recorrido les doy el número con contexto de lo que están pagando. Sigo con esto que es lo importante primero."

### Si el portal está caído

Verificás en `vercel.com` desde tu celular. Si está caído: pausás, dices "les enseño los videos del ensayo" y reproducís los 5 Loom en secuencia. Cierre comercial igual.

---

## Post-cita mismo día (antes de las 5 PM)

Mandar correo de gracias con siguiente paso. Draft en `demos/meefi-gac/25-correos-post-cita-drafts.md`, hay 3 variantes según cómo salió (A pego / B con reservas / C no pegó). Elegís una y ajustás 2-3 frases con detalles reales.

---

## Estado técnico (por si alguien pregunta después)

- Todo el stack Meefi vive en producción en `centinelia.mx`.
- Nelia usa Gmail OAuth conectada a `centinelia.dev@gmail.com` para escalamientos.
- Niva usa el motor de reasoning de Centinelia con acceso a búsqueda web pública.
- 15 artículos del Help Center están pre-ingeridos como fixture. En producción real se conectaría al Help Center de ustedes vía Intercom API o scraping periódico.
- Los cuatro escenarios de Nelia usan datos de usuario y transferencia fixture, dado que no tenemos acceso al backend de Meefi todavía.

---

## Links de referencia (para no perder tiempo el lunes buscando)

- Bloque 1 Password reset: <https://www.centinelia.mx/demo/meefi?scenario=1>
- Bloque 2 Transferencia HERO: <https://www.centinelia.mx/demo/meefi?scenario=2>
- Bloque 3 KB Help Center: <https://www.centinelia.mx/demo/meefi?scenario=3>
- Bloque 4 2FA recovery: <https://www.centinelia.mx/demo/meefi?scenario=4>
- Gmail filtro escalamientos Nelia: <https://mail.google.com/mail/u/0/#search/from%3Acentinelia+meefi>
- Portal Meefi login: <https://www.centinelia.mx/portal/login>
- Portal Meefi empleados: <https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados>
