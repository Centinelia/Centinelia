# Smoke Nala vision v2 — 4 notitas reales — 2026-09-03 (post-fix)

Re-corrida después de fixear los 5 gaps del smoke v1:
- G-Vision-1: shape multi-remisión (`ExtractedNoteSet.remisiones[]`).
- G-Vision-2: prompt distingue columna CANT manuscrita vs números del nombre.
- G-Vision-3: fuzzy matching con Levenshtein en `similarity()`.
- G-Vision-4: `folio_remision` estructurado.
- G-Vision-5: `precio_unitario` estructurado por línea.

Modelo: `claude-sonnet-4-6`. Tiempo por foto: 25-38 seg (subió porque
procesa múltiples remisiones ahora).

## Contadores por foto

| Foto | Remisiones GT | Detectadas v2 | Folios correctos | Cantidades leídas |
|------|---------------|---------------|------------------|-------------------|
| 01   | 3             | 3             | 3/3              | 1/33 líneas       |
| 02   | 2 (¿o 3?)     | 3             | 2/3              | 1/12 líneas       |
| 03   | 4             | 4             | 4/4              | 5/32 líneas       |
| 04   | 2             | 2             | 2/2              | 2/22 líneas       |
|**Total**|**~11**    |**12**         |**11/12**         |**9/99**          |

## Comparación cliente vs ground truth

| Folio  | Cliente GT              | Cliente Nala v2 (best de las fotos)    | Score fuzzy* |
|--------|-------------------------|----------------------------------------|--------------|
| 12828  | Cantil Xochitl          | "Cm212 Xochimilco" / "Xo Gallinita"    | ~0.55 consult |
| 15701  | Olivia / Sabana         | "Ortiz Sabina" / "Sabincel"            | ~0.5 consult  |
| 14104  | Jorge Caballero Vallejo | "Super Carnes Ortiz Valle Real"        | ~0.35 unknown |
| 13653  | Oscar G. M-N            | "Ortiz la Mela" / "Dania la Mela"      | ~0.3 unknown  |
| 0053   | Ballas Superstore       | "Bolaces Supremas"                      | ~0.55 consult |
| 7158   | -                       | "Juan Castillo"                         | -             |

*Score fuzzy con el nuevo `similarity()` (max de word-overlap + Levenshtein).
El bucket `consult` (0.5-0.75) fuerza reply al cliente pidiendo confirmación
+ `learnClientAlias` para futuros matches auto.

## Lo que quedó bien ✅

- Estructura multi-remisión funciona. La foto 03 con 4 apiladas → 4 folios.
- Folios correctos 11/12 (uno con corte visible: "5701" que probablemente era "15701").
- Fecha correcta en 11/12.
- Precios unitarios preimpresos: extraídos consistentemente ($27, $25).
- Cuando lee cantidad, es cantidad REAL (12, 26, 90 kg — típico mayorista),
  no confusión con número del nombre.
- Cliente en rango 0.5-0.75 dispara consult (correcto) — el flow de
  `reply_email` + `learnClientAlias` cerrará el gap tras 1-2 iteraciones humanas.

## Lo que sigue imperfecto ⚠

- **Cantidades manuscritas**: la mayoría siguen `null`. El modelo es
  conservador — prefiere marcar null a inventar. Es SAFER pero implica que
  muchas líneas de producto no se facturarían.
- **Nombres de cliente inconsistentes entre fotos del mismo folio**: e.g.
  folio 15701 aparece como "Ortiz Sabina" en foto 01, "Sabincel" en foto 03.
  El fuzzy no puede reconciliarlos automáticamente. Requiere que Beatriz
  confirme una vez y `learnClientAlias` fije la asociación.
- **Foto 02 sobre-detectó**: 3 remisiones vs 2 en GT. Probablemente
  incluyó una remisión cortada visible parcialmente.
- **Tiempo por foto**: 25-38s con multi-remisión. Aún cabe en el
  maxDuration=60s del portal handler.

## Decisión

**Estructuralmente los 5 gaps del smoke v1 están cerrados.** La precisión
de OCR real de cantidades sigue siendo el mayor riesgo — pero eso ya no
es gap de código, es tuning de prompt + posible upgrade a Opus vision +
few-shot con imágenes anotadas por Beatriz.

Recomendación operativa para el arranque con Beatriz:

1. **Modo con confirmación humana en portal**: Beatriz sube la foto, ve
   lo que Nala extrae en cada remisión (folio, cliente candidato, líneas
   con cantidad detectada), y confirma o edita antes de disparar el
   `submit_invoice_batch`.
2. **Cada confirmación entrena el sistema** vía `learnClientAlias` y
   (futuro) `learnProductQuantity` — la 5ta foto de Beatriz será
   sustancialmente mejor que la primera.
3. **Threshold decision**: para el primer mes, forzar todos los match
   con score < 0.9 al bucket "consult" (no "auto") para maximizar
   supervisión humana. Después bajar según error rate observado.

Este smoke v2 valida que la infra técnica del vision está lista;
la calibración fina viene con datos reales de Beatriz post-activación.
