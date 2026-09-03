# GAC — 6 escenarios wow para la cita del 15-sept

Estos escenarios se ejecutan en vivo (videollamada compartiendo pantalla o autoservicio en portal). Cada uno de 3-6 min. Total 25-35 min.

**Combo de empleados demostrados:** Nara (voz + chat coordinación) + Nala (chat facturista/timbradora) + Niva (chat reportes ejecutivos + análisis rentabilidad).

**Frame para la cita:**
> "Los despachos boutique en Monterrey pierden clientes porque no pueden crecer sin contratar más juniors. Y los buenos juniors escasean y rotan. Centinelia le permite a GAC pasar de 65 a 90 clientes sin contratar a nadie más. Miguel factura +50%, su equipo trabaja menos horas en captura y más en asesoría — donde realmente cobra caro."

---

## Escenario 1 — Chase mensual de documentación automatizado (Nara)

**Objetivo:** demostrar cómo Nara elimina los 3-5 días perdidos al mes chaseando docs a los clientes.

**Setup:** simular que es día 1 de septiembre. GAC necesita cerrar contabilidad de agosto.

**Prompt a Nara desde el chat:**
> "Nara, dispara el chase mensual a los 6 clientes. Necesitamos estados de cuenta bancarios de agosto, variables de nómina de la 2a quincena, y facturas fuera del SAT si tienen."

**Comportamiento esperado:**
- Nara consulta el directorio de los 6 clientes ficticios
- Genera y envía correos personalizados a cada contacto (Verónica Salgado, Juan Miguel Guerra, Julio César Martínez, Dra. Adriana Ceballos, Sofía Bermúdez, Patricia Villaseñor)
- Cada correo con lista específica de lo que falta según servicios contratados
- Devuelve confirmación al chat: "Enviados 6 correos. Scoreboard iniciado."

**Wow para Miguel:** el chase que consumía 3 días de un junior queda ejecutado en 90 segundos. Y al día 3, Nara automáticamente hará follow-up a quien no respondió, y al día 5 escalará al gerente correspondiente.

**Bonus:** llamar en vivo a Nara desde el celular haciéndose pasar por Verónica Salgado ("ya te mandé el estado de cuenta, ¿me confirmas que llegó?") y ver a Nara actualizar el scoreboard en tiempo real.

---

## Escenario 2 — Timbrado nómina quincenal simultáneo (Nala)

**Objetivo:** demostrar el "hero use case" que más horas consume en un despacho contable.

**Setup:** simular día 5 de septiembre (fin de quincena). Nala tiene que timbrar la nómina de 4 clientes.

**Prompt a Nala desde el chat:**
> "Nala, subo las variables de nómina de la 2a quincena de agosto de Distribuidora Sofía. Timbra y devuélveme el paquete."

Miguel/Gerardo sube un Excel con las variables (empleado, sueldo base, horas extra, faltas, comisiones, bonos).

**Comportamiento esperado de Nala:**
- Extrae las variables del Excel
- Cotejar contra template precargado
- **Detectar 1 alerta deliberada** (ej: horas extra desproporcionadas de un empleado o falta de un empleado sin captura previa)
- Pedir confirmación al cliente antes de timbrar
- Al confirmar, ejecutar timbrado en CONTPAQi Nóminas simulado
- Devolver paquete: XMLs + PDFs + acuse + resumen ejecutivo (bruto, ISR, IMSS trabajador/patrón, INFONAVIT, neto)

**Wow:** el trabajo repetitivo más masivo del despacho, ejecutado con verificación proactiva. Miguel sabe cuánto tiempo se pierde en esto.

---

## Escenario 3 — Ingesta masiva de XMLs recibidos y clasificación DIOT (Nova)

**Objetivo:** demostrar cómo Nova procesa cientos de facturas recibidas para dejar la contabilidad lista para captura.

**Setup:** Transportes Guerra Hermanos manda 500 XMLs de facturas recibidas del mes (mucho combustible + casetas + refacciones + servicios). Miguel/Gerardo sube un ZIP simulando esos XMLs.

**Prompt a Nova:**
> "Nova, procesa estos 500 XMLs de Transportes Guerra Hermanos de agosto. Clasifica para DIOT y devuélveme la tabla lista para captura."

**Comportamiento esperado:**
- Extrae datos de los XMLs (RFC emisor, subtotal, IVA, uso CFDI, concepto)
- Clasifica por tipo de operación DIOT (proveedor nacional/extranjero, tasa 16%/0%/exento)
- Detecta duplicados / anomalías (RFC de proveedor no válido, monto que no cuadra con orden de compra, etc.)
- Devuelve Excel con tabla lista para captura + hojas de resumen por tipo de operación + hoja de excepciones a revisar

**Wow:** 4-6 horas de trabajo comprimidas a 2 min. El contador senior solo revisa las excepciones flageadas.

---

## Escenario 4 — Reporte mensual traducido al cliente (Niva)

**Objetivo:** mostrar el diferencial que Niva le da a GAC: reportes que los clientes REALMENTE entienden.

**Setup:** cierre de agosto listo para el cliente Transportes Guerra Hermanos.

**Prompt a Niva:**
> "Niva, prepara el reporte mensual traducido de Transportes Guerra Hermanos para agosto. Ricardo ya cerró la contabilidad."

**Comportamiento esperado:**
- Consulta la balanza y estado de resultados de CONTPAQi (simulado)
- Detecta la variación más importante vs mes anterior
- Genera reporte de 2 páginas:
  - Página 1: snapshot ejecutivo con ingresos, gastos, utilidad, comparativo mes/mes y año/año
  - Página 2: insight en lenguaje de dueño ("tus utilidades bajaron 12% vs julio porque combustible subió $180K por el aumento del diesel en agosto y por los viajes extra que hiciste a Nuevo Laredo"), pago SAT del mes con desglose, alertas de atención, recomendaciones GAC
- Genera PDF con branding GAC firmado por Miguel
- Devuelve archivo listo para enviar al cliente

**Wow:** esto es lo que los despachos regulares NO hacen. La mayoría manda solo la balanza cruda. GAC + Niva = diferenciador premium que justifica cobrar más.

---

## Escenario 5 — Análisis de rentabilidad interno del despacho (Niva)

**Objetivo:** demostrar que Niva ayuda a Miguel a dirigir el despacho con data.

**Prompt a Niva:**
> "Niva, dame la rentabilidad de mis 6 clientes principales. Quiero saber quién me deja más margen y quién me está saliendo caro."

**Comportamiento esperado:**
- Consulta revenue de honorarios × cliente / mes
- Consulta horas cargadas por cliente por el equipo
- Calcula margen = revenue - (horas × tarifa promedio)
- Devuelve tabla ordenada + insight:
  - Top rentable: Grupo Restaurantero Barra Cinco ($65K rev, margen 68%)
  - Menor margen: Clínica Ceballos ($12K rev, margen 32% — sobre-servicio vs pack contratado)
  - Alerta: Constructora Almar tiene honorarios pendientes 45 días
- Recomendaciones: renegociar scope de Ceballos, cobrar Constructora esta semana

**Wow:** Miguel deja de dirigir por intuición y empieza a dirigir por data.

---

## Escenario 6 — Alerta pre-vencimiento SAT con dashboard semáforo (Nara + Nala)

**Objetivo:** demostrar la coordinación día 15-17 que hoy es el infierno del mes.

**Setup:** simular que es 14 de septiembre. Vencen pagos SAT el día 17.

**Prompt:**
> "Nala, dame el semáforo de mis 6 clientes para el vencimiento del 17. Nara, avisa a los que aún no han depositado el importe."

**Comportamiento esperado:**
- **Nala** consulta status de cada cliente:
  - 🟢 Declaración lista + importe depositado
  - 🟡 Declaración lista + importe pendiente
  - 🔴 Declaración pendiente
- Genera dashboard con los 6 clientes clasificados
- **Nara** toma la lista de 🟡, envía correo personalizado a cada uno con importe exacto + línea de captura + fecha límite
- Devuelve confirmación de envíos a Miguel

**Wow:** el día 15-17 dejó de ser infernal. Miguel abre el dashboard, ve la vista consolidada, y confía en que Nara ya está avisando a los pendientes.

---

## Cierre de la cita

**Estimación de valor para GAC:**
- Chase mensual (Nara): elimina 3 días/mes de un junior = 36 días/año = $180K MXN/año
- Timbrado nómina simultáneo (Nala): ahorra 8 h/quincena = 192 h/año × $500 = $96K MXN/año
- Ingesta XMLs + DIOT (Nova): 5 h × 12 meses × 6 clientes con volumen alto = 360 h/año × $500 = $180K MXN/año
- Reportes ejecutivos traducidos (Niva): diferenciador premium → 20% de clientes acepta upsell de $5K/mes = $75K MXN/año extra revenue
- **Ganancia neta año 1: ~$450K MXN + capacidad para crecer 30% sin contratar (~30 clientes adicionales × $30K promedio = $10.8M MXN de revenue nuevo posible)**

**Precio GAC objetivo:** Empresarial custom. Rango sugerido: $25K-$35K MXN/mes por los 4 empleados + setup $40-60K. ROI < 3 meses (solo por el ahorro de payroll).

**Pitch de una línea para Miguel:**
> "GAC puede pasar de 65 a 90 clientes sin contratar a nadie más. Facturas +50%, tu equipo trabaja menos horas en captura y más en asesoría."

**Cierre de venta:** piloto 30 días con Nara + Nala activos (chase + timbrado nómina). Nova y Niva en fase 2 cuando quede probado el arranque. Medir: horas ahorradas del equipo + capacidad de tomar clientes adicionales.
