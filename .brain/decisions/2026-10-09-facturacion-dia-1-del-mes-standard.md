---
name: 2026-10-09-facturacion-dia-1-del-mes-standard
description: Todos los clientes recurrentes y planes multi-mensualidad de Centinelia se facturan el día 1 del mes natural. Un solo ciclo mensual batcheable, alineado con mes fiscal SAT. Clientes legacy con otro día se re-anclan en la próxima factura con prorrateo o rotación de concepto.
type: decision
owner: nazre
decided_on: 2026-10-09
last_verified: 2026-10-09
---

# Decisión — Facturación recurrente el día 1 del mes natural

**Regla**: todo cobro mensual recurrente de Centinelia a clientes (operación de empleados digitales, mensualidades de implementación, suscripciones mensuales) se timbra el **día 1 del mes natural**. No cada 28, no quincena, no fecha de alta del cliente.

## Por qué

1. **Mental model del cliente**: "mes nuevo = pagar servicios". Igual que renta, Internet, Netflix. Cero fricción al cobrar.
2. **Batcheable**: una sola corrida de timbrado al mes. Automatizable con cron el día 1 (`/schedule 0 10 1 * *`).
3. **Alineado al mes fiscal SAT**: la declaración mensual del SAT es por mes natural. Timbrar entre día 1 y 5 del mes siguiente al periodo cubierto cae limpio en la declaración.
4. **Ventana completa de seguimiento**: si un cobro falla el día 1, hay 30 días para seguimiento en el mismo mes. Si cobras el 28, el mes ya terminó cuando detectas el impago.
5. **Simplicidad operativa a escala**: cuando pasemos de 3 a 30 clientes, un solo día de ejecución importa.

## Por qué NO quincena (día 15)

Duplica trabajo mensual sin beneficio hoy que son <10 clientes. Si crecemos a 50+ clientes y necesitamos distribuir carga, revisamos.

## Por qué NO último día del mes (28, 30, 31)

Ciclo irregular (febrero solo tiene 28). Rompe automatización. Y a fin de mes el cliente ya gastó el revenue mensual, mayor fricción de pago.

## Por qué NO fecha de alta de cada cliente

Microciclos distintos por cada cliente = overhead de ops lineal con cantidad de clientes. No escala.

## Cómo aplicar

### Para cliente nuevo
1. Al activarse, cobramos el pre-pago mensual el día de alta.
2. La **primera factura timbrada** es el día 1 del siguiente mes natural, cubriendo retroactivamente el periodo de alta hasta fin de ese mes anterior más el mes completo que arranca.
3. A partir de ahí: factura mensual limpia el día 1.

### Para cliente legacy anclado a otro día (ej. AC Proyectos originalmente al día 28)
- **Opción A (preferida)**: la próxima factura usa concepto "Mensualidad N — periodo mes de <mes natural>" y se timbra el día 1 del siguiente mes. Convence al cliente mostrando que el valor mensual se mantiene.
- **Opción B**: una factura prorrateada aislada que cierre el gap hasta el día 1, luego seguir con mes natural. Más confusa, usar solo si cliente objeta la opción A.

### Workflow mensual
- **Día 25-28 mes anterior**: recordatorio automático al contacto de finanzas de cada cliente (Tania en AC, Beatriz en Tortillería) con monto y fecha esperada de depósito.
- **Día 1**: timbrar PUE forma 03 al depósito confirmado. Si cliente no transfirió todavía: timbrar PPD y timbrar complemento de pago cuando caiga el depósito.
- **Día 5 cutoff**: si no pagó, escalar a llamada personal.

## Excepciones permitidas

- **Facturas de implementación / consultoría one-off** (Mes 1 de 4 de AC Proyectos fue 2026-09-28 por pre-pago): la fecha la marca el depósito. Pero las mensualidades 2-4 del mismo paquete se re-anclan al día 1 del mes natural.
- **Complementos de pago** (CFDI tipo P) se timbran al llegar el pago, no al día 1.
- **Facturas extraordinarias** (incrementos, servicios adicionales): día del cobro, no bloqueado al día 1.

## Alcance

- Aplica a: Centinelia emitiendo factura a cliente (nazre persona física o persona moral futura).
- No aplica a: Nala facturando CFDIs del cliente a sus clientes (ese cobro lo rige el cliente, no Centinelia).

## Referencias

- Memoria [[handoff-ac-arranque-mes1-2026-09-30]]: contexto del cobro 2026-09-28 que arranca el ciclo irregular de AC Proyectos.
- Memoria [[feedback-ac-contactos-camila-tania]]: Tania es contacto de finanzas para AC. Camila ops. No mezclar.
- Policy [[policy-no-tecnicismos-docs-clientes]]: el recordatorio del día 25-28 va sin jerga.
