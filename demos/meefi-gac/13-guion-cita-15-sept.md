# Guion cita 15-sept — 60 min presencial

Meefi + GAC (Gerardo + Miguel Guajardo). Presencial 1h. Un solo número de voz activo (+52 33 2101 4544 → Nara Meefi). Todo lo demás por pantalla (chat de Oficina + email).

## Regla de oro para elegir escenarios

**Evitar cualquier demo que asuma escritura en Contalink**. La API Contalink existe (pólizas, CFDIs, balanza) pero requiere API Key por-RFC y no expone nómina ni webhooks. Para la cita, posicionar Centinelia como **capa que se coordina alrededor de Contalink**, no que reemplaza sus features nativas (auto-clasificación DIOT, timbrado nómina, contabilidad electrónica).

## Timeline 60 min

| Tiempo | Bloque | Owner |
|---|---|---|
| 0-5 | Intro + confirmar roles (Gerardo socio operativo MTY, Miguel director GAC) | Nazre |
| 5-25 | **Meefi**: Esc M1 voz + Esc M2 email + Esc M3 chat | Nazre operando |
| 25-45 | **GAC**: Esc G1 chase + Esc G2 reporte traducido + Esc G3 semáforo SAT | Nazre operando |
| 45-55 | Cierre comercial + preguntas | Nazre |
| 55-60 | Buffer + próximos pasos | — |

## Escenarios Meefi (20 min · 3 wow)

### M1 — Nara resuelve consulta de status en vivo (voz, 6 min)

**Pitch al abrir:** "Ustedes ya tienen dashboard, tesorería, KYB. Lo que no tienen es soporte 24/7 sin sumar CSMs. Escuchen esto."

**Ejecución:** pedir a Gerardo que marque en altavoz al +52 33 2101 4544 haciéndose pasar por Rogelio Salinas de Grupo Textiles del Norte:
> "¿Me pueden confirmar si ya salió el wire de $85,000 USD que ordené ayer para el proveedor en Mumbai?"

**Nara debe:** reconocer al cliente (si el número simulado está en directorio Meefi), consultar status vía tool, responder con MT103 emitido / hora / banco corresponsal / ETA / referencia, ofrecer mandar comprobante, registrar ticket.

**Fallback si algo se rompe en voz:** cambiar a chat y hacer la misma consulta escrita — Nara responde igual.

**Cierre del escenario:** "Este tipo de consulta llega ¿cuántas veces al día a su equipo de noche o sábado? Nara las contesta sin humano. Cero rotación, cero calibración."

### M2 — Consolidado diario matutino automático (email, 6 min)

**Pitch:** "Y esto es lo que Daniel y tú abren cada mañana sin haber pedido nada."

**Ejecución:** abrir en la pantalla el correo de demo (Gmail / bandeja) donde Nova ya dejó el reporte del día anterior:
> Asunto: "Meefi — Consolidado diario 2-sept — TPV $1.2M USD, 47 operaciones"

Mostrar en vivo el cuerpo estructurado (titular, breakdown por corredor top 5, top 5 clientes, alertas del día, métricas operativas) + Excel adjunto con detalle.

**Preparación previa:** este correo debe estar ENVIADO antes de la cita. Nova con pipeline correo aún no ship — para el demo hacer el envío manual desde Nazre@ presentando el email como si Nova lo hubiera generado, o usar Loom prerecorded si prefieres.

**Cierre:** "Nova reemplaza el analista jr que arma el reporte diario. No se enferma, no rota, no toma vacaciones. Costo constante."

### M3 — Niva procesa KYB en 60 seg (chat, 6 min)

**Pitch:** "El bottleneck #1 en su promesa comercial 'activo en 24h': el KYB. Miren."

**Ejecución:** en el chat de Oficina de Niva (con Gerardo y Miguel viendo la pantalla), subir un ZIP con 4-5 PDFs ficticios (acta constitutiva, RFC, comprobante domicilio, opinión 32-D, poder legal) y escribir:
> "Niva, procesa el KYB de este nuevo lead. 'Comercializadora del Bajío SA de CV', importadora de refacciones de EEUU."

**Niva debe:** extraer datos de cada doc, validar coincidencia entre docs (RFC consistente, domicilio coincide), ejecutar check simulado OFAC + UIF + PLD, identificar BCFs, devolver reporte estructurado con ✓/🔴 + recomendación (aprobar / condicionar / escalar).

**Preparación previa:** tener el ZIP listo en el desktop, con datos que garanticen que Niva devuelve algo estructurado y correcto. Un dry run el sábado 12 para calibrar el KB.

**Cierre:** "40 min de un analista senior comprimidos a 60 segundos, con trazabilidad. Su time-to-activate baja de 24h prometido a 4-6h real."

## Escenarios GAC (20 min · 3 wow)

### G1 — Chase mensual multi-canal (chat + demo de correos, 6 min)

**Pitch:** "Miguel, tu junior pierde 3 días al mes chaseando docs. Mira."

**Ejecución:** en el chat de Oficina de Nara GAC, escribir:
> "Nara, dispara el chase mensual a los 6 clientes de demo. Necesitamos estados de cuenta bancarios de agosto, variables de nómina de la 2a quincena, y facturas fuera del SAT si tienen."

**Nara debe:** consultar directorio, generar y enviar 6 correos personalizados (cada uno con lista específica según servicios contratados), devolver confirmación al chat con scoreboard iniciado.

**Bonus si hay tiempo:** llamar en vivo al mismo número Vapi haciéndose pasar por Verónica Salgado ("ya te mandé el estado de cuenta, ¿me confirmas que llegó?") y ver a Nara actualizar el scoreboard.

**Preparación previa:** tener los 6 clientes ficticios en el directorio de GAC (creados como parte de sheets_mappings), con correos que apunten a inboxes tuyos para que veas los envíos reales.

**Cierre:** "El chase que consumía 3 días queda en 90 segundos. Y al día 3, Nara hace follow-up sola. Al día 5, escala. Tu junior deja de perseguir docs y empieza a hacer trabajo contable real."

### G2 — Reporte mensual traducido al dueño (chat, 6 min)

**Pitch:** "Y esto es lo que ningún despacho está haciendo, ni con Contalink ni con nadie. Tu diferenciador premium."

**Ejecución:** en el chat de Oficina de Niva GAC, subir un Excel con la balanza y estado de resultados de agosto de "Transportes Guerra Hermanos" (uno de los 6 clientes ficticios), y escribir:
> "Niva, prepara el reporte mensual traducido de Transportes Guerra Hermanos para agosto. Ricardo ya cerró la contabilidad."

**Niva debe:** leer la balanza, detectar variación más importante vs mes anterior, generar PDF 2 páginas — página 1 snapshot ejecutivo (ingresos, gastos, utilidad, comparativo mes/mes y año/año), página 2 insight en lenguaje de dueño ("tus utilidades bajaron 12% vs julio porque combustible subió $180K por el aumento del diesel y por los viajes extra a Nuevo Laredo"), pago SAT del mes con desglose, alertas, recomendaciones GAC, firmado por Miguel.

**Cómo se articula con Contalink en el pitch:** "Contalink te da la balanza. Niva te da el reporte que el cliente sí entiende y por el que sí paga premium."

**Preparación previa:** tener el Excel de balanza listo con datos coherentes (ver `gac-08-balance-transportes-guerra-ago2026.csv` para plantilla). Dry run para validar que Niva efectivamente detecta la variación deliberada.

**Cierre:** "Este es el reporte por el que un cliente promedio de despacho boutique acepta pagar $5K MXN/mes extra. Si el 20% de tus 65 clientes lo acepta = $75K MXN/mes de revenue nuevo sin más horas humanas."

### G3 — Semáforo pre-vencimiento SAT (chat + demo, 5 min)

**Pitch:** "El día 15-17 es tu peor día del mes. Mira cómo deja de serlo."

**Ejecución:** en el chat de Nara GAC, escribir (simulando que es 14 sept):
> "Nara, dame el semáforo de mis 6 clientes para el vencimiento del 17. Avisa a los que aún no han depositado el importe."

**Nara debe:** consultar status de cada cliente (desde el Sheet que armes, no Contalink):
- 🟢 Declaración lista + importe depositado
- 🟡 Declaración lista + importe pendiente
- 🔴 Declaración pendiente

Generar dashboard con los 6 clasificados, tomar los 🟡, enviar correo personalizado a cada uno con importe exacto + línea de captura + fecha límite, devolver confirmación de envíos.

**Preparación previa:** en el Sheet `custom_semaforo_sat` (crear ad-hoc para el demo) marcar deliberadamente 2 clientes 🟡 + 1 🔴 para que Nara tenga trabajo real que hacer.

**Cierre:** "En vez de tú manoseando 65 líneas de Excel el día 14, Nara ya tiene el semáforo y ya avisó a los amarillos. Tú solo revisas los rojos."

## Cierre comercial (10 min)

**Pitch de una línea para cerrar:**
> "GAC puede pasar de 65 a 90 clientes sin contratar a nadie más. Meefi puede triplicar volumen de operaciones sin sumar CSMs ni analistas. Mismo problema, mismo tipo de solución. Empezamos con el que quieran, o los dos en paralelo."

**Rango de precios sugerido (si preguntan):**
- Meefi: $35K-$50K MXN/mes por 3 empleados activos + setup $50-80K
- GAC: $25K-$35K MXN/mes por 3-4 empleados + setup $40-60K

**Piloto 30 días propuesto:**
- Meefi: Nara + Niva activos. Nova opcional fase 2.
- GAC: Nara + Niva activos (chase + reportes traducidos). Nala fase 2 cuando quede probado el arranque y decidamos si el volumen de nómina justifica adapter Contalink.

**Objeciones esperadas y respuestas:**

- *"¿Cómo se integra con Contalink?"* — "Contalink hace la parte fiscal y contable, muy bien. Centinelia hace la parte de coordinación con tus clientes (chase, avisos, reportes traducidos). No competimos con Contalink, nos coordinamos alrededor. Si más adelante quieres que escribamos directo en Contalink, hay API y podemos evaluarlo cliente por cliente."
- *"¿Y si mi cliente ya usa X sistema?"* — "Nara/Niva trabajan con lo que el cliente ya usa. Chase y reportes son sistema-agnósticos. Si eventualmente quieres integración profunda, la construimos por cliente cuando el ROI la justifique."
- *"¿Qué pasa si Nara/Niva dicen algo incorrecto?"* — "Cada respuesta queda en bitácora. Miguel/Gerardo revisan lo que quieran, ajustan el KB en el momento. En 2 semanas la calibración es cero fricción."

## Preparación pre-cita (checklist Nazre)

**Assets ya generados por Claude 2026-09-03** (los tienes listos en `demos/meefi-gac/`):
- `14-correo-nova-consolidado-DEMO.md` — subject + body + estructura Excel del correo M2
- `15-semaforo-sat-DEMO.csv` — 6 clientes GAC con estados 3-2-1 deliberados para G3
- `16-kyb-comercializadora-bajio-DEMO.md` — 5 textos KYB con flag deliberado (BCF ruso) + prompt + respuesta esperada de Niva
- `17-directorio-clientes-gac-DEMO.csv` — 6 clientes GAC con aliases de tu Gmail para ver envíos reales en G1

**Falta ejecutar (manual)**:
- [ ] Sep 5-8: convertir los 5 textos KYB del asset `16-*` a PDF (Google Docs → Download PDF), armar ZIP `kyb-bajio.zip`
- [ ] Sep 5-8: subir CSVs a Google Sheets + poblar `sheets_mappings` con los `spreadsheet_id`
  - `15-semaforo-sat` → purpose `custom_semaforo_sat`
  - `17-directorio-clientes-gac` → purpose `custom_directorio_clientes`
  - `gac-08-balance-transportes-guerra` → purpose `custom_balance_transportes_guerra`
  - `meefi-08-cartera-master` → purpose `custom_cartera_meefi` (para consulta Nara/Niva)
- [ ] Sep 5-8: armar Excel adjunto del correo Nova con la tabla de operaciones (contenido en asset `14-*`)
- [ ] Sep 5-8: crear 6 aliases o filtros en tu Gmail para recibir los correos del chase G1 (`nazre20+veronica@gmail.com`, etc.)
- [ ] Sep 12 (viernes): dry run completo de los 6 escenarios (M1-M3, G1-G3). Ajustar KBs en vivo si algo suena raro. Grabar Loom fallback de cada escenario mientras estás en el dry run.
- [ ] Sep 14 (domingo): confirmar cita con Gerardo. Preguntar si él o Miguel prefieren ver Meefi o GAC primero.
- [ ] Sep 15 · 7:30 AM: enviar manual el correo Nova desde tu Gmail firmando como Nova (contenido en asset `14-*`). Verificar que llegó a la bandeja de Gerardo/Daniel.
- [ ] Sep 15 mañana: llegada 15 min antes. Portable + hotspot + cable HDMI en la maleta. Un impreso de este guion en la carpeta.

## Contingencias

- **Sin internet en la sede:** Loom pregrabado de M1, M2, M3, G1, G2, G3 (grabar el 12 durante el dry run). Presentar el video + explicar en vivo.
- **Nara voz se cae:** cambiar a chat en pantalla, misma consulta. Todo lo demás sigue igual.
- **Alguien pregunta por precio antes de tiempo:** "Vamos primero a que vean el valor, cerramos con precio al final. En 20 min saben si les hace sentido."
- **Gerardo NO es co-founder / rol distinto al asumido:** ajustar "ustedes" a "tu equipo de operaciones" — el pitch funciona igual.
