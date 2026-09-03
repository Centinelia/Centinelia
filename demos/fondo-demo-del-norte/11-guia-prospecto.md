# Bienvenido a Fondo Demo del Norte

**Estimado Gerardo,**

Este es un ambiente demo dedicado que armamos para que pueda ver cómo operarían empleados digitales especializados en una operación de fondeo institucional (SOFOM E.N.R. / banca de segundo piso). Los datos son ficticios pero coherentes: 7 intermediarios financieros ($525.3M de cartera), 4 empleados con roles distintos, un mes de operación simulada.

En su implementación productiva, la única diferencia es que los datos son los suyos reales. Todo lo demás — flujos, capacidades, KBs — es exactamente lo que tendría desde el día 1.

Aquí abajo tiene **6 escenarios sugeridos** para que pruebe. Puede hacerlos en cualquier orden y las veces que quiera durante los próximos días.

---

## Los 4 empleados que tiene disponibles

| Empleado | Rol | Canal | Qué hace |
|---|---|---|---|
| **Nara** | Coordinadora Operativa | Voz + Chat | Recibe llamadas de tesoreros de intermediarios: reportan envío de reporte mensual, solicitan ampliaciones, cambian datos. |
| **Nico** | Cobranza Institucional | Voz (outbound) + Chat | Llama a intermediarios con pagos próximos o vencidos. Nunca hostiga, siempre busca acuerdo ordenado. |
| **Nova** | Consolidación y Análisis | Chat + archivos | Recibe los Excel mensuales de intermediarios, extrae indicadores, actualiza la cartera maestra y devuelve reporte ejecutivo con adjunto. |
| **Niva** | Directora de Análisis | Chat | Arma reportes previos a comité, evalúa solicitudes de ampliación, hace análisis de exposición y simula escenarios. |

---

## Escenario 1 — Llamar a Nara como si fuera un tesorero

**Objetivo:** ver a Nara registrando un reporte mensual y confirmándole al tesorero.

**Cómo:**
1. Marque al número **[NÚMERO DE NARA]** desde su celular.
2. Preséntese como el tesorero de uno de los 7 intermediarios de la cartera. Sugerido: "Buenos días, soy [nombre] del área de tesorería de Financiera del Bajío. Le llamo para reportar que ya envié el reporte de agosto por correo."
3. Nara le va a pedir confirmación del intermediario, período y canal. Le va a dar un folio.
4. Al colgar, Nara deja registro del expediente. Puede consultarlo en el portal en la sección **Bandeja de reportes**.

**Variantes que puede probar:**
- Pedir ampliación del plazo (5 días o más).
- Pedir cambio de tesorero autorizado.
- Preguntar dudas sobre el formato de la plantilla.

---

## Escenario 2 — Subir un Excel de reporte y ver a Nova consolidar

**Objetivo:** ver a Nova procesando un reporte con formato heterogéneo y devolviendo un consolidado.

**Cómo:**
1. Entre al portal en **Oficina → Nova**.
2. En el chat, adjunte uno de los 3 Excel de prueba que están en el Drive del demo (o suba uno propio con datos ficticios).
3. Escriba: "Nova, aquí te mando el reporte de agosto de [intermediario]. Procesa y mándame el consolidado."
4. Nova responde en el chat con el resumen ejecutivo (3-6 puntos) y adjunta el Excel actualizado de la cartera maestra.

**Los 3 Excel de prueba tienen formatos distintos** — deliberadamente — para que vea cómo Nova normaliza:
- **UC Industrial NE**: formato simple, columnas planas.
- **SOFOM Agrofinanciera**: formato con hoja de resumen + detalle por bucket + segmentación por cultivo.
- **Cajas Solidarias del Golfo**: formato regulatorio SOFIPO Nivel 2, con calificación por bucket y reservas.

Cada uno demuestra un tipo distinto de reporte que llega en la realidad.

---

## Escenario 3 — Pedirle a Niva un reporte previo al comité de crédito

**Objetivo:** ver a Niva armando insumos analíticos para toma de decisión.

**Cómo:**
1. Entre a **Oficina → Niva** (chat).
2. Pida cualquiera de estos análisis:
   - "Arma el reporte previo al comité de crédito del jueves."
   - "Dame la exposición sectorial actual de la cartera."
   - "Evalúa la solicitud de ampliación de línea de UC Industrial NE por $30M."
   - "¿Cuál es el intermediario con mayor riesgo hoy y por qué?"
   - "Simula el efecto de reducir la línea de Agrofinanciera Occidente en $20M."
3. Niva devuelve el análisis en el chat + un PDF ejecutivo adjunto.

**Nota:** Niva NO aprueba nada. Da insumo. El comité decide.

---

## Escenario 4 — Ver a Nico haciendo cobranza a un intermediario moroso

**Objetivo:** ver el flow de cobranza institucional en vivo.

**Cómo:**
1. Entre a **Oficina → Nico** (chat).
2. Pida: "Nico, llama al tesorero de Unión de Crédito Empresarial del Sureste. Tienen el pago del 5 de septiembre pendiente y ya llevan 3 días vencidos."
3. Nico dispara una llamada de salida. Si quiere escucharla o participar, cambie el número del tesorero por el suyo (en el portal, sección **Directorio → Intermediarios → UC Empresarial SE → Editar teléfono**) y él le llamará a su celular.
4. Simule ser el tesorero. Pruebe distintos escenarios (ya se pagó / se paga hoy / problema temporal / problema mayor).
5. Nico registra el resultado y actualiza el expediente.

---

## Escenario 5 — Revisar la cartera maestra actualizada en el portal

**Objetivo:** ver la vista consolidada operativa del Fondo.

**Cómo:**
1. Entre a **Oficina → Cartera Maestra** (Google Sheet incrustado).
2. Verá los 7 intermediarios con: saldo insoluto, cartera vencida por bucket, aforo, IMOR, estatus interno.
3. Cada vez que un intermediario mande un reporte y Nova lo procese, la fila del intermediario se actualiza automáticamente.
4. La celda de totales se recalcula en tiempo real.

---

## Escenario 6 — Alerta proactiva de deterioro

**Objetivo:** ver el sistema de alertas cuando un intermediario cruza un umbral.

**Cómo:**
1. Suba el Excel de **SOFOM Agrofinanciera** (el archivo `08-reporte-agrofinanciera-agosto2026`).
2. Nova detecta que la morosidad de este intermediario está en 5.8% (arriba del umbral de 5%) y que subió 42 bps vs el mes anterior por caída del precio del aguacate.
3. Nova emite alerta 🟡 en la respuesta del chat y también manda notificación por WhatsApp al director de riesgos configurado en el directorio (si activa esta opción).
4. Puede pedir a Niva un análisis a fondo: "Niva, dame el análisis de Agrofinanciera Occidente y qué recomendarías al comité."

---

## Lo que NO va a funcionar todavía

Con transparencia:
- **Integración con su sistema real** (Excel maestros suyos, ERPs, portales bancarios) — se configura en la fase de implementación productiva. En este demo todo vive en un ambiente aislado.
- **Reportes regulatorios CNBV (R01, R04, R12, R13)** — puede pedir a Niva "arma un R04" y le va a devolver un formato próximo pero no el archivo exacto XSD. Ese trabajo se hace en fase productiva con su equipo regulatorio.
- **Timbrado fiscal de comprobantes** — no aplica aquí (usted no es emisor de CFDIs a los intermediarios en este flow).
- **KYC digital de intermediarios nuevos** — está en roadmap, no incluido en el demo.

Todo lo demás es funcional y refleja fielmente cómo se vería su operación real con Centinelia.

---

## Un par de notas importantes

- **Datos ficticios**: cualquier información que capture o pida se queda en este ambiente demo. Nada afecta a su operación real ni sale de aquí.
- **Costo**: no hay. Este ambiente está pre-cargado con un pool de minutos y tareas suficiente para su exploración durante estos días.
- **Cualquier duda o si algo no responde como esperaba**, mándeme un WhatsApp al [teléfono de Nazre] y lo revisamos en el momento. Su feedback nos sirve para tener el ambiente definitivo listo en su implementación real.

**Nos vemos el 15 de septiembre.**

Nazre
