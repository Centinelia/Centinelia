# Meefi — 6 escenarios wow para la cita del 15-sept

Estos escenarios se ejecutan en vivo (videollamada compartiendo pantalla o autoservicio en portal). Cada uno de 3-6 min. Total 25-35 min para cubrir los 6.

**Combo de empleados demostrados:** Nara (voz + chat) + Niva (chat) + Nova (chat + email si pipeline #1 cerrado).

**Frame para la cita:**
> "Ustedes venden a las importadoras 'tesorería global sin contratar treasurer'. Centinelia les vende a ustedes 'escalar operaciones sin escalar payroll'. Los mismos empleados que ya tienen infra propia (dashboard, KYB, tesorería) ahora tienen soporte 24/7, analista de compliance y motor de reporting a costo constante."

---

## Escenario 1 — Soporte transaccional 24/7 (Nara, voz)

**Objetivo:** demostrar que Nara resuelve consultas de status sin tocar humano y sin errores.

**Setup:** Miguel/Gerardo marca al número de Nara desde su celular haciéndose pasar por un cliente de Meefi (ej. dueño de Grupo Textiles del Norte).

**Guion sugerido para el prospecto:**
> "Habla Rogelio Salinas de Grupo Textiles del Norte. ¿Me pueden confirmar si ya salió el wire de $85,000 USD que ordené ayer para el proveedor en Mumbai?"

**Comportamiento esperado de Nara:**
- Reconoce al cliente por el número (si está en el directorio del demo)
- Consulta estatus vía tool
- Responde con: MT103 emitido, hora, banco corresponsal, ETA de acreditación, número de referencia
- Ofrece mandar comprobante por correo
- Registra ticket

**Wow para el prospecto:** dueño de fintech B2B sabe exactamente cuántas de estas consultas llegan a su equipo de noche y fin de semana. Ver a Nara resolverla con precisión bancaria = venta emocional inmediata.

---

## Escenario 2 — Consulta post-hora + escalamiento inteligente (Nara)

**Objetivo:** Nara reconoce cuándo escalar vs cuándo resolver.

**Setup:** simular una consulta de FX ambigua.

**Guion:**
> "Habla Alejandro Toledo de Electrónica Global Pacífico. Ayer me convirtieron $50K USD a CNY y el spread me salió más alto de lo que esperaba. ¿Por qué?"

**Comportamiento esperado:**
- Consulta la operación
- Si detecta que la diferencia es explicable (spot rate + spread transparente pre-confirmado), lo explica al cliente
- Si detecta algo raro (spread fuera de política, error de cálculo), NO improvisa: escala a tesorería (Roberto Alcalá) con contexto listo, y avisa al cliente "voy a validarlo con nuestro equipo de tesorería, en 30 minutos te confirmo"

**Wow:** Nara sabe cuándo NO responder. Es contra-intuitivo pero muy valioso — muestra madurez del sistema.

---

## Escenario 3 — KYB automatizado en 40 min vs 6 h manual (Niva, chat)

**Objetivo:** demostrar que Niva clasifica y valida expedientes KYB en minutos, reduciendo el bottleneck operativo #1 de Meefi.

**Setup:** en el chat de la Oficina de Niva, Miguel/Gerardo sube un ZIP simulando expediente de nuevo lead:
- Acta constitutiva ficticia PDF
- RFC PDF
- Comprobante domicilio PDF
- Opinión 32-D SAT PDF
- Poder representante legal PDF

**Prompt al Niva:**
> "Niva, procesa el KYB de este nuevo lead. Es 'Comercializadora del Bajío SA de CV', importadora de refacciones de EE.UU."

**Comportamiento esperado de Niva:**
- Extrae datos de cada documento (razón social, RFC, capital, objeto social, representante legal)
- Valida coincidencia entre docs (RFC consistente, domicilio coincide entre acta y comprobante)
- Ejecuta check simulado OFAC + UIF + listas PLD (representante legal + empresa + BCFs identificados)
- Identifica beneficiarios controladores finales (>25% capital) del acta
- Devuelve reporte estructurado con validaciones ✓/🔴 + recomendación (aprobar / condicionar / escalar)

**Wow:** 40 min de trabajo humano compreso a 60 segundos, con trazabilidad completa. Si sale algo raro (BCF en país sensible), Niva escala; no aprueba.

---

## Escenario 4 — Reporte diario matutino automatizado (Nova)

**Objetivo:** mostrar que Nova entrega el consolidado diario sin que nadie se lo pida, listo para el equipo directivo.

**Setup:** simular que es 8:00 AM del día 3 de septiembre. Nova ya procesó el día anterior.

**Ejecución:** Miguel/Gerardo abre su correo (el correo de demo) y ve un correo de Nova con asunto:
> "Meefi — Consolidado diario 2-sept — TPV $1.2M USD, 47 operaciones"

Adentro: cuerpo estructurado con TPV, breakdown por corredor, top 5 clientes, alertas del día, métricas operativas + Excel adjunto con detalle completo.

**Wow:** Daniel + Gerardo abren su bandeja a las 8:15 AM y tienen el pulso diario del negocio sin haber pedido nada. Es el analista jr que no se enferma, no toma vacaciones, no rota.

---

## Escenario 5 — Reconciliación con statement bancario + break detection (Nova, chat)

**Objetivo:** demostrar que Nova detecta discrepancias entre lo que Meefi ordenó y lo que confirma el banco corresponsal.

**Setup:** en el chat de Nova, Miguel/Gerardo sube un statement CSV ficticio de un banco corresponsal EEUU con 30 movimientos.

**Prompt:**
> "Nova, procesa este statement de JP Morgan Chase del 2-sept y reconcilia contra el ledger."

**Comportamiento esperado:**
- Extrae los 30 movimientos
- Cotejar contra las operaciones ordenadas por Meefi ese día
- Detectar 2-3 breaks deliberados:
  - MT103 ordenado que no aparece en statement (en tránsito, o rechazado)
  - Statement con crédito de $XXX sin operación en ledger (investigar)
  - Diferencia de $XXX en fees corresponsales vs esperado
- Devolver reporte con reconciliación + breaks flagged + Excel adjunto

**Wow:** este trabajo hoy consume 1-2 h/día de un analista. Nova lo hace en 60 seg y flagea EXACTAMENTE lo que amerita investigación humana.

---

## Escenario 6 — Reporte UIF/PLD mensual borrador (Niva + Nova, chat)

**Objetivo:** mostrar cómo Niva prepara el borrador del reporte UIF mensual para que el oficial de compliance humano solo revise y firme.

**Setup:** simular fin de mes.

**Prompt a Niva:**
> "Niva, prepara el borrador del reporte UIF de agosto. Necesito operaciones relevantes >$7,500 USD y cualquier patrón inusual."

**Comportamiento esperado:**
- Consulta operaciones del mes >$7,500 USD
- Filtra por cliente, corredor, patrón
- Detecta 2-3 casos de atención (cliente nuevo con volumen alto, mismo beneficiario recibiendo de múltiples clientes no relacionados, spike vs baseline)
- Devuelve resumen ejecutivo + Excel borrador formato UIF + recomendaciones por caso
- Marca casos que amerita elevación a Sofía Zambrano (oficial humano)

**Wow:** 1 día completo de trabajo regulatorio comprimido a 15 min de revisión final. Ahorro de tiempo + reducción de riesgo de omisión.

---

## Cierre de la cita

**Estimación de valor para Meefi (usar exactamente estas cifras):**
- Nara evita 2 CSMs jr adicionales durante crecimiento 3x: **~$1.4M MXN/año**
- Nova reemplaza analista jr: **~$420K MXN/año**
- Niva libera 20% del oficial de compliance senior: **~$300K MXN/año**
- **Total conservador: ~$2M MXN/año en payroll evitado + capacidad 3-5x de clientes sin crecer equipo**

**Precio Meefi objetivo:** Empresarial custom con cotización a la medida. Rango sugerido inicial: $35K-$50K MXN/mes por los 3 empleados activos (Nara + Niva + Nova) + setup $50-80K. ROI < 2 meses.

**Cierre de venta:** piloto 30 días con Nara + Niva activos (Nova opcional en fase 2 si prefieren empezar suave). Medir horas ahorradas y NPS interno del equipo Meefi.
