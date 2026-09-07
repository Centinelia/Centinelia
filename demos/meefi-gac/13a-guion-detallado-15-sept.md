# Guion detallado 15-sept — script operativo

Companion al `13-guion-cita-15-sept.md`. Ese archivo es la estructura estratégica (por qué cada escenario, cierre, objeciones). **Este archivo es el papel que traes impreso en la carpeta el día de la cita.**

Formato: por cada beat, `NAZRE:` es lo que dices verbatim, `ACCIÓN:` es qué haces en pantalla, `ESPERAR:` lo que probablemente pasa, `SEÑAL DE TROUBLE:` cuándo interrumpir, `MICRO-FALLBACK:` qué hacer si algo se cae.

Guarda 90 segundos de margen entre escenarios para transición + reacción.

---

## Pre-cita — 15 min antes

Checklist en tablet o teléfono:
- [ ] Portable conectado a corriente, brillo al 100%
- [ ] Hotspot activo y probado (ping test)
- [ ] Cable HDMI + adaptador USB-C en la maleta
- [ ] Chrome con 6 tabs abiertas en este orden (izq a der):
  1. `https://www.centinelia.mx/portal/5RP13tnLK6XX` (Meefi — Oficina)
  2. `https://www.centinelia.mx/portal/PJ9EALpprDEP` (GAC — Oficina)
  3. Gmail con la vista del correo Nova consolidado hasta arriba (ya enviado 7:30 AM)
  4. Google Drive con el ZIP `kyb-bajio.zip` listo para descargar/subir
  5. Loom fallback (grabado el 12) en pestaña dormida
  6. Este documento (13a) en tab final por si necesitas consultar
- [ ] Volumen del portable audible en la mesa (probar audio antes)
- [ ] Modo No molestar activado, notificaciones silenciadas
- [ ] Impreso de este documento en la carpeta, subrayado en los beats críticos
- [ ] SQL kill switch en clipboard por si algo se sale de control:
      `UPDATE organizations SET demo_paused = TRUE WHERE portal_email IN ('meefi-demo@centinelia.mx','gac-demo@centinelia.mx');`
- [ ] Confirmar `demo_paused = false` en ambas orgs (query rápida)
- [ ] Nara Meefi Vapi respondiendo — hacer llamada de prueba al `+52 33 2101 4544` 20 min antes
- [ ] Nash silenciado (`pilot_notify_email = NULL`) para evitar alertas falsas durante la corrida

---

## Bloque INTRO (min 0-5)

### Beat 0.1 — Ritual de entrada (min 0-1)

Saludo natural. No arranques con pitch, arranca con calibración.

NAZRE: "Antes de mostrarles nada, dos cosas para calibrar. Gera, del piloto de Meefi — ¿lo vas a operar tú directo, o Alan, o Emilio? Y Miguel, ¿tú vas a operar GAC o va a ser Ricardo o Adriana?"

ESPERAR: respuesta directa. Anota mental. Roles exactos de Alan y Emilio siguen sin confirmarse — aprovecha si el momento lo permite para clarificarlos ("¿en qué área está Alan? ¿y Emilio?").

MICRO-AJUSTE: si Gera dice "yo veo pero opera Alan/Emilio" → en el pitch de M2 dile "cuando abres tu correo" en vez de "cuando Alan abre el suyo".

### Beat 0.2 — Framing del bloque (min 1-3)

NAZRE: "Van a ver 6 escenarios en 45 minutos. 3 de Meefi, 3 de GAC. Voy a mostrarles empleados digitales que hoy están operando en clientes vivos con lógica similar a la de ustedes. Todo lo que van a ver es en vivo, no video, salvo un caso donde el correo ya llegó esta mañana. Cero preparación mía en el momento — es infra estable."

ESPERAR: alguno pregunta "¿y si algo se cae?" o "¿me dejas ver el back?"

RESPUESTA SI PREGUNTAN: "Todo lo que corre está en Supabase + Vercel + Vapi + Anthropic. Lo pueden auditar cuando quieran, y si algo se cae en los 45 min les enseño el Loom que grabé el viernes."

### Beat 0.3 — Elección de arranque (min 3-5)

NAZRE: "¿Con cuál quieren empezar, Meefi o GAC?"

ESPERAR: uno de los dos elige. Si empatan, arranca con Meefi porque es más visual con la voz.

**Si eligen GAC primero**: salta al bloque G1-G3 y regresa a M1-M3 después. El script funciona simétrico.

---

## Bloque MEEFI (min 5-25)

### M1 · Nara resuelve consulta en vivo (min 5-11)

#### M1.1 — Pitch (min 5-6)

NAZRE: "Ustedes ya tienen dashboard, tesorería, KYB. Lo que no tienen es cobertura 24/7 en la línea telefónica sin sumar CSMs. Escuchen esto. Gerardo, ¿puedes marcar de tu celular al +52 33 2101 4544, en altavoz, y hacerte pasar por Rogelio Salinas de Grupo Textiles del Norte? Pregúntale a Nara por el status del wire de $85,000 dólares a Mumbai que ordenaste ayer."

ACCIÓN: pasarle a Gerardo el guion escrito en un papelito para que no improvise mal.

Papelito literal para Gerardo:
> "Hola, soy Rogelio Salinas de Grupo Textiles del Norte. ¿Me pueden confirmar si ya salió el wire de $85,000 dólares que ordené ayer para el proveedor en Mumbai?"

#### M1.2 — Ejecución (min 6-9)

ACCIÓN: silencio. Deja que Nara hable. No interrumpas aunque tarde 2 segundos entre frases.

ESPERAR (respuesta esperada de Nara, estructura):
1. Saluda por nombre ("Hola, Rogelio")
2. Consulta el status vía tool (breve pausa mientras invoca)
3. Confirma que el MT103 ya fue emitido, da número de referencia, hora, banco corresponsal
4. Da ETA de acreditación al beneficiario
5. Pregunta si quiere que le mande el comprobante por correo
6. Registra ticket de la consulta

SEÑAL DE TROUBLE:
- Nara dice "no encuentro al cliente" → interrumpe: "Rogelio, gracias, Nara — es un cliente nuevo, tómalo como onboarding". Explica: "En un cliente real ya estaría en el directorio, aquí estamos en demo."
- Nara empieza a alucinar montos distintos → cortar con "gracias Nara, colgamos" y explicar: "El KB no está calibrado a $85K — 60 seg de ajuste al KB y esto no vuelve a pasar."
- Voz se corta o Vapi cuelga → MICRO-FALLBACK abajo.

MICRO-FALLBACK: abre la tab Oficina Meefi, chat de Nara, escribe la misma consulta en texto: "Nara, Rogelio de Grupo Textiles pregunta status del wire de $85K a Mumbai ordenado ayer." Nara responde en chat con la misma info.

#### M1.3 — Cierre del beat (min 9-11)

NAZRE: "Esta llamada, ¿cuántas veces al día llega a su mesa de operación? ¿Y cuántas veces a la semana llega en sábado o después de las 8pm y nadie contesta? Con 6 personas en el equipo, ¿quién agarra ese sábado?"

ESPERAR: número aproximado. Cualquier respuesta > 5/día valida el ROI.

NAZRE: "Nara cubre esa cobertura sin humano. Sin rotación, sin calibración de nuevo staff cada 6 meses. La misma Nara respondiendo con el mismo tono desde el primer día."

Transición al M2 (30 seg):
> "OK, eso fue voz — la parte reactiva. Ahora déjame mostrarles la parte proactiva: qué es lo que Nova hace **sin que nadie se lo pida**."

### M2 · Consolidado diario + producción ad-hoc (min 11-17)

#### M2.1 — Parte A · Correo pre-enviado (min 11-14)

ACCIÓN: cambiar de tab a Gmail. El correo Nova consolidado 14-sept está hasta arriba (enviado 7:30 AM).

NAZRE: "Esto es lo que Gerardo ya tiene esperándolo cuando prende la laptop cada mañana. Nadie le pidió esto hoy, ni ayer, ni ninguna mañana desde que lo activamos. Nova lo produce cada día a las 7:30 AM sin recordatorios."

ACCIÓN: abrir el correo. Deja 3 segundos para que lean el subject y el resumen.

NAZRE (mientras lees en voz alta las secciones): "Resumen del día. TPV, operaciones, variación vs promedio 7 días — con contexto de por qué la variación, no solo el número. Breakdown por corredor. Top clientes por volumen. Y aquí" (señala alertas) "es donde Nova gana su costo."

ACCIÓN: bajar hasta la sección ALERTAS. Leer las 3 alertas en voz alta.

NAZRE: "Reconciliation break de $12,400 dólares que no bajó de corresponsal en 18 horas. Cliente operando 1.8 sigma arriba de baseline. Nuevo beneficiario en Italia en cola de KYB. Cada una con recomendación de acción, no solo alerta."

ACCIÓN: abrir el Excel adjunto por 5 seg y cerrar. Suficiente para que vean el detalle.

BEAT CLAVE (bajar el tono, mirar a Gerardo): "Este es el trabajo del analista jr que hoy tienes o el que ibas a contratar el próximo trimestre. Ahí está, ya hecho, cada mañana."

#### M2.2 — Parte B · Chat en vivo, request ad-hoc (min 14-17)

ACCIÓN: cambiar de tab a Oficina Meefi, entrar al chat de Nalú (o Nova, según el roster vigente — confirmar en dry run del 12).

NAZRE: "Y este es Nalú a las 11 AM cuando le pides algo distinto que no habías planeado."

ACCIÓN: escribir en el chat en vivo, delante de ellos:
> "Nalú, arma un consolidado solo de operaciones USD mayores a $50K de la última semana, ordenado por cliente. Devuelve tabla + Excel."

ACCIÓN: enter. Silencio.

ESPERAR (respuesta esperada de Nalú/Nova):
1. Mensaje breve tipo "Voy" o "Reviso cartera y armo"
2. Pausa 10-25 seg mientras invoca tools (lee sheet, filtra, construye XLSX)
3. Respuesta con tabla estructurada en el chat + link/adjunto a Excel

SEÑAL DE TROUBLE:
- >30 seg sin respuesta → NAZRE: "A veces se toma un minuto cuando cruza varios criterios. Mientras se procesa, déjenme regresarles al correo de las alertas de la mañana..." — vuelves al correo y expandes verbalmente.
- Nalú devuelve un Excel vacío → "El KB tiene solo 7 clientes ficticios en demo, en producción sería tu cartera real."
- Nalú alucina un cliente que no está en el Sheet → "Ese lo revisamos post-cita, no está en cartera hoy."

MICRO-FALLBACK completo: si la Parte B falla por completo, cortar y decir: "OK, el wow ya se los di con el correo de la mañana. La producción ad-hoc les queda de tarea probarla ustedes mismos cuando les entregue tokens al final."

#### M2.3 — Cierre del beat (min 17)

NAZRE: "Nalú reemplaza al analista jr que arma el reporte diario, y encima está disponible cuando quieres un slice distinto que no habías pedido. No se enferma, no rota, no toma vacaciones, no dice 'te lo mando al rato'. Costo constante mes a mes."

Transición al M3 (15 seg):
> "Y el último de Meefi es el que ataca su bottleneck de activación: el KYB."

### M3 · Niva procesa KYB en 60 segundos (min 17-23)

#### M3.1 — Pitch (min 17-18)

NAZRE: "Gera, tú me pusiste por correo el jueves que **el proceso más manual y repetitivo que tienen hoy es el onboarding de clientes nuevos** — recolectar docs, validar, dar seguimiento a lo que falta, capturar en varios lugares. Esto ataca justo esa parte. Miren."

BEAT: mirar a Gerardo, dejar que él confirme con la cabeza. La frase es suya, no tuya, y por eso pega.

REFUERZO: "Y además cae directo en el escritorio del nuevo Head of Regulatory Compliance que están contratando — Niva es su primera contratación digital antes de que llegue el primer humano."

#### M3.2 — Ejecución (min 18-22)

ACCIÓN: cambiar al chat de Niva en Oficina Meefi. Descargar el `kyb-bajio.zip` de Drive y arrastrarlo al chat.

ACCIÓN: escribir:
> "Niva, procesa el KYB de este nuevo lead. Comercializadora del Bajío SA de CV, importadora de refacciones de EEUU. Necesito recomendación en 2 min."

ACCIÓN: enter. Silencio.

ESPERAR (respuesta esperada de Niva, estructura):
1. Confirma que recibió el ZIP y va a procesar
2. Pausa 20-40 seg
3. Reporte estructurado:
   - Datos extraídos: denominación, RFC, régimen, capital, giro
   - Consistencia entre docs (RFC en acta = RFC en RFC = RFC en opinión 32-D, domicilio coincide)
   - Accionistas identificados: Rodrigo Torres 40%, Lucía Sánchez 25%, **Viktor Kovalenko 35% (nacionalidad rusa)** ← el flag deliberado
   - Simulación de checks: OFAC clean para Torres y Sánchez, **BCF Kovalenko requiere revisión enhanced** por país de origen
   - Opinión 32-D positiva, sin adeudos SAT
   - **Recomendación: NO aprobar automáticamente. Escalar a Sofía Zambrano (compliance senior) por BCF ruso ≥ 25%.**

BEAT CLAVE cuando Niva escala: mirar a Gerardo y decir en voz baja:
> "Aquí está el punto. Niva **NO aprobó**. Detectó al BCF ruso, sabe que en tu política interna eso requiere revisión enhanced, y escaló. Un analista jr sin experiencia hubiera pasado por alto que Viktor tiene 35% (arriba del threshold de 25%)."

SEÑAL DE TROUBLE:
- Niva aprueba sin escalar → cortar el flow y decir: "Aquí el KB no tiene la política de BCF ruso ≥ 25% cargada. En un cliente real esa política se carga en 5 min y no vuelve a pasar."
- Niva no extrae datos de los PDFs → "El OCR de estos PDFs artesanales que armé no es perfecto. En producción usamos KYBs escaneados profesionales, no docs armados el fin de semana."
- Niva tarda >90 seg → NAZRE: "Los KYBs reales son 5-8 documentos, ahí sí tarda 40-60 seg. Mientras procesa, cuéntenme cómo funciona hoy su flujo de compliance..." — usa el tiempo muerto como calibración con Gerardo.

MICRO-FALLBACK: si Niva no responde en 2 min, decir: "Este es el único escenario que a veces se atora con docs no estándar. Les enseño el Loom del viernes donde corrió limpio." Abrir el Loom fallback.

#### M3.2b — Chase automático de docs faltantes (30 seg, dentro del mismo hilo)

Justo después de que Niva emita su reporte con escalación a Sofía, escribir en el chat:

NAZRE en chat: "Niva, ¿qué doc adicional necesitas para reabrir el análisis?"

ESPERAR: Niva responde algo como "requiero comprobante de domicilio con vigencia < 3 meses y poder legal firmado por Rodrigo Torres con vigencia notariada". Luego (idealmente) ofrece mandar correo al contacto del lead pidiéndolos.

NAZRE en chat: "Sí, manda el correo. Contacto: `nazre20+bajio@gmail.com`, a nombre de Rodrigo Torres."

ACCIÓN inmediata: cambiar a tab Gmail y esperar el correo. Cuando llegue, abrirlo, mostrar que:
- Está personalizado por nombre
- Lista exactamente los 2 docs faltantes con especificidad (no "manda docs" genérico)
- Da deadline
- Menciona el ID del expediente Bajío para trazabilidad

BEAT CLAVE: "Aquí es donde cierra la parte de 'seguimiento a lo que falta' que me dijiste. Niva no solo valida — persigue lo pendiente sin que alguien tenga que empujar. Y todo queda en un solo expediente auditable."

SEÑAL DE TROUBLE: Niva no propone mandar correo → tú se lo pides explícito: "Manda tú el correo pidiendo lo faltante." Si ni así, MICRO-FALLBACK: "En producción el correo lo dispara ella sola apenas identifica el faltante — hoy en demo lo tuve que empujar."

MICRO-FALLBACK completo: si esta parte falla, saltar directo al cierre sin insistir. El wow ya se entregó con la escalación de BCF ruso.

#### M3.3 — Cierre del beat (min 22-23)

NAZRE: "40 minutos de analista senior comprimidos a 60 segundos, con trazabilidad completa, con escalación cuando toca, y con chase automático de lo faltante. **Tu proceso más manual, resuelto por Niva**. Su promesa comercial de 'activo en 24h' baja a 4-6h real."

REFUERZO POST-PILOTO (mencionar en 15 seg, sin demo): "En fase 2 del piloto, Niva pushea el expediente a HubSpot como nueva ficha compliance y a Drive con el ZIP validado. Adiós al 'capturar en varios lugares'."

Transición a GAC (30 seg):
> "OK, eso fue Meefi. Miguel, cambio a lo tuyo — GAC. Aquí lo que ataca es el problema más doloroso de un despacho: el chase mensual, los reportes que nadie lee, y el día 15 de tortura antes del vencimiento SAT."

---

## Bloque GAC (min 25-45)

### G1 · Chase mensual multi-canal (min 25-31)

#### G1.1 — Pitch (min 25-26)

NAZRE: "Miguel, tu junior contable pierde 3 días al mes chaseando docs a clientes. Correos, WhatsApps, llamadas. Y el día 5 aún no llega la mitad de la información. Mira esto."

#### G1.2 — Ejecución (min 26-30)

ACCIÓN: cambiar al chat de Nara GAC en Oficina.

ACCIÓN: escribir:
> "Nara, dispara el chase mensual a los 6 clientes de agosto. Cada uno con lo específico que falta según sus servicios contratados. Reporta cuando termines de mandar."

ACCIÓN: enter. Silencio.

ESPERAR (respuesta esperada de Nara, estructura):
1. Confirma que va a consultar el directorio
2. Pausa 15-30 seg mientras arma los 6 correos y los envía
3. Reporte al chat: "6 correos enviados. Scoreboard iniciado. Próximo follow-up: día 3 si no responden."

ACCIÓN INMEDIATA: cambiar a la tab Gmail y filtrar por `to:nazre20+`. Ahí deben aparecer los 6 correos entrantes en tiempo real (aliases del directorio apuntan a tu Gmail).

NAZRE: "Miren, los 6 correos ya llegaron. Aquí a Verónica Salgado de Refaccionaria del Norte, aquí a Juan Miguel Guerra de Transportes, aquí a Adriana la doctora dentista..."

ACCIÓN: abrir uno cualquiera, mostrar que está **personalizado** — saludo por nombre, lista específica de solo lo pendiente de ese cliente, fecha límite ideal día 5, fecha límite dura día 8.

BEAT CLAVE: "Esto no es un mailmerge. Nara consultó cada cliente en el directorio, vio qué servicios tiene contratados, cruzó con qué docs faltan de agosto, y armó un correo distinto para cada uno con solo lo pendiente. Y va a hacer follow-up sola el día 3, escalarte el día 5, y reportarte el día 8."

SEÑAL DE TROUBLE:
- Nara solo manda 3 en vez de 6 → "Los otros 3 ya los mandó ayer, no los repite. En un cliente real tú ves el scoreboard con todos los estados."
- Los correos llegan idénticos → cortar y decir: "El KB del scoreboard no está diferenciando servicios. Es 1 hora de ajuste."
- No llega ningún correo a tu Gmail → probar SMTP outbound: "El scoreboard está armado pero el SMTP tarda 30 seg. Mientras espera, les cuento el flujo de escalación..."

MICRO-FALLBACK: si nada llega a Gmail en 45 seg, abrir los correos preparados en el asset `17-directorio-clientes-gac-DEMO.csv` y explicar el escenario con capturas del dry run del 12.

BONUS SI HAY TIEMPO Y VAN SOBRADOS (opcional, solo si sobran 90 seg del bloque):
NAZRE: "Y esto es cuando Verónica llama de regreso por dudas."
ACCIÓN: hacer una llamada desde tu celular al +52 33 2101 4544 haciéndote pasar por Verónica ("ya te mandé el estado de cuenta, ¿me confirmas que llegó?"). Nara actualiza el scoreboard en vivo.

#### G1.3 — Cierre del beat (min 30-31)

NAZRE: "3 días de junior perseguidor, en 90 segundos. Nara sigue de largo con follow-ups día 3, día 5, día 8, escalación a contador si no responden. Tu junior deja de perseguir y empieza a hacer trabajo contable real."

Transición al G2 (15 seg):
> "Y esto que sigue es lo que ningún despacho está haciendo, ni con Contalink ni con nadie. Tu diferenciador premium."

### G2 · Reporte mensual traducido al dueño (min 31-37)

#### G2.1 — Pitch (min 31-32)

NAZRE: "Miguel, cuando Ricardo cierra la contabilidad de Transportes Guerra el mes 5, ¿qué le mandas al dueño? ¿La balanza? ¿El estado de resultados?"

ESPERAR: probablemente responde "sí, la balanza y estado de resultados con un correo explicativo".

NAZRE: "Y ¿el dueño la lee?"

ESPERAR: honestamente responderá "a veces sí, a veces no". Ese es el gancho.

#### G2.2 — Ejecución (min 32-36)

ACCIÓN: cambiar al chat de Niva GAC en Oficina.

ACCIÓN: subir el Excel `gac-08-balance-transportes-guerra-ago2026.csv` (si lo tienes ya en Google Sheets, puedes darle la URL directa o subirlo como archivo).

ACCIÓN: escribir:
> "Niva, prepara el reporte mensual traducido de Transportes Guerra Hermanos para agosto. Ricardo ya cerró la contabilidad. Devuélvelo en PDF firmado por Miguel Guajardo."

ACCIÓN: enter. Silencio.

ESPERAR (respuesta esperada de Niva, estructura):
1. Confirma que recibió el balance
2. Pausa 30-60 seg mientras analiza y arma el PDF
3. PDF de 2 páginas:
   - Página 1: snapshot ejecutivo (ingresos $X, gastos $Y, utilidad $Z, comparativo agosto vs julio, agosto 2026 vs agosto 2025)
   - Página 2: insight en lenguaje de dueño ("tus utilidades bajaron 12% vs julio porque combustible subió $180K por el aumento del diesel y por los viajes extra a Nuevo Laredo del contrato de X"), pago SAT del mes desglosado, alertas de flujo de efectivo, 2-3 recomendaciones concretas de GAC, firmado por Miguel Guajardo

ACCIÓN: abrir el PDF, mostrar página 1 (10 seg), pasar a página 2 (20 seg), quedarse ahí.

BEAT CLAVE: leer en voz alta el insight de la página 2. Especialmente la parte de "por qué" bajaron las utilidades.
> "'Tus utilidades bajaron 12% vs julio porque combustible subió $180K debido al aumento del diesel y a los viajes extra a Nuevo Laredo del contrato con X'. Esto es lo que Juan Miguel Guerra sí lee y por lo que sí paga premium."

SEÑAL DE TROUBLE:
- Niva devuelve solo la balanza sin traducción → "El KB de estilo GAC no está calibrado a lenguaje de dueño. 1 sesión de calibración."
- Niva alucina cifras que no están en el Excel → cortar, decir "aquí necesita mejor grounding al archivo, es fix conocido."
- PDF no se genera (solo texto en chat) → "En producción usa create_document con template. Aquí en demo es solo texto porque no armé el template exacto de GAC."

MICRO-FALLBACK: si Niva no responde en 2 min, mostrar un PDF ejemplo pregrabado desde el dry run.

#### G2.3 — Cierre del beat (min 36-37)

NAZRE: "Este es el reporte por el que un cliente promedio de despacho boutique acepta pagar $5K MXN al mes extra. Si el 20% de tus 65 clientes lo acepta, son $75K MXN mensuales de revenue nuevo. Sin sumar horas humanas."

**Cómo posicionar vs Contalink si preguntan aquí**: "Contalink te da la balanza. Niva te da el reporte que el cliente sí entiende y por el que sí paga."

Transición al G3 (15 seg):
> "Y el último — el día 15-17 de cada mes."

### G3 · Semáforo pre-vencimiento SAT (min 37-42)

#### G3.1 — Pitch (min 37-38)

NAZRE: "El día 15-17 es tu peor día del mes. Todos los clientes preguntando cuánto pagar, si ya está la declaración, si depositaron a tiempo. Mira cómo se acaba eso."

#### G3.2 — Ejecución (min 38-41)

ACCIÓN: cambiar al chat de Nara GAC.

ACCIÓN: escribir (simulando que es 14-sept, 1 día antes del vencimiento):
> "Nara, dame el semáforo de mis 6 clientes para el vencimiento del 17. Y avisa a los que aún no han depositado el importe."

ACCIÓN: enter. Silencio.

ESPERAR (respuesta esperada de Nara, estructura):
1. Consulta el sheet `custom_semaforo_sat` con los 6 clientes marcados deliberadamente (2 amarillos, 1 rojo, 3 verdes)
2. Devuelve dashboard con clasificación 🟢/🟡/🔴
3. Anuncia que va a enviar correos a los amarillos con importe exacto + línea de captura + fecha límite dura
4. Confirma envíos con IDs de correo

ACCIÓN: cambiar a Gmail nuevamente y mostrar los 2 correos personalizados que llegaron a los aliases `nazre20+X@gmail.com` correspondientes a los amarillos.

BEAT CLAVE: "En vez de que tú manosees 65 líneas de Excel el día 14, Nara ya tiene el semáforo y ya avisó a los amarillos. Tú solo revisas los rojos, que son los que necesitan tu criterio humano."

SEÑAL DE TROUBLE:
- Nara devuelve todo verde → "El sheet no tiene los estados calibrados. En demo debería haber 2 amarillos y 1 rojo — verifiquemos post-cita."
- No manda los correos → "El SMTP a veces tarda. En este momento debería estar saliendo..." (checar Gmail 15 seg después).

MICRO-FALLBACK: mostrar capturas del dry run donde el semáforo corrió correctamente.

#### G3.3 — Cierre del beat (min 41-42)

NAZRE: "Estos 3 escenarios de GAC atacan los 3 dolores que Miguel me describió en discovery: chase, reportes que no lee el cliente, y el infierno del día 15. Los 3 quedan resueltos con 2 empleados digitales — Nara y Niva."

Transición al cierre (30 seg):
> "OK, eso fue todo lo operativo. 6 escenarios. Déjenme cerrar con propuesta concreta."

---

## Bloque CIERRE COMERCIAL (min 45-55)

### C.1 — Pitch de cierre (min 45-47)

NAZRE (bajar el tono, mirar a los dos): "Meefi hoy son 6 personas. Con 3 empleados digitales activos ya son 9 de capacidad operativa. Sin gastar en headcount, sin curva de onboarding, sin rotación. Y encima el nuevo Head of Compliance llega con Niva ya operando debajo — no arranca de cero. GAC puede pasar de 65 a 90 clientes sin contratar a nadie más. Mismo problema, misma solución. Empezamos por el que ustedes quieran, o los dos en paralelo."

ESPERAR: alguno pregunta por precio.

### C.2 — Precio (min 47-49)

**Si preguntan por precio**:

NAZRE: "Meefi son $35 a $50 mil pesos al mes por los 3 empleados activos (Nara, Nalú/Nova, Niva), más setup one-time de $50 a $80 mil. GAC son $25 a $35 mil al mes por 3-4 empleados (Nara, Niva, y Nala en fase 2 cuando se justifique adapter Contalink), más setup one-time de $40 a $60 mil."

NAZRE (inmediatamente después): "El rango se define en discovery de 2 sesiones. Y les propongo piloto de 30 días con precio de piloto — puedo mandarles la propuesta escrita el 16 con números específicos para cada uno de los dos negocios."

### C.3 — Manejo de objeciones esperadas (min 49-53)

**Objeción "¿Cómo se integra con Contalink?"**
NAZRE: "Contalink hace la parte fiscal y contable, muy bien. Centinelia hace la parte de coordinación con clientes — chase, avisos, reportes traducidos, semáforo SAT. No competimos con Contalink, nos coordinamos alrededor. Si más adelante quieren que escribamos directo en Contalink, hay API disponible y lo evaluamos cliente por cliente cuando el ROI lo justifique."

**Objeción "¿Y si mi cliente ya usa X sistema?"**
NAZRE: "Nara y Niva trabajan con lo que el cliente ya usa. El chase y los reportes son sistema-agnósticos. Si eventualmente quieren integración profunda, la construimos por cliente cuando el ROI la justifique."

**Objeción "¿Cómo se conecta con HubSpot / Intercom / Drive?"**
NAZRE: "En fase 1 del piloto los empleados operan alrededor — correo, chat, teléfono. En fase 2, típicamente 30-45 días después de activar, integramos push a HubSpot para nuevas fichas de compliance/lead, y sync a Drive para expedientes. Intercom outbound se puede plantear pero por default operamos correo directo. Cada integración se prioriza según lo que más frecuencia tenga en el piloto."

**Objeción "¿Van a reemplazar al Head of Compliance que estamos contratando?"**
NAZRE: "Al contrario. Niva es su primera contratación digital antes de que llegue el humano. El Head of Compliance llega y encuentra el trabajo repetitivo ya orquestado — se dedica al criterio y al diseño de política, no a mover docs entre carpetas. Y él o ella es quien calibra a Niva."

**Objeción "¿Qué pasa si Nara/Niva dicen algo incorrecto?"**
NAZRE: "Cada respuesta queda en bitácora. Ustedes revisan lo que quieran, ajustan el KB en el momento. En 2 semanas la calibración es cero fricción. Y para casos de mayor riesgo — como el KYB que vieron — los empleados escalan a humano en vez de decidir solos."

**Objeción "¿Y la privacidad de los datos de mis clientes?"**
NAZRE: "Los datos viven en la infra que quieran — nuestra base o la suya. Contratos con NDA estándar, y para GAC podemos plantear que la infra corra en su tenant si el pool de clientes lo pide."

**Objeción sorpresa que no anticipamos**:
NAZRE: "Anoto la duda, la respondo por escrito en 24 horas con nombres y números." (no improvisar respuesta técnica que no tengamos validada).

### C.4 — Pedido claro y siguiente paso (min 53-55)

NAZRE: "El pedido que les hago es este: si esto les hace sentido para al menos uno de los dos negocios, mañana les mando propuesta escrita con precio de piloto de 30 días y timeline de arranque. En 15 días de piloto tienen data suficiente para decidir si escalan."

NAZRE: "¿Me dan luz verde para mandarles la propuesta?"

ESPERAR: respuesta.

- Si dicen **sí** → "Perfecto. Mañana antes de mediodía la tienen en su correo."
- Si dicen **necesitamos platicarlo entre nosotros** → "Cerrado. ¿En qué fecha quieren que les vuelva a marcar/escribir?"
- Si dicen **no** → "Cerrado. Cuéntenme qué faltó para que sí, quiero entenderlo bien."

---

## Bloque BUFFER (min 55-60)

Para lo que quede: preguntas sueltas, casos específicos que quieran preguntar, "¿y qué pasa si...?", detalles técnicos.

Si terminas antes de min 55, no expandas de más — cierra con:
> "Los dejo con la propuesta en el correo mañana. Cualquier duda por correo, cualquier hora. Gracias por el tiempo."

Salir sin sobreextender. **La cita se cierra fuerte cuando terminas por debajo del tiempo, no cuando lo llenas.**

---

## Post-cita — mismo día

- [ ] Anotar en un doc: qué prometiste, qué preguntaron sin respuesta, señales de temperatura (interés alto/medio/bajo por negocio)
- [ ] Antes de las 8 PM: correo de "gracias por la reunión" con próximos pasos exactos y timing prometido
- [ ] Si dijeron sí a propuesta: agendar bloque de trabajo del 16 en la mañana para armarla y mandarla antes de mediodía
- [ ] Reactivar Nash pilot-monitor: `UPDATE organizations SET pilot_notify_email = 'nazre20@gmail.com' WHERE portal_email IN ('meefi-demo@centinelia.mx','gac-demo@centinelia.mx');`
- [ ] Actualizar [[handoff-prospecto-gerardo-guajardo-2026-09-02]] con el resultado

## Relacionados

- `13-guion-cita-15-sept.md` — estructura estratégica (pitches, cierres, objeciones)
- `14-correo-nova-consolidado-DEMO.md` — asset del correo M2 parte A
- `16-kyb-comercializadora-bajio-DEMO.md` — 5 docs KYB para M3
- `17-directorio-clientes-gac-DEMO.csv` — 6 clientes GAC para G1/G3
- `handoff_que_sigue_cierre_2026-09-03.md` en memoria — prioridades restantes
