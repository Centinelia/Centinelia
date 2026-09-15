# Video demo IPark — cómo grabarlo

Este folder contiene todo lo que necesitas para tener un video de 60-75 segundos listo para mandar a la asistente de Bichara.

## Contenido

- `demo.html` — slideshow autoplay con 8 frames (portada + 6 screenshots + cierre)
- `01-portal-home.png` a `06-pendientes-info-solicitada.png` — screenshots reales de la bandeja provisionada
- `preview-slide-*.png` — solo referencias visuales (borrar si molestan)

## Cómo grabar en 5 minutos

### Opción A — Loom (recomendado, 5 min)

1. Abrir Loom Desktop.
2. Ir a **modo "Screen only"** — sin cámara. El video queda enfocado en la pantalla, más profesional para mandar a alguien que no te conoce en persona.
3. En Chrome/Firefox, abrir `demo.html` en pantalla completa: `Cmd/Ctrl + O` → seleccionar el archivo → una vez cargado, `F11` para full-screen.
4. Click en Loom → "Start recording" → seleccionar la ventana del slideshow.
5. Espera 1 segundo, el slideshow arranca solo. **Deja correr los 65-70 segundos completos** sin tocar nada.
6. Al terminar la última slide (cierre "De 1,000 correos a 150 auditorías"), presiona el botón de detener en Loom.
7. Loom procesa. Copia el link privado.

**Duración total del slideshow:** aprox. 72 seg (6+7+9+10+10+11+10+9 seg cada slide).

### Opción B — con narración de voz (10 min)

Si quieres agregar TU voz explicando encima del slideshow:

1. Loom en modo "Screen + Cam" (o Screen only con mic).
2. Antes de grabar, practica leer el script de narración de abajo mientras miras el slideshow correr.
3. Grabas mientras el slideshow avanza automáticamente.
4. Tu voz refuerza lo que la persona ya está leyendo en pantalla. Máximo 2 versiones distintas del mismo punto — no más.

### Opción C — sin Loom, con OBS o QuickTime (7 min)

Cualquier grabador de pantalla funciona. Full-screen el slideshow, grabas, exportas MP4.

## Guión de narración opcional (si eliges Opción B)

Sigue el timing del slideshow. Cada bullet va con su slide correspondiente. **No tienes que decir todo — puedes callarte en algunos slides y dejar que se lean solos.**

**Slide 1 (Portada, 6 seg):**
> "Hola, soy Nazre de Centinelia. Este es un demo corto de lo que Nala haría por ustedes en IPark."

**Slide 2 (Portal, 7 seg):**
> "Todo pasa desde este portal. Un login, sin apps que instalar."

**Slide 3 (Bandeja overview, 9 seg):**
> "10 correos entraron. Fíjense qué hizo Nala: respondió 3 automáticamente, escaló 2, pidió info en 2, e ignoró 3 que no eran facturación."

**Slide 4 (Auto respondidos, 10 seg):**
> "Los tres autoservicio: Laura de Grupo Mex, Robert Chen que escribió en inglés, y TechMex pidiendo un re-envío. Nala timbró vía InvoiceOne, respondió con CFDI adjunto, cero intervención."

**Slide 5 (Laura expandida, 10 seg):**
> *(déjalo hablar solo o):* "Fíjense la firma: Facturación IPark, ni menciona IA ni Centinelia. Si algo saliera mal, ustedes tienen el botón de reportar, y Nala aprende del reporte."

**Slide 6 (Patricia escalada, 11 seg):**
> "Este caso Nala no lo resuelve sola. Patricia perdió su boleto y ya pasaron 6 semanas. Nala ya le respondió al cliente que va a revisar, y les deja el caso preparado para que ustedes decidan en 30 segundos."

**Slide 7 (Info solicitada, 10 seg):**
> "Cuando falta info, Nala pide exactamente lo que falta. No timbra a medias, no manda formularios largos."

**Slide 8 (Cierre, 9 seg):**
> "Su auxiliar contable pasa de responder mil correos al mes a auditar unos ciento cincuenta. Cuando quieran, agendamos siguiente paso."

## Cómo mandarlo

Correo a la asistente (después de grabar):

> Hola [nombre],
>
> Como comentamos, adjunto el demo corto de Nala (poco más de un minuto) y el resumen ejecutivo en PDF de una página.
>
> Cuando lo veas y quieran avanzar al siguiente paso, me marcas por aquí.
>
> Un abrazo,
> Nazre

Adjunto el PDF de propuesta descargándolo primero desde:
`GET /api/admin/demos/ipark/propuesta` (cookie admin activa)

## Editar los frames antes de grabar

Si quieres cambiar algún texto:

- **Título de una slide** → edita el `<h2 class="slide-title">` en `demo.html`
- **Narración** → edita el `<p class="slide-narration">` en `demo.html`
- **Duración por slide** → edita el atributo `data-duration="8000"` (milisegundos)
- **Screenshot** → cambia el `src` del `<img>`, o reemplaza el PNG con el mismo nombre

Después vuelve a abrir el HTML — cambios se ven al refresh.

## Regenerar screenshots (si actualizas la bandeja)

Los screenshots se tomaron el 2026-09-09 con la bandeja en el estado descrito en `handoff_ipark_demo_2026-09-09.md`. Si modificas los seed de `ops_inbox` (por ejemplo, cambias de estado el Correo #1), puedes:

1. Volver a abrir la bandeja en Chrome
2. Tomar screenshots manualmente y reemplazar los PNGs
3. O correr de nuevo el flujo automatizado (pídeme retomarlo)

## Detalles técnicos

- Slideshow es HTML puro, cero dependencias, corre 100% local. Solo requiere Chrome/Firefox/Safari.
- Screenshots son PNG 1440×900 (viewport estándar de laptop).
- Total del folder: ~2 MB. Cabe en cualquier correo.
- Si prefieres que el video sea MP4 en vez de Loom, exporta desde OBS/QuickTime a MP4 y lo compartes vía WeTransfer o Google Drive.
