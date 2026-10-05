---
name: centinelia-brand-docs
description: "Generar PDFs oficiales de Centinelia para clientes (manuales, cotizaciones, one-pagers, decks). Define brand assets, CSS que respeta break-inside/break-after para que nunca se corten tablas o queden títulos huérfanos, playwright setup, copy rules, y checklist de verificación. Lecciones aprendidas de PDFs anteriores (Nami-cotizacion-inventarios, Manual-Nami-para-Camila, etc.)."
---

# Centinelia — PDFs oficiales para clientes

## Cuándo usar este skill

Siempre que generes un PDF que un cliente va a ver: manuales, cotizaciones, one-pagers, decks, case studies, instructivos post-venta, resúmenes ejecutivos.

**NO** usar para documentos internos (runbooks, notas de dev, memos a Nazre). Esos pueden ser Markdown crudo.

## Reglas duras que NO se discuten

### Copy (viene de [[feedback-no-tecnicismos-docs-clientes]] + reglas de Centinelia)

- **Sin em-dashes** (`—`). Usa `.`, `:`, `(…)` o rompe la frase.
- **Sin la palabra "IA"**. Hablamos de "empleado digital", "asistente", "Nami/Nelia/etc.".
- **Sin la palabra "agente"** salvo en SEO. Usa "empleado" o el nombre propio.
- **Sin emojis**. Usa iconos SVG inline si necesitas símbolos (Lucide-style).
- **Español completo** con acentos: `ñ á é í ó ú ¿ ¡`. Nunca ASCII plano.
- **Sin jerga técnica**: nada de "SQL", "endpoint", "deploy", "commit", "LLM", "parse", "dry_run", "replace mode", "schema", etc.
- **Reemplazos típicos** del cliente:
  - "SIP trunk" → "línea telefónica"
  - "milisegundos" → "al momento"
  - "parámetros" → "ajustes"
  - "serial number" → "número de serie"

### Logo (viene de [[feedback-logo-real-en-docs-cliente]])

- **SIEMPRE** usar `public/logo.png` (2000×600, el real).
- **NUNCA** generar badges de letra, placeholders tipo "C", logos pintados a mano, SVGs genéricos.
- Para embed inline, convertir a base64:
  ```js
  const logoBase64 = fs.readFileSync('public/logo.png').toString('base64');
  const logoDataUrl = `data:image/png;base64,${logoBase64}`;
  // <img src="${logoDataUrl}" alt="Centinelia">
  ```

## Brand tokens

```css
:root {
  --morado:   #6C3BFF;   /* color marca principal, acentos */
  --dark:     #1A0A3B;   /* titulos H1, texto fuerte */
  --bg:       #FAFBFF;   /* fondo pagina */
  --soft:     #F0ECFF;   /* fondo cards sutil, highlights lila */
  --muted:    #5B4E78;   /* texto secundario, pies de pagina */
  --line:     #E6E0F5;   /* bordes de cards y tablas */
}
```

Tipografía: `'Helvetica Neue', Arial, sans-serif` (system-safe).
- h1: 24pt bold, tracking -0.5px
- h2: 15pt semi-bold morado, tracking -0.2px
- h3: 12pt semi-bold dark
- body: 11pt, line-height 1.5

## Pagination CSS (lo más importante)

El 80% de las broncas con PDFs son tablas cortadas, títulos huérfanos, cards partidas por la mitad. Las reglas que SÍ funcionan en Chromium:

```css
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  orphans: 3; widows: 3;    /* texto no se parte en 1 línea aislada */
}

/* .page: cada sección principal como página forzada */
.page {
  page-break-after: always;
  break-after: page;
  padding: 24mm 20mm;
  /* NO forzar min-height; deja fluir el contenido natural */
}
.page:last-child { page-break-after: auto; break-after: auto; }

/* Titulos nunca huerfanos: break-after: avoid empuja al siguiente */
h1, h2, h3 {
  page-break-after:  avoid;  break-after:  avoid;
  page-break-inside: avoid;  break-inside: avoid;
}

/* Bloques indivisibles */
.dialog, .card, .cap, .ad-grid, .contacto, .limites,
.cap-grid, ul, ol {
  page-break-inside: avoid;
  break-inside:      avoid;
}

/* Wrapper "titulo + contenido inmediato" para que no se separen.
   Envuelve cada seccion H2+contenido en <div class="block">. */
.block {
  page-break-inside: avoid;
  break-inside:      avoid;
  margin-bottom: 6mm;
}
```

### Patrón `.block` obligatorio

Cuando tengas un `h2` seguido de contenido que debe quedar junto (una tabla, lista de bullets, un dialogo), envuélvelos:

```html
<div class="block">
  <h2>Cuando una chica te pide equipos</h2>
  <div class="ad-grid">...</div>
</div>
```

Si el `.block` no cabe en lo que queda de página, Chromium lo baja completo a la siguiente página. Zero cortes.

### Qué NO hacer

- **NO** usar `min-height: 257mm` en `.page`. Fuerza altura mínima incluso si el contenido es corto, generando páginas en blanco raras.
- **NO** usar `height: 100vh` en elementos internos. Afecta cálculo de break.
- **NO** meter contenido muy largo en una sola `.page`. Si una sección tiene >3 tablas, divídela en 2 páginas con otro `<div class="page">`.
- **NO** confiar en `page-break-before: auto` para que "resuelva" overflow. Resuelve mal.

## Setup Playwright

```js
import fs from 'node:fs';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path:            OUT_PDF,
  format:          'Letter',
  printBackground: true,                 // critico para backgrounds + colores
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
                                          // margins = 0 porque .page controla padding
});
await browser.close();
```

## Esqueleto HTML completo

Ver `template.html` en esta carpeta. Copia y edita el contenido.

## Checklist antes de entregar al cliente

1. **Abrir el PDF visualmente** (no confíes solo en que se generó).
2. **Verificar cada página**:
   - ¿Hay títulos solos al final de una página con el contenido en la siguiente? → Fallo. Agregar `.block` wrapper.
   - ¿Alguna tabla se parte a la mitad? → Fallo. Agregar `break-inside: avoid` a su contenedor.
   - ¿Hay 1 o 2 líneas de texto solitarias al inicio de una página? → Fallo. Ajustar `orphans: 3; widows: 3` o reorganizar.
   - ¿Alguna página queda casi vacía (>50% blanco) seguida de otra llena? → Fallo. Dividir mejor el contenido o permitir que fluya.
3. **Verificar copy**:
   - Buscar em-dashes `—`. Si hay, reemplazar.
   - Buscar la palabra "IA". Si hay, reemplazar por "Nami" / "empleado digital" / contexto.
   - Buscar emojis. Si hay, quitar.
   - Verificar que todos los acentos estén presentes (no ASCII plano).
4. **Verificar logo**:
   - El logo en portada es `public/logo.png`, no un placeholder.
   - El tamaño está balanceado (ni gigante ni microscópico, ~160-200px wide en portada).
5. **Verificar nombres**:
   - El nombre del cliente aparece correcto (Camila, no Tania; AC Proyectos, no AC HVAC).
   - La fecha es en español: "5 de octubre de 2026", no "10/5/2026".

## Lecciones de PDFs anteriores

- **Nami-cotizacion-inventarios.pdf (2026-09-02):** primera vez con brand. Em-dashes sí tenía originalmente, se corrigieron.
- **Manual-Nami-para-Camila.pdf (2026-10-02):** primera versión con 5 páginas. Tablas de "antes vs ahora" se partieron a la mitad y hubo títulos huérfanos. Fix 2026-10-05: `.block` wrappers + dividir "antes vs ahora" en 2 páginas + BACKLOG en página propia → 10 páginas limpias.
- **Factura 2026-09 Centinelia a AC Proyectos (folio 4):** usa plantilla CFDI distinta, no aplica estas reglas.

## Dónde guardar el PDF generado

- **Documentos AC Proyectos:** `C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/.../Muestra_para_Camila/`
- **Documentos Tortillería:** `C:/Users/Nazre/Dropbox/PC/Downloads/Tortillería Estrella X Centinelia/.../`
- **Pneuma Studio y otros:** carpeta Dropbox del cliente correspondiente.
- **Nunca** en el repo. Los scripts generadores sí van en `_smoke/build-*-pdf.mjs`.

## Script generador recomendado

Pattern: `_smoke/build-<nombre>-pdf.mjs`
- Importa `fs`, `path`, `chromium` de playwright.
- Lee logo real, convierte a base64 inline.
- Define `html` con el skeleton + contenido.
- Renderiza con playwright a PDF en la carpeta destino del cliente.
- Loggea el tamaño y path final.

## Referencias relacionadas

- [[feedback-no-tecnicismos-docs-clientes]]
- [[feedback-logo-real-en-docs-cliente]]
- [[feedback-no-em-dash]]
- [[feedback-no-ia-visible]]
- [[feedback-no-emojis]]
- [[feedback-espanol-completo]]
- [[project-centinelia-brand]] — brand tokens source of truth
