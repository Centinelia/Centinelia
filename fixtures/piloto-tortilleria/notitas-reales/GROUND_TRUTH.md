# Ground truth notitas reales tortillería Estrella

Fuente: fotos WhatsApp de Beatriz al 2026-09-03 19:54 (originalmente en
`Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/Notitas Tortillas Estrella/`).

## Formato preimpreso de todas las remisiones

Encabezado:
- Logo azul "Estrella" (estrella + palabra).
- Tel: 81-8327-3131.
- Email: facturacion@propoestrella.mx (visible en pantalla).
- Grid: CANT / DESCRIPCION / P.UNIT / IMPORTE.
- Columna CANT (izquierda) — manuscrita.
- Columna DESCRIPCION — preimpresa (fila por producto).
- Columna P.UNIT — preimpresa con el precio.
- Columna IMPORTE (derecha) — manuscrita (cantidad × p.unit).
- Fila TOTAL $ al final — manuscrita.
- REMISION (número folio) + FECHA arriba a la derecha.
- CLIENTE arriba a la izquierda — manuscrito, nombre de negocio o persona.
- FIRMA al pie — manuscrita.
- "RAMON OMAR LEAL GUTIERREZ" impreso al margen (dueño de la tortillería).

Productos preimpresos (catálogo fijo por notita):

| línea | Descripción                             | P.UNIT observado |
|-------|-----------------------------------------|------------------|
| 1     | PAQ TORTILLA MAIZ 1 KG                  | $27.00           |
| 2     | PAQ TORTILLA HARINA TACO 1 KG           | $27.00           |
| 3     | PAQ TORTILLA 500 GMS                    | $22.00           |
| 4     | PAQ TORTILLA ROJA                       | $22.00           |
| 5     | SALSA 500 GMS                           | $15.00           |
| 6     | FRIJOL COCIDO 500 GMS                   | $22.00           |
| 7     | PAQ 30 PZ ESTRELLADAS COMUN             | $12.00           |
| 8     | PAQ 30 PZ ESTRELLADAS EL PACK           | $23.00           |
| 9     | PAQ 30 PZ SIN MARCA                     | $12.00           |
| 10    | PAQ EXTRA SUPER DELGADITA               | $27.00           |
| 11    | PAQ EXTRA REGALO GALLETA                | $27.00           |

Precios extraídos con confianza media — algunas notitas los tienen tachados
o modificados a mano (Beatriz confirmará).

## Notitas identificadas (número folio único)

Las fotos son ángulos distintos del mismo stack de papel. Cuento **6 folios
únicos** distribuidos entre las 4 fotos.

### Notita #12828 (foto 01, foto 03)
- **Fecha:** 24 / 08 / 26 (24-agosto-2026).
- **Cliente:** CANTIL KOCHITL (?) — nombre manuscrito difícil, posiblemente
  nombre propio femenino tipo "Cantil" o "Kantli". Beatriz debe validar.
- **TOTAL:** ~$600 (letra "6??.??" apretada).
- **Anotaciones a mano:** "Slyer sto reyest" (algo) + "Recked $25" en el margen.
- **Confianza:** folio HIGH, fecha HIGH, cliente LOW, total MEDIUM.

### Notita #15701 (foto 01, foto 03)
- **Fecha:** 24 / 08 / 26.
- **Cliente:** OLIVIA (?) o similar; solo se ve una palabra. Podría ser SOLI,
  OLI, OLIVA. También "SABANA" al pie del cliente.
- **TOTAL:** $174.
- **Firma:** presente. También etiqueta "R34 2737" arriba (¿referencia interna?).
- **Confianza:** folio HIGH, fecha HIGH, cliente LOW, total HIGH.

### Notita #14104 (foto 01, foto 02, foto 03)
- **Fecha:** 24 / 08 / 26.
- **Cliente:** JORGE CABALLERO VALLEJO / VALLEBRA (?) — "Jorge Caballero"
  se lee razonable, el apellido siguiente es dudoso.
- **TOTAL:** $420 (letra "42?" con lápiz sobre pluma).
- **Marca "RECIBIDO":** sello grande.
- **Confianza:** folio HIGH, fecha HIGH, cliente MEDIUM, total MEDIUM.

### Notita #13653 (foto 02, foto 03)
- **Fecha:** 23 / 07 / 26 (23-julio-2026, más viejo que las demás).
- **Cliente:** OSCAR G. M-N (?) o similar; parece iniciales + apellido.
  Beatriz debe validar.
- **TOTAL:** $918 (?) — letra clara "978" o "918".
- **Marca "RECIBIDO":** con fecha "21 AGO 2026" al pie.
- **Confianza:** folio HIGH, fecha HIGH, cliente LOW, total MEDIUM.

### Notita #0053 (foto 04)
- **Fecha:** 24 / 08 / 26.
- **Cliente:** "BALLAS SUPERSTORE" (?) — cadena de 2-3 palabras difíciles.
- **TOTAL:** $486.
- **Confianza:** folio HIGH, fecha HIGH, cliente LOW, total HIGH.

### Notita #7158 (foto 04)
- **Fecha:** 24 / 08 / 26.
- **Cliente:** JOSCEPTPLO (?) o "JOSE CABALLERO" — muy parecido a #14104,
  posiblemente el mismo cliente en otra visita. También "24 oct 2026" al pie.
- **TOTAL:** $690 aproximado.
- **Marca "RECIBIDO":** con fecha "1 AGO 2026" al pie.
- **Confianza:** folio HIGH, fecha HIGH, cliente LOW, total MEDIUM.

## Realidad del pipeline vs este ground truth

Este ground truth se hizo por lectura visual manual de un LLM. Los campos
LOW/MEDIUM son la mejor apuesta pero pueden estar mal. **El punto del
smoke no es que Nala coincida con este GT — es ver si el LLM extrae los
campos con la misma confianza que yo, mejor, o peor**, y si los match a
catálogo funcionan aunque los nombres tengan typos.

Cuando Beatriz vea el análisis, ella puede corregir los campos LOW y
consolidarlos con su catálogo real de clientes y productos.

## Preguntas abiertas para Beatriz

1. **Catálogo de clientes**: ¿hay una lista con RFC + código CONTPAQi por
   cliente? El repartidor solo anota nombre; el matching cliente→RFC lo
   hace ella o su sistema. Nala necesita esa lista para armar el CFDI.
2. **Catálogo de productos**: ¿el catálogo preimpreso de la nota coincide
   con SKUs en CONTPAQi? Los adapter_ids que Nala usa para importar deben
   mapear a esos 11 renglones.
3. **Precios variables**: algunos precios están tachados o modificados a
   mano. ¿Cuál gana, el impreso o el manuscrito?
4. **Notitas repetidas**: ¿#14104 y #7158 son el mismo cliente? Aclarar
   convención de folios.
