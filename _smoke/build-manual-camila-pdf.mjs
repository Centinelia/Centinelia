// Genera el PDF "Manual de Nami para Camila" con brand Centinelia.
// Salida: C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/
//          Elementos/Inventarios/Muestra_para_Camila/Manual-Nami-para-Camila.pdf
//
// Uso: npx tsx _smoke/build-manual-camila-pdf.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const LOGO_PATH   = 'public/logo.png';
const OUT_DIR     = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Muestra_para_Camila';
const OUT_PDF     = path.join(OUT_DIR, 'Manual-Nami-para-Camila.pdf');

if (!fs.existsSync(LOGO_PATH)) { console.error('Falta logo:', LOGO_PATH); process.exit(1); }
if (!fs.existsSync(OUT_DIR))   { fs.mkdirSync(OUT_DIR, { recursive: true }); }

const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoBase64}`;

const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

const html = /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Manual de Nami para Camila</title>
<style>
  :root {
    --morado:   #6C3BFF;
    --dark:     #1A0A3B;
    --bg:       #FAFBFF;
    --soft:     #F0ECFF;
    --muted:    #5B4E78;
    --line:     #E6E0F5;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--dark); font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.5; orphans: 3; widows: 3; }
  .page { page-break-after: always; break-after: page; padding: 24mm 20mm; }
  .page:last-child { page-break-after: auto; break-after: auto; }

  /* Reglas duras: nada que no deba partirse se parte */
  h1, h2, h3 { page-break-after: avoid; break-after: avoid; page-break-inside: avoid; break-inside: avoid; }
  .dialog, .card, .cap, .ad-grid, .contacto, .limites, .cap-grid, ul, ol { page-break-inside: avoid; break-inside: avoid; }

  /* Bloques "titulo + contenido inmediato" como unidad */
  .block { page-break-inside: avoid; break-inside: avoid; margin-bottom: 6mm; }

  /* Portada */
  .cover { display: flex; flex-direction: column; justify-content: space-between; height: 257mm; padding: 24mm 20mm; background: linear-gradient(145deg, var(--bg) 0%, var(--soft) 100%); }
  .cover-logo { max-width: 180px; height: auto; margin-bottom: 12mm; }
  .cover-title { font-size: 42pt; font-weight: 700; color: var(--dark); margin: 0 0 8mm 0; line-height: 1.1; letter-spacing: -1.2px; }
  .cover-sub   { font-size: 16pt; color: var(--morado); font-weight: 500; margin-bottom: 20mm; }
  .cover-meta  { font-size: 11pt; color: var(--muted); border-top: 2px solid var(--morado); padding-top: 10mm; max-width: 70%; }
  .cover-meta strong { color: var(--dark); }

  /* Encabezados internos */
  h1 { font-size: 24pt; font-weight: 700; color: var(--dark); margin: 0 0 6mm 0; letter-spacing: -0.5px; }
  h2 { font-size: 15pt; font-weight: 600; color: var(--morado); margin: 10mm 0 3mm 0; letter-spacing: -0.2px; }
  h3 { font-size: 12pt; font-weight: 600; color: var(--dark); margin: 6mm 0 2mm 0; }

  p { margin: 0 0 3mm 0; }
  strong { color: var(--dark); font-weight: 600; }

  ul { margin: 0 0 4mm 0; padding-left: 18px; }
  li { margin-bottom: 2mm; }

  /* Diálogos */
  .dialog { background: var(--soft); border-left: 4px solid var(--morado); padding: 4mm 6mm; margin: 3mm 0 4mm 0; border-radius: 0 6px 6px 0; }
  .dialog .quien { font-size: 9pt; font-weight: 600; color: var(--morado); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1mm; }
  .dialog .texto { font-style: italic; color: var(--dark); font-size: 11pt; }

  /* Cards */
  .card { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 5mm 6mm; margin-bottom: 4mm; }
  .card-title { font-size: 11pt; font-weight: 600; color: var(--morado); margin-bottom: 2mm; }
  .card-body  { font-size: 10.5pt; color: var(--dark); }

  /* Lista de capacidades */
  .cap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 4mm; }
  .cap { background: white; border: 1px solid var(--line); border-radius: 6px; padding: 4mm 5mm; }
  .cap-h { font-weight: 600; color: var(--morado); font-size: 10.5pt; margin-bottom: 1mm; }
  .cap-b { font-size: 10pt; color: var(--muted); }

  /* Nota al pie */
  .pie { font-size: 9pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 3mm; margin-top: 10mm; }

  /* Lista de "qué NO hace" */
  .limites { background: #FFF9E6; border: 1px solid #F0D97A; border-radius: 6px; padding: 4mm 6mm; margin-top: 4mm; }
  .limites li { color: #665200; }

  /* Antes vs Después */
  .ad-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; margin-top: 4mm; }
  .ad-head { background: var(--dark); color: white; padding: 3mm 5mm; font-weight: 600; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px; }
  .ad-head.after { background: var(--morado); }
  .ad-row { display: contents; }
  .ad-row > div { padding: 4mm 5mm; border-top: 1px solid var(--line); font-size: 10pt; color: var(--dark); background: white; }
  .ad-row > div.ad-after { background: #FAF8FF; border-left: 1px solid var(--line); }
  .ad-row > div .step-num { display: inline-block; width: 5mm; color: var(--morado); font-weight: 600; }
  .ad-note { font-size: 9pt; color: var(--muted); font-style: italic; margin-top: 2mm; }

  /* Contacto */
  .contacto { background: var(--morado); color: white; border-radius: 8px; padding: 6mm 8mm; margin-top: 6mm; }
  .contacto h2 { color: white; margin-top: 0; }
  .contacto a { color: white; }
</style>
</head>
<body>

<!-- Portada -->
<div class="cover">
  <div>
    <img class="cover-logo" src="${logoDataUrl}" alt="Centinelia">
    <h1 class="cover-title">Manual de Nami<br>para Camila</h1>
    <div class="cover-sub">Tu empleada digital de inventarios</div>
  </div>
  <div class="cover-meta">
    <strong>AC Proyectos</strong> · ${today}<br>
    Preparado por Centinelia para que tengas una guía a la mano cuando empieces a trabajar con Nami.
  </div>
</div>

<!-- Pag 1: Qué es Nami -->
<div class="page">
  <h1>Qué hace Nami por ti</h1>
  <p>Nami es tu empleada digital de inventarios. Trabaja directo sobre tu Excel y te ayuda a mantenerlo al día sin que tengas que estar llenándolo tú línea por línea.</p>
  <p>Lo que haces hoy a mano con series, OCs, hojas de salida y el BACKLOG de TRANE, se lo platicas a Nami en tus palabras y ella lo captura por ti.</p>

  <h2>Cómo le hablas</h2>
  <p>Dos formas:</p>
  <ul>
    <li><strong>Chat del portal:</strong> abres tu portal de Centinelia y le escribes en el chat. Te contesta en segundos.</li>
    <li><strong>Correo:</strong> le reenvías correos (de Ana, Ángeles, Isabel, de ti misma) y los procesa ella sola. Tarda entre 30 y 60 segundos en responderte.</li>
  </ul>

  <h2>Lo que puede hacer hoy</h2>
  <div class="cap-grid">
    <div class="cap"><div class="cap-h">Buscar equipos</div><div class="cap-b">Por número de serie, por modelo, o por cliente.</div></div>
    <div class="cap"><div class="cap-h">Agregar equipos</div><div class="cap-b">Cuando llegan físicamente, con todos sus datos.</div></div>
    <div class="cap"><div class="cap-h">Asignar cliente</div><div class="cap-b">Cuando una chica de ventas te confirma pago.</div></div>
    <div class="cap"><div class="cap-h">Actualizar estatus</div><div class="cap-b">ALMACEN, SEPARADO, ENTREGADO, PENDIENTE.</div></div>
    <div class="cap"><div class="cap-h">Registrar hoja de salida</div><div class="cap-b">Varias series en una sola hoja de folio.</div></div>
    <div class="cap"><div class="cap-h">Registrar venta</div><div class="cap-b">Folio de factura, fecha, precio y factor.</div></div>
    <div class="cap"><div class="cap-h">Actualizar BACKLOG</div><div class="cap-b">Lee el PDF de TRANE y mantiene la hoja al día.</div></div>
    <div class="cap"><div class="cap-h">Correos a Isabel</div><div class="cap-b">Registrar OC o pedir entrega. Te muestra el borrador antes de mandar.</div></div>
  </div>
</div>

<!-- Pag 2a: Antes vs Después — OC + llegada de equipos -->
<div class="page">
  <h1>Tu día a día: antes vs ahora</h1>
  <p>Lado a lado, qué sigues haciendo tú y qué pasa a Nami. Las decisiones de negocio siguen siendo tuyas; lo que cambia es que ya no tienes que capturar en Excel.</p>

  <div class="block">
    <h2>Cuando una chica de ventas te pide equipos nuevos</h2>
    <div class="ad-grid">
      <div class="ad-head">Antes</div>
      <div class="ad-head after">Ahora</div>
      <div class="ad-row">
        <div><span class="step-num">1.</span> Entras a QuickBooks a hacer la OC.</div>
        <div class="ad-after"><span class="step-num">1.</span> Entras a QuickBooks a hacer la OC. <span style="color:var(--muted);">(sigues tú)</span></div>
      </div>
      <div class="ad-row">
        <div><span class="step-num">2.</span> Redactas correo a Isabel para que la registre.</div>
        <div class="ad-after"><span class="step-num">2.</span> Le dices a Nami el folio y los equipos. Ella arma el correo.</div>
      </div>
      <div class="ad-row">
        <div><span class="step-num">3.</span> Checas el BACKLOG hasta que Isabel la ingresó.</div>
        <div class="ad-after"><span class="step-num">3.</span> Nami actualiza el BACKLOG sola cada lunes, miércoles y viernes.</div>
      </div>
      <div class="ad-row">
        <div><span class="step-num">4.</span> Redactas otro correo a Isabel pidiendo entrega.</div>
        <div class="ad-after"><span class="step-num">4.</span> Le dices a Nami "pide la entrega". Arma el correo.</div>
      </div>
    </div>
  </div>

  <div class="block">
    <h2>Cuando llega la factura de TRANE con los equipos</h2>
    <div class="ad-grid">
      <div class="ad-head">Antes</div>
      <div class="ad-head after">Ahora</div>
      <div class="ad-row">
        <div><span class="step-num">5.</span> Abres la factura, lees cada equipo, capturas en Excel: OC, folio, tonelada, modelo, serie, USD, TC, costo. Repites por cada equipo.</div>
        <div class="ad-after"><span class="step-num">5.</span> Nami lee sola el XML de la factura y agrega todos los equipos al INVENTARIO.</div>
      </div>
    </div>
  </div>
</div>

<!-- Pag 2b: Antes vs Después — Venta -->
<div class="page">
  <h1>Antes vs ahora (continúa)</h1>
  <div class="block">
    <h2>Cuando una venta se cierra</h2>
    <div class="ad-grid">
      <div class="ad-head">Antes</div>
      <div class="ad-head after">Ahora</div>
      <div class="ad-row">
        <div><span class="step-num">6.</span> Chica avisa pago, llamas a Nino, Nino dicta serie, entras al Excel, buscas serie, pones cliente + vendedor + SEPARADO.</div>
        <div class="ad-after"><span class="step-num">6.</span> Chica avisa pago, llamas a Nino, Nino te dicta serie. Le dices a Nami "serie X asignada a Mauricio con vendedor ANA". <span style="color:var(--muted);">(Nino sigue separando físicamente)</span></div>
      </div>
      <div class="ad-row">
        <div><span class="step-num">7.</span> Cuando entregas, haces hoja de salida y marcas cada serie como ENTREGADO en Excel.</div>
        <div class="ad-after"><span class="step-num">7.</span> Le dices a Nami "ya salieron series X y Y en hoja folio 4251, cliente Mauricio, hoy".</div>
      </div>
      <div class="ad-row">
        <div><span class="step-num">8.</span> Ventas te manda folio de factura, entras a Solución Factible, buscas, sacas fecha + precio, calculas factor, capturas en Excel.</div>
        <div class="ad-after"><span class="step-num">8.</span> Ventas te manda folio + fecha + precio juntos. Le dices a Nami y ella captura todo.</div>
      </div>
    </div>
  </div>

  <div class="ad-note" style="margin-top: 8mm;">De 8 pasos, antes hacías los 8 completos. Ahora los pasos 1 y 6 (parte física con QuickBooks y con Nino) siguen siendo tuyos. Los otros 6 los hace Nami contigo platicándole en una frase.</div>
</div>

<!-- Pag 3: Ejemplos de cómo escribirle -->
<div class="page">
  <h1>Ejemplos de cómo platicarle</h1>
  <p>No tienes que usar palabras exactas. Nami entiende tu forma de hablar. Estos son solo ejemplos para que agarres la onda.</p>

  <div class="block">
    <h2>Asignarle un cliente a una serie</h2>
    <div class="dialog">
      <div class="quien">Tú le escribes</div>
      <div class="texto">"Mauricio Guerra pagó la serie 2422H8318A, ya puedes separarla."</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami te contesta</div>
      <div class="texto">"Listo, serie 2422H8318A asignada a Mauricio Guerra y marcada como SEPARADA."</div>
    </div>
  </div>

  <div class="block">
    <h2>Cambiarle el estatus a un equipo</h2>
    <div class="dialog">
      <div class="quien">Tú le escribes</div>
      <div class="texto">"La serie 2422H8393A ya pasó a pendiente de entregar."</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami te contesta</div>
      <div class="texto">"Listo, la serie 2422H8393A quedó marcada como PENDIENTE."</div>
    </div>
  </div>

</div>

<!-- Pag 5b: Más ejemplos (hoja de salida + venta) -->
<div class="page">
  <h1>Más ejemplos</h1>

  <div class="block">
    <h2>Registrar hoja de salida con varias series</h2>
    <div class="dialog">
      <div class="quien">Tú le escribes</div>
      <div class="texto">"Ya salieron las series 2422H8448A y 2414H5168A en la hoja folio 4251, cliente Mauricio Guerra, hoy."</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami te contesta</div>
      <div class="texto">"Listo, hoja de salida 4251 registrada con 2 equipos entregados a Mauricio Guerra."</div>
    </div>
  </div>

  <div class="block">
    <h2>Registrar una venta</h2>
    <div class="dialog">
      <div class="quien">Tú le escribes</div>
      <div class="texto">"Para la serie 2422H8394A: folio FV-A-2026-0442, fecha hoy, precio 35000, factor 1.4."</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami te contesta</div>
      <div class="texto">"Listo, venta registrada en serie 2422H8394A: folio FV-A-2026-0442, factor 1.4."</div>
    </div>
  </div>
</div>

<!-- Pag 3: Más ejemplos (correos a Isabel + BACKLOG) -->
<div class="page">
  <h1>Correos a Isabel de TRANE</h1>
  <p>Cuando necesites registrar una OC o pedir entrega, Nami te prepara el borrador. Lo revisas y si está bien le dices que lo mande.</p>

  <div class="block">
    <h2>Registrar una OC</h2>
    <div class="dialog">
      <div class="quien">Tú le escribes</div>
      <div class="texto">"Nami, acabo de hacer en QuickBooks la OC 7520 por 10 piezas de modelo 4TXK6548G1000AA y 5 del 4MXD6548G1000BA. Prepárame el correo a Isabel para que me la registre."</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami te contesta</div>
      <div class="texto">"Aquí está el borrador: para Isabel, asunto Registrar OC 7520. ¿Te lo mando?"</div>
    </div>
    <div class="dialog">
      <div class="quien">Tú</div>
      <div class="texto">"Sí Nami, mándalo."</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami</div>
      <div class="texto">"Listo, correo enviado a Isabel sobre la OC 7520."</div>
    </div>
  </div>

  <div class="block">
    <h2>Pedir entrega de una OC ya registrada</h2>
    <div class="dialog">
      <div class="quien">Tú le escribes</div>
      <div class="texto">"Nami, ya Isabel confirmó que tienen stock de la OC 7520. Prepárame el correo pidiendo la entrega para el 15 de octubre."</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami</div>
      <div class="texto">"Aquí tienes el borrador. ¿Te lo mando?"</div>
    </div>
  </div>
</div>

<!-- BACKLOG en su propia página para que no quede truncado -->
<div class="page">
  <h1>BACKLOG de TRANE automático</h1>
  <p>Lunes, miércoles y viernes, cuando llega el BACKLOG de TRANE por correo, Nami lo lee sola y actualiza tu hoja BACKLOG. No tienes que hacer nada.</p>
  <ul>
    <li>Si no cambió nada respecto a la última vez, te avisa que no cambió nada.</li>
    <li>Si TRANE agregó líneas, te dice cuántas se agregaron.</li>
    <li>Si TRANE quitó líneas, te dice cuántas se fueron.</li>
  </ul>
  <p>Las primeras dos semanas Nami te pregunta antes de actualizar la hoja. Después de eso, si todo salió bien, lo hace directo sin molestarte.</p>

  <div class="card" style="margin-top: 8mm;">
    <div class="card-title">Qué pasa el día del Meet</div>
    <div class="card-body">La primera vez que Nami actualiza tu BACKLOG, va a reemplazar las 47 líneas que tenías a mano con el formato nuevo (más completo, con fechas de registro y de entrega estimadas). Si en algún momento prefieres el formato viejo, tengo tu BACKLOG original guardado y lo regresamos en 2 minutos.</div>
  </div>
</div>

<!-- Pag 4: Qué NO hace + contacto -->
<div class="page">
  <h1>Qué no hace</h1>
  <p>Para que sepas qué sigue siendo tuyo:</p>
  <div class="limites">
    <ul>
      <li><strong>QuickBooks:</strong> crear la orden de compra ahí sigue siendo manual tuyo. Si en algún momento migran a QuickBooks Online, lo platicamos para automatizarlo.</li>
      <li><strong>Solución Factible:</strong> si las chicas te mandan folio + fecha + precio juntos, Nami captura directo. Si solo te mandan folio y tienes que buscar en el portal, ese lookup sigue siendo tuyo.</li>
      <li><strong>Separar los equipos físicamente:</strong> eso lo hace Nino en bodega. Nami captura el resultado cuando le platicas.</li>
      <li><strong>WhatsApp:</strong> Nami no lee WhatsApp. Si llega algo importante por ahí, me lo reenvías por correo y Nami lo procesa.</li>
    </ul>
  </div>

  <div class="block">
    <h2 style="margin-top: 8mm;">Dos semanas de confianza, luego ya es automático</h2>
    <p>Las primeras dos semanas, cuando le pidas que mande correo a Isabel, Nami te va a mostrar el borrador y te va a preguntar "¿te lo mando?" antes de hacerlo. Esto es para que agarres confianza en cómo redacta.</p>
    <p>Pasadas esas dos semanas, si todo salió bien, le quitamos esa pregunta y Nami manda directo. Si prefieres que siga preguntándote siempre, dímelo y se queda así.</p>
  </div>
</div>

<!-- Página final: Si algo sale raro + Contacto -->
<div class="page">
  <h1>Si algo sale raro</h1>
  <div class="card">
    <div class="card-title">Pasos a seguir</div>
    <div class="card-body">
      <ol style="margin: 2mm 0 0 0; padding-left: 18px;">
        <li>Toma captura de pantalla del chat de Nami.</li>
        <li>Anota la hora aproximada.</li>
        <li>Si tocó tu Excel, toma captura de la parte que quedó rara.</li>
        <li>Mándame todo por WhatsApp.</li>
      </ol>
      <p style="margin-top: 3mm;">Con eso puedo reconstruir qué pasó y arreglarlo. Nami lleva su propio registro de todo lo que escribe en tu Excel, así que podemos revisar cada cambio.</p>
    </div>
  </div>

  <div class="contacto">
    <h2>Contacto directo</h2>
    <p><strong>Nazre</strong> · Centinelia</p>
    <p>WhatsApp: te lo escribo por aparte si es la primera vez que lo necesitas.</p>
    <p>Correo: hola@centinelia.mx</p>
    <p style="margin-top: 4mm; font-size: 10pt; opacity: 0.9;">Las primeras dos semanas estoy atento. Cualquier cosa, por mínima que sea, dime. Mejor arreglarlo pronto que dejarlo pasar.</p>
  </div>

  <div class="pie">Manual preparado por Centinelia para AC Proyectos. ${today}.</div>
</div>

</body>
</html>`;

console.log('Rendering HTML to PDF with Playwright...');
const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: OUT_PDF,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
});
await browser.close();
console.log('✓ PDF generado:', OUT_PDF);
const stats = fs.statSync(OUT_PDF);
console.log(`  Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
