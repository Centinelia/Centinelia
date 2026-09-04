# Smoke Nala vision — 4 notitas reales de Beatriz — 2026-09-03

Corrida con `scripts/smoke-nala-vision-notitas.ts` contra
`extractNoteFromImage` (mismo pipeline que usa Nala en prod).

Modelo: `claude-sonnet-4-6`. Tiempo por foto: 14-17 seg. Ninguna llamada
crasheó — el pipeline funciona técnicamente.

## Ground truth vs Nala output

| Foto | Folio real | Cliente GT              | Cliente Nala          | Fecha GT   | Fecha Nala | Total GT | Total Nala |
|------|-----------|--------------------------|-----------------------|------------|------------|----------|-----------|
| 01   | 12828     | Cantil Xochitl (?)      | Cmti Xochimilco       | 24-08-2026 | 2026-08-24 | ~$600    | $520      |
| 02   | 14104     | Jorge Caballero Vallejo | Carnes Ortiz Valle Real | 24-08-2026 | 2026-08-24 | $420     | $450      |
| 03   | (varias)  | (mismo stack que 01+02) | Ortiz Xo Gallinico    | 24-08-2026 | 2026-08-24 | -        | $520      |
| 04   | 0053      | Ballas Superstore (?)   | Bolaces Supremes      | 24-08-2026 | 2026-08-24 | $486     | $486      |

## Lo que funciona ✅

- **Fecha**: 4/4 aciertos, ISO 2026-08-24.
- **Formato reconocido**: identifica encabezado Estrella + grid CANT/DESCRIPCION/P.UNIT/IMPORTE.
- **Monto total**: precisión razonable (foto 04 exacta $486, foto 02 cerca $420→$450).
- **Fallback graceful**: cuando no puede leer, devuelve null en vez de crashear.
- **Confianza self-reported**: consistente (~0.5-0.6 global), útil para gates.

## Gaps críticos ❌ (bloqueadores para Beatriz)

### G-Vision-1: fotos con múltiples remisiones se procesan como UNA sola
El prompt asume 1 foto = 1 notita. Las fotos de Beatriz tienen 2-4
remisiones apiladas. Nala solo extrae la primera o mezcla campos entre
notitas. **Riesgo**: pierde 50-75% de las ventas del día si los repartidores
mandan foto grupal (que es lo natural en WhatsApp).

**Fix**: modificar `EXTRACT_NOTE_SYSTEM` para devolver `remisiones: [...]`
en vez de campos flat. O documentar que el prompt requiere 1 foto por
notita y ajustar el flujo email/WhatsApp para hacer split.

### G-Vision-2: cantidades manuscritas no se leen
La mayoría de líneas de producto tienen `cantidad: null`. Cuando Nala
detecta un número, se confunde: reporta `10 pza × PAQ 30 PZ ESTRELLADAS`
porque interpreta el `30` del NOMBRE del producto como cantidad.

**Fix**: prompt debe enseñar que la columna CANT (izquierda) es lo
manuscrito, distinto del número dentro del nombre del producto.

### G-Vision-3: nombre de cliente inconsistente entre fotos del mismo cliente
La misma remisión #14104 aparece como "Jorge Caballero" (GT) / "Carnes
Ortiz Valle Real" (foto 02) / "Ortiz Xo Gallinico" (foto 03). Nala está
adivinando por parcial y no coincide entre ángulos.

**Fix**: matching fuzzy contra catálogo de clientes en `getClientByRFC` /
`match_client`. Aunque Nala lea "Bolaces Supremes", si el catálogo tiene
"Ballas Superstore" cerca, debería resolverlo. Verificar `MockBillingAdapter`
usa Levenshtein u otra fuzzy.

### G-Vision-4: folio (número de remisión) no se estructura
El número #12828 va a `notas_raw` pero NO a un campo `folio_remision`
propio. Beatriz necesita ese número para cross-reference con sus registros
internos.

**Fix**: agregar `folio_remision: string | null` al `ExtractedNote` y
al prompt.

### G-Vision-5: p.unit preimpreso no se captura
Cada línea del catálogo tiene precio preimpreso ($27, $22, $15, etc.).
Nala solo devuelve `nombre` y `cantidad` de cada producto — pierde el
precio unitario que es dato clave para calcular el importe de línea.

**Fix**: agregar `precio_unitario: number | null` a `ExtractedProduct`.

## Recomendación

**No instalar en Beatriz aún.** El pipeline técnico funciona (writer,
consumer, retries, audit, lock, ...) pero el eslabón vision necesita
2-3 sesiones de iteración de prompt + posible refactor del shape para
manejar múltiples remisiones antes de que sea seguro dejar que Nala
factura sin supervisión humana.

**Alternativa intermedia:** activar el pipeline en modo "sugerencia" —
Nala procesa, produce un draft, pero Beatriz confirma antes de mandar
`submit_invoice_batch`. Requiere UI de aprobación en portal.

## Siguientes pasos priorizados

1. Fix G-Vision-1 (múltiples remisiones) — sin esto, el volumen real no cabe.
2. Fix G-Vision-4+5 (folio + precio unitario) — datos estructurados
   completos con muy poco cambio.
3. Fix G-Vision-2 (cantidades manuscritas) — el eje más difícil,
   posiblemente requiera vision model más potente o ejemplos few-shot.
4. Fix G-Vision-3 (matching fuzzy) — probablemente ya lo hace `match_client`,
   verificar tolerancia. Si no, integrar Levenshtein en el matching.

Cuando Beatriz vea este análisis, puede validar los ground truths que
marcamos LOW/MEDIUM y sumar contexto para los prompts (nombres reales
de clientes, catálogo de productos con SKUs, precios vigentes).
