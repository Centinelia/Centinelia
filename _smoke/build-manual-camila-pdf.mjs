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
    <div class="cap"><div class="cap-h">Responderte sobre tu inventario</div><div class="cap-b">Pregúntale cómo va una OC, qué pasa con una factura, cuánto vale el inventario, qué está pendiente de llegar.</div></div>
    <div class="cap"><div class="cap-h">Buscar equipos</div><div class="cap-b">Por número de serie, por modelo, o por cliente.</div></div>
    <div class="cap"><div class="cap-h">Agregar equipos</div><div class="cap-b">Cuando llegan físicamente, con todos sus datos.</div></div>
    <div class="cap"><div class="cap-h">Asignar cliente</div><div class="cap-b">Cuando una chica de ventas te confirma pago.</div></div>
    <div class="cap"><div class="cap-h">Actualizar estatus</div><div class="cap-b">ALMACEN, SEPARADO, ENTREGADO, PENDIENTE.</div></div>
    <div class="cap"><div class="cap-h">Registrar hoja de salida</div><div class="cap-b">Varias series en una sola hoja de folio.</div></div>
    <div class="cap"><div class="cap-h">Registrar venta</div><div class="cap-b">Folio de factura, fecha, precio y factor.</div></div>
    <div class="cap"><div class="cap-h">Actualizar BACKLOG</div><div class="cap-b">Lee el PDF de TRANE y mantiene la hoja al día.</div></div>
    <div class="cap"><div class="cap-h">Correos a Isabel</div><div class="cap-b">Registrar OC o pedir entrega. Te muestra el borrador antes de mandar.</div></div>
    <div class="cap"><div class="cap-h">Acordarse de lo que hizo</div><div class="cap-b">Pregúntale "¿qué procesaste esta semana?" o "¿cómo te fue con la OC X que te mandé?" y ella consulta su propio registro.</div></div>
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
    <p style="margin-top: 2mm; font-size: 10pt; color: var(--muted);">Por ahora le dictas el factor. Cuando tengamos conectada tu hoja STOCK (próximas semanas), Nami lo calculará sola a partir del precio y el costo que ya tiene registrado — tú solo le dirás folio, fecha y precio.</p>
  </div>
</div>

<!-- Pag nueva: Pregúntale cualquier cosa sobre tu inventario -->
<div class="page">
  <h1>Pregúntale cualquier cosa sobre tu inventario</h1>
  <p>Nami lleva registro de todo lo que escribe en tu Excel y conoce el estado de cada equipo. Nunca inventa; siempre consulta antes de responder. Si no sabe algo, te lo dice derecho.</p>

  <div class="block">
    <h2>Cómo va una OC específica</h2>
    <div class="dialog">
      <div class="quien">Tú le escribes</div>
      <div class="texto">"¿Cómo va la OC 5624?"</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami te contesta</div>
      <div class="texto">"La OC 5624 tiene 5 equipos: 3 en ALMACEN, 1 SEPARADO para Mauricio, 1 ENTREGADO. Los 5 ya tienen TC aplicado."</div>
    </div>
  </div>

  <div class="block">
    <h2>Qué pasó con una factura TRANE</h2>
    <div class="dialog">
      <div class="quien">Tú</div>
      <div class="texto">"¿Ya pagamos la factura TRANE 80099999?"</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami</div>
      <div class="texto">"Sí, factura 80099999 pagada. 4 equipos, total USD $25,772, total MX $476,774. TC aplicado a los 4."</div>
    </div>
  </div>

  <div class="block">
    <h2>Resumen general del inventario</h2>
    <div class="dialog">
      <div class="quien">Tú</div>
      <div class="texto">"¿Cómo va el inventario?"</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami</div>
      <div class="texto">"5,333 equipos en total. 708 en almacén, 182 separados, 4,329 entregados. Valor total MX $60.4 millones."</div>
    </div>
  </div>

  <div class="block">
    <h2>Qué hizo Nami esta semana</h2>
    <div class="dialog">
      <div class="quien">Tú</div>
      <div class="texto">"¿Qué correos procesaste esta semana?"</div>
    </div>
    <div class="dialog">
      <div class="quien">Nami</div>
      <div class="texto">"Esta semana ejecuté 23 acciones: 3 OCs nuevas, 2 facturas TRANE, 5 series actualizadas a ALMACEN, 1 hoja de salida con 6 equipos, 1 factura de venta SF."</div>
    </div>
  </div>
</div>

<!-- Pag: Correo vs Chat (política de canales) -->
<div class="page">
  <h1>Correo o chat, cuándo cada uno</h1>
  <p>Nami funciona en dos canales. Cada uno sirve para cosas distintas.</p>

  <div class="block">
    <h2>Correo (para procesar documentos)</h2>
    <p>Si tienes un documento (PDF o XML), mándalo por correo. El inbox-processor de Nami lo lee, extrae lo importante, lo captura en tu Excel y archiva el correo. Los 5 tipos de documento que Nami procesa son:</p>
    <ul>
      <li><strong>OC de QuickBooks</strong> (PDF): la que tú creas y le reenvías.</li>
      <li><strong>Factura TRANE</strong> (XML CFDI): la que llega del proveedor.</li>
      <li><strong>Hoja de salida</strong> (texto o PDF): cuando entregas equipos al cliente.</li>
      <li><strong>Factura de venta de AC a cliente</strong> (XML CFDI de Solución Factible).</li>
      <li><strong>PDF del BACKLOG mensual de TRANE</strong>: los miércoles y viernes.</li>
    </ul>
  </div>

  <div class="block">
    <h2>Chat del portal (para preguntas y correcciones)</h2>
    <p>Si quieres preguntar algo o hacer un cambio puntual, chat. Casos típicos:</p>
    <ul>
      <li>Preguntar algo sobre el inventario (ejemplos en la página anterior).</li>
      <li>Correcciones rápidas: "la serie X ya salió", "cambia el cliente de Y a Z", "pon la familia MANEJADORA al modelo W".</li>
      <li>Pegar directo el XML de una factura (si lo tienes copiado al portapapeles).</li>
      <li>Dictarle una OC en texto: "procesa esta OC: P.O. 7520, fecha 2026-10-15, 10 piezas de 4TXK a $5,716 y 5 de 4MXD a $7,169."</li>
    </ul>
    <p style="margin-top: 3mm;"><strong>Hoy el chat no tiene botón de subir archivo</strong>. Si tienes un PDF que mandar, va por correo. Pronto le vamos a agregar esa opción al chat.</p>
  </div>

  <div class="card" style="margin-top: 6mm;">
    <div class="card-title">Qué NO hace Nami en chat</div>
    <div class="card-body">No contesta cordialidades, "gracias", "ya quedó". Si le mandas correos random (publicidad, newsletters, propaganda), los archiva sin responder. Esto es para que no gaste su atención en cosas que no son del inventario.</div>
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
  <p>Miércoles y viernes, cuando llega el BACKLOG de TRANE por correo, Nami lo lee sola y actualiza tu hoja. Si TRANE lo manda otro día (lunes o jueves), Nami lo archiva pero no procesa hasta el siguiente miércoles o viernes. Esto es por tu petición, así no estamos haciendo cambios al BACKLOG todos los días.</p>

  <div class="card" style="margin-top: 6mm;">
    <div class="card-title">Importante: Nami nunca borra sin pedírtelo</div>
    <div class="card-body">Cuando llega un BACKLOG nuevo, Nami lo compara con el que tienes y sólo <strong>agrega lo nuevo y actualiza lo que cambió</strong>. Si en el PDF nuevo falta una línea que tenías, Nami la deja ahí (no la borra). Si prefieres que un día le des limpieza completa, le dices "Nami, limpia el BACKLOG y pon sólo lo que trae el PDF nuevo" y ahí sí te lo deja de cero.</div>
  </div>

  <div class="block">
    <h2>Cómo quedó tu hoja hoy</h2>
    <p>Tu BACKLOG tiene 12 columnas con toda la información que trae TRANE:</p>
    <ul>
      <li><strong>CUSTOMER PO NUMBER</strong>: tu número de OC.</li>
      <li><strong>ORDER NUMBER</strong>: el folio TRANE del lado de ellos.</li>
      <li><strong>ORDERED DATE</strong>: cuándo entró la orden a su sistema.</li>
      <li><strong>LINE NUMBER</strong>: cada equipo de la OC con su número de línea (1.1, 2.1, 3.1…).</li>
      <li><strong>ITEM, LINES STATUS, QUANTITY</strong>: modelo, estatus (AWAITING_SHIPPING, AWAITING_SUPPLY, etc.) y cantidad.</li>
      <li><strong>SCHEDULE SHIP DATE</strong>: fecha estimada de entrega.</li>
      <li><strong>BACKLOG USD y RESERVED</strong>: el monto en dólares y cuántos están reservados.</li>
      <li><strong>ACCOUNT MANAGER</strong>: quién de TRANE lleva tu cuenta.</li>
    </ul>
  </div>

  <div class="block">
    <h2>Cómo sabes que Nami ya hizo el update</h2>
    <p>Cada vez que procesa un BACKLOG, Nami te manda un correo corto con el resumen. Algo así:</p>
    <div class="dialog">
      <div class="quien">Nami te escribe</div>
      <div class="texto">"Listo Camila, procesé el BACKLOG de TRANE de hoy miércoles. Agregué 3 líneas nuevas, actualicé 5 que cambiaron, 40 quedaron igual. Si algo se ve raro, dímelo."</div>
    </div>
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
