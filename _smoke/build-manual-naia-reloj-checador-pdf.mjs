// Genera el PDF "Manual Reloj Checador para Naia" con brand Centinelia.
// Fuente: "Presentación Reloj Checador.pptx" compartido por AC Proyectos 2026-10-13.
// Salida: C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/
//          Elementos/RR.HH/Manual-Reloj-Checador-para-Naia.pdf
//
// Uso: npx tsx _smoke/build-manual-naia-reloj-checador-pdf.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const LOGO_PATH = 'public/logo.png';
const OUT_DIR   = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/RR.HH';
const OUT_PDF   = path.join(OUT_DIR, 'Manual-Reloj-Checador-para-Naia.pdf');

if (!fs.existsSync(LOGO_PATH)) { console.error('Falta logo:', LOGO_PATH); process.exit(1); }
if (!fs.existsSync(OUT_DIR))   { fs.mkdirSync(OUT_DIR, { recursive: true }); }

const logoBase64  = fs.readFileSync(LOGO_PATH).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoBase64}`;

const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

const html = /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Manual Reloj Checador para Naia</title>
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

  h1, h2, h3 { page-break-after: avoid; break-after: avoid; page-break-inside: avoid; break-inside: avoid; }
  .dialog, .card, .cap, .ad-grid, .contacto, .limites, .cap-grid, .step, ul, ol { page-break-inside: avoid; break-inside: avoid; }
  .block { page-break-inside: avoid; break-inside: avoid; margin-bottom: 6mm; }

  /* Portada */
  .cover { display: flex; flex-direction: column; justify-content: space-between; height: 257mm; padding: 24mm 20mm; background: linear-gradient(145deg, var(--bg) 0%, var(--soft) 100%); }
  .cover-logo { max-width: 180px; height: auto; margin-bottom: 12mm; }
  .cover-title { font-size: 40pt; font-weight: 700; color: var(--dark); margin: 0 0 8mm 0; line-height: 1.1; letter-spacing: -1.2px; }
  .cover-sub   { font-size: 15pt; color: var(--morado); font-weight: 500; margin-bottom: 20mm; }
  .cover-meta  { font-size: 11pt; color: var(--muted); border-top: 2px solid var(--morado); padding-top: 10mm; max-width: 75%; }
  .cover-meta strong { color: var(--dark); }

  h1 { font-size: 24pt; font-weight: 700; color: var(--dark); margin: 0 0 6mm 0; letter-spacing: -0.5px; }
  h2 { font-size: 15pt; font-weight: 600; color: var(--morado); margin: 10mm 0 3mm 0; letter-spacing: -0.2px; }
  h3 { font-size: 12pt; font-weight: 600; color: var(--dark); margin: 6mm 0 2mm 0; }

  p { margin: 0 0 3mm 0; }
  strong { color: var(--dark); font-weight: 600; }

  ul, ol { margin: 0 0 4mm 0; padding-left: 18px; }
  li { margin-bottom: 2mm; }

  /* Diálogos */
  .dialog { background: var(--soft); border-left: 4px solid var(--morado); padding: 4mm 6mm; margin: 3mm 0 4mm 0; border-radius: 0 6px 6px 0; }
  .dialog .quien { font-size: 9pt; font-weight: 600; color: var(--morado); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1mm; }
  .dialog .texto { font-style: italic; color: var(--dark); font-size: 11pt; }

  /* Cards */
  .card { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 5mm 6mm; margin-bottom: 4mm; }
  .card-title { font-size: 11pt; font-weight: 600; color: var(--morado); margin-bottom: 2mm; }
  .card-body  { font-size: 10.5pt; color: var(--dark); }

  /* Pasos numerados */
  .step { display: grid; grid-template-columns: 10mm 1fr; gap: 4mm; background: white; border: 1px solid var(--line); border-radius: 8px; padding: 4mm 5mm; margin-bottom: 3mm; align-items: start; }
  .step-num-badge { font-size: 18pt; font-weight: 700; color: var(--morado); line-height: 1; padding-top: 1mm; }
  .step-title { font-weight: 600; color: var(--dark); font-size: 11pt; margin-bottom: 1mm; }
  .step-body  { color: var(--dark); font-size: 10.5pt; }
  .step-note  { color: var(--muted); font-size: 9.5pt; margin-top: 2mm; font-style: italic; }

  /* Capacidades 2 columnas */
  .cap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 4mm; }
  .cap { background: white; border: 1px solid var(--line); border-radius: 6px; padding: 4mm 5mm; }
  .cap-h { font-weight: 600; color: var(--morado); font-size: 10.5pt; margin-bottom: 1mm; }
  .cap-b { font-size: 10pt; color: var(--muted); }

  /* Pain points tabla */
  .pains { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; margin-top: 4mm; }
  .pains-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-top: 1px solid var(--line); }
  .pains-row:first-child { border-top: none; background: var(--dark); color: white; font-weight: 600; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px; }
  .pains-row > div { padding: 4mm 5mm; font-size: 10pt; background: white; }
  .pains-row:first-child > div { background: var(--dark); color: white; }
  .pains-row > div:last-child { border-left: 1px solid var(--line); background: #FAF8FF; }
  .pains-row:first-child > div:last-child { background: var(--morado); color: white; border-left: 1px solid var(--morado); }

  /* Lista "qué NO hace" */
  .limites { background: #FFF9E6; border: 1px solid #F0D97A; border-radius: 6px; padding: 4mm 6mm; margin-top: 4mm; }
  .limites li { color: #665200; }

  /* Contacto */
  .contacto { background: var(--morado); color: white; border-radius: 8px; padding: 6mm 8mm; margin-top: 6mm; }
  .contacto h2 { color: white; margin-top: 0; }
  .contacto a { color: white; }

  .pie { font-size: 9pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 3mm; margin-top: 10mm; }
</style>
</head>
<body>

<!-- Portada -->
<div class="cover">
  <div>
    <img class="cover-logo" src="${logoDataUrl}" alt="Centinelia">
    <h1 class="cover-title">Manual del Reloj<br>Checador para Naia</h1>
    <div class="cover-sub">Tu empleada digital de Recursos Humanos aprende tu proceso de asistencia</div>
  </div>
  <div class="cover-meta">
    <strong>AC Proyectos</strong> · ${today}<br>
    Documento preparado por Centinelia a partir de la presentación que nos compartieron. Sirve para que Naia conozca cómo sacan la asistencia hoy y pueda apoyar a quien lleva la nómina.
  </div>
</div>

<!-- Pag 1: Qué va a saber Naia -->
<div class="page">
  <h1>Qué va a saber Naia después de leer esto</h1>
  <p>Naia es la empleada digital de Recursos Humanos que AC Proyectos contrató con Centinelia. Este manual es parte de su formación: le explica cómo se saca la asistencia hoy, dónde están los puntos más tardados, y en qué parte del proceso puede entrar a ayudar.</p>

  <h2>Lo que Naia va a entender</h2>
  <div class="cap-grid">
    <div class="cap"><div class="cap-h">El flujo completo</div><div class="cap-b">Los pasos uno por uno, desde entrar al sistema hasta cerrar la quincena.</div></div>
    <div class="cap"><div class="cap-h">Dónde están los dolores</div><div class="cap-b">Qué partes son más tardadas y por qué.</div></div>
    <div class="cap"><div class="cap-h">Cuándo acompañar</div><div class="cap-b">Qué puede resolver ella y qué sigue siendo del humano.</div></div>
    <div class="cap"><div class="cap-h">Qué viene después</div><div class="cap-b">Qué parte vamos a automatizar más adelante con ella.</div></div>
  </div>

  <div class="card" style="margin-top: 8mm;">
    <div class="card-title">Nota de confidencialidad</div>
    <div class="card-body">Naia maneja datos de personal con la misma discreción que una encargada de RRHH de carne y hueso. Si alguien que no es la persona de nómina le pide información de empleados, escala con el dueño del área antes de responder.</div>
  </div>
</div>

<!-- Pag 2: El proceso quincenal (pasos 1-4) -->
<div class="page">
  <h1>Cómo se saca la asistencia hoy</h1>
  <p>Este es el proceso que ejecuta la persona de RRHH cada quincena. Naia lo guarda tal cual.</p>

  <div class="step">
    <div class="step-num-badge">1</div>
    <div>
      <div class="step-title">Entrar al sistema del reloj checador</div>
      <div class="step-body">Desde la laptop de trabajo, abrir la aplicación que ya está instalada. La app se conecta por el servidor de Porteo al reloj físico.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num-badge">2</div>
    <div>
      <div class="step-title">Conectarse a la aplicación</div>
      <div class="step-body">Capturar la contraseña, que es la misma que el usuario. Esperar a que inicie.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num-badge">3</div>
    <div>
      <div class="step-title">Seleccionar el reloj y darle Connect</div>
      <div class="step-body">La confirmación esperada es "Succeed in connecting". Si marca error, revisar con el equipo de Porteo si hay problema con el servidor.</div>
      <div class="step-note">Si Naia ve que alguien reporta este error, su rol es orientar: el bloqueo no es del reloj ni de la laptop, es del servidor del proveedor.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num-badge">4</div>
    <div>
      <div class="step-title">Revisar la pestaña Employees</div>
      <div class="step-body">Verificar si hay personal nuevo que dieron de alta. Normalmente avisan cuando se hace alta o baja, y mandan captura desde el reloj. Las altas y bajas de administrativos se gestionan desde aquí (los operadores no checan asistencia por los viajes).</div>
      <div class="step-note">Pain point: cuando dan de alta a alguien, el nuevo aparece sin nombre. Hay que buscar el número y asignarle el nombre a mano. Los exempleados muchas veces siguen apareciendo porque la baja real tiene que hacerse desde el aparato físico. Lo mismo con los números salteados que no corresponden a nadie.</div>
    </div>
  </div>
</div>

<!-- Pag 3: pasos 5-7 -->
<div class="page">
  <h1>Cómo se saca la asistencia (continúa)</h1>

  <div class="step">
    <div class="step-num-badge">5</div>
    <div>
      <div class="step-title">Descargar los movimientos</div>
      <div class="step-body">En Download Attendance Logs. Los registros aparecen en la zona inferior de la pantalla.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num-badge">6</div>
    <div>
      <div class="step-title">Entrar al Report y elegir rango</div>
      <div class="step-body">En la pestaña Report se abre una ventana nueva. Elegir el rango de fechas de la quincena y seleccionar a todos los empleados. Darle Calcular para que arroje el reporte.</div>
      <div class="step-note">Se seleccionan todos por si hay un número nuevo sin nombre que todavía no avisaron. Los que ya no están activos tampoco salen si no tuvieron movimientos. Siempre se calcula hasta un día antes del cierre: la nómina queda lista con un día de anticipación, y el día que queda pendiente se contempla en la siguiente quincena.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num-badge">7</div>
    <div>
      <div class="step-title">Exportar el reporte a Excel</div>
      <div class="step-body">Con Export Data, seleccionando solo tres columnas: No, Name y Time. La ventana de guardar abre dentro del servidor de Porteo. Se guarda ahí, se cierra la sesión del reloj, se entra al servidor de Porteo, y se copia el archivo para pegarlo en una carpeta local de la laptop.</div>
    </div>
  </div>
</div>

<!-- Pag 4: pasos 8-10 + resultado -->
<div class="page">
  <h1>El trabajo fino en Excel</h1>
  <p>Cuando el archivo ya está en local, empieza la parte más tardada: calcular los retardos.</p>

  <div class="step">
    <div class="step-num-badge">8</div>
    <div>
      <div class="step-title">Pasar la hoja a un Excel nuevo</div>
      <div class="step-body">El Excel que exporta el reloj no permite editar directo. Hay que copiar la hoja completa y pegarla en un libro nuevo para poder trabajar.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num-badge">9</div>
    <div>
      <div class="step-title">Separar por trabajador y eliminar duplicados</div>
      <div class="step-body">El export trae todos los movimientos pegados. Se separa cada trabajador en su propio bloque y se eliminan los registros duplicados del mismo evento.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num-badge">10</div>
    <div>
      <div class="step-title">Calcular retardos y monto</div>
      <div class="step-body">A un lado de cada hora marcada como retardo se pone el monto que corresponde. Esa información se pasa a la base de nómina para rebajar al empleado.</div>
      <div class="step-note">Esta parte es la que más tiempo consume en todo el proceso.</div>
    </div>
  </div>

  <div class="card" style="margin-top: 5mm;">
    <div class="card-title">Cierre de la quincena</div>
    <div class="card-body">El reporte final contempla además de retardos: días festivos (como el 16), descansos autorizados por empleado (uno cada mes), y vacaciones. Esos días sin movimiento no son faltas y no se descuentan.</div>
  </div>
</div>

<!-- Pag 5: Pain points -->
<div class="page">
  <h1>Los dolores que ya conocemos</h1>
  <p>Naia los guarda para contextualizar cuando alguien le pregunte, no para resolverlos ella sola.</p>

  <div class="pains">
    <div class="pains-row"><div>Dolor</div><div>Qué sabe Naia</div></div>
    <div class="pains-row"><div>Las altas aparecen sin nombre</div><div>Es un comportamiento del software del reloj. Hay que buscar el número y asignárselo a mano desde la app. Naia no entra a la app.</div></div>
    <div class="pains-row"><div>Los exempleados siguen apareciendo</div><div>La baja real parece hacerse desde el aparato físico, no desde la app. Si Naia ve la pregunta, explica la hipótesis y recomienda revisar con el equipo que administra el reloj.</div></div>
    <div class="pains-row"><div>Números salteados sin dueño</div><div>Mismo tema del punto anterior. Naia no inventa a quién pertenecen.</div></div>
    <div class="pains-row"><div>El Excel del reloj no deja editar</div><div>Hoy el workaround es copiar a un Excel nuevo. Esta parte sí la vamos a resolver con Naia en la siguiente fase.</div></div>
    <div class="pains-row"><div>Separar por empleado, deduplicar, calcular retardos</div><div>Es la parte más tardada. Es también la pieza que Naia va a automatizar en la Fase 2 (ver siguiente página).</div></div>
  </div>
</div>

<!-- Pag 6: Lo que Naia puede hacer hoy -->
<div class="page">
  <h1>Lo que Naia puede hacer hoy</h1>
  <p>Con solo este manual cargado en su portal, Naia ya puede acompañar a la persona de nómina sin tocar el reloj ni el Excel.</p>

  <div class="cap-grid">
    <div class="cap">
      <div class="cap-h">Explicar el proceso</div>
      <div class="cap-b">Si entra alguien nuevo al rol o cubre vacaciones, Naia le explica los pasos como está en este manual.</div>
    </div>
    <div class="cap">
      <div class="cap-h">Guiar paso a paso</div>
      <div class="cap-b">Si la persona de nómina le dice "voy a sacar la asistencia", Naia la acompaña paso por paso.</div>
    </div>
    <div class="cap">
      <div class="cap-h">Dar contexto de los dolores</div>
      <div class="cap-b">Cuando pregunten por qué pasa algo extraño en el reloj, Naia da la hipótesis que ya conocemos, sin inventar.</div>
    </div>
    <div class="cap">
      <div class="cap-h">Recordatorio quincenal</div>
      <div class="cap-b">Si lo activamos, Naia manda un correo recordatorio un día antes del corte: fecha, pasos clave, cosas que no olvidar.</div>
    </div>
    <div class="cap">
      <div class="cap-h">Resumir un reporte</div>
      <div class="cap-b">Si le reenvían el Excel exportado del reloj con una pregunta puntual, Naia puede leerlo y resumir lo que pide por correo.</div>
    </div>
    <div class="cap">
      <div class="cap-h">Confidencialidad siempre</div>
      <div class="cap-b">Si alguien que no es la persona autorizada le pide datos de personal, Naia escala antes de responder.</div>
    </div>
  </div>

  <h2 style="margin-top: 10mm;">Dos ejemplos de cómo se le pregunta</h2>

  <div class="block">
    <div class="dialog">
      <div class="quien">Persona de nómina</div>
      <div class="texto">"Naia, ya estoy en el paso 6, ¿qué fechas pongo si cierro mañana la quincena del 1 al 15?"</div>
    </div>
    <div class="dialog">
      <div class="quien">Naia contesta</div>
      <div class="texto">"Para esa quincena pones del 1 al 14, un día antes del cierre, porque el día 15 lo pasas a la siguiente. Marca a todos los empleados en el reporte, por si hay alguno nuevo que todavía aparece sin nombre."</div>
    </div>
  </div>

  <div class="block">
    <div class="dialog">
      <div class="quien">Persona de nómina</div>
      <div class="texto">"Me siguen apareciendo dos personas que ya se fueron hace meses, ¿por qué?"</div>
    </div>
    <div class="dialog">
      <div class="quien">Naia contesta</div>
      <div class="texto">"Es un tema conocido del software del reloj. La baja desde la aplicación no termina de aplicar en el aparato físico. Habría que platicarlo con quien administra el reloj para que haga la baja desde el dispositivo. Por ahora, en el reporte de Report puedes dejar sin marcar a esas dos personas al calcular."</div>
    </div>
  </div>
</div>

<!-- Pag 7: Qué viene (Fase 2) -->
<div class="page">
  <h1>Lo que viene en la siguiente fase</h1>
  <p>La parte más tardada del proceso, calcular retardos y montos, es exactamente lo que Naia va a hacer por ti en la Fase 2. En lugar de pasar la hoja a otro Excel, separar por empleado y poner el monto a mano, el flujo quedará así:</p>

  <ol>
    <li>Terminas los pasos 1 al 7 del manual (bajar el reporte y exportar el Excel).</li>
    <li>Le mandas el Excel por correo a Naia con una línea del tipo "procesa esta quincena".</li>
    <li>Naia te responde con el Excel ya separado por empleado, duplicados eliminados, retardos marcados y montos calculados según las reglas que acordemos contigo.</li>
    <li>Tú lo pegas a tu base de nómina. El tiempo que hoy te lleva horas, se vuelve minutos.</li>
  </ol>

  <h2>Para que podamos activar esta fase necesitamos acordar contigo</h2>
  <ul>
    <li>Hora oficial de entrada de los administrativos.</li>
    <li>Minutos de tolerancia antes de que cuente como retardo.</li>
    <li>Monto del retardo: fijo por evento o escalado por minutos.</li>
    <li>A partir de cuántos minutos ya se cuenta como falta y no retardo.</li>
    <li>Días festivos del año y descansos autorizados por empleado.</li>
    <li>Cómo prefieres recibir el resultado: Excel adjunto, Google Sheet, o pegado en el cuerpo del correo.</li>
  </ul>

  <div class="card" style="margin-top: 6mm;">
    <div class="card-title">Mientras tanto</div>
    <div class="card-body">Naia ya conoce el proceso con este manual. Puedes empezar a usarla hoy para preguntas, guías, recordatorios y resúmenes. Cuando cerremos las reglas de retardo, activamos la Fase 2 y le pasas la quincena completa.</div>
  </div>
</div>

<!-- Pag final: Qué NO hace + Contacto -->
<div class="page">
  <h1>Qué no hace Naia</h1>
  <p>Para que sepas qué sigue siendo tuyo:</p>
  <div class="limites">
    <ul>
      <li><strong>No entra a la app del reloj checador.</strong> El sistema vive en la laptop local y en el servidor de Porteo. Esa parte sigue siendo manual.</li>
      <li><strong>No da altas ni bajas en el reloj.</strong> Esas acciones las sigue haciendo la persona de nómina.</li>
      <li><strong>No borra ni modifica tu base de nómina sin pedírtelo.</strong> Siempre te entrega el resultado y tú decides cómo integrarlo.</li>
      <li><strong>No comparte datos de personal con quien no esté autorizado.</strong> Si alguien externo pregunta, escala antes de contestar.</li>
    </ul>
  </div>

  <div class="contacto">
    <h2>Contacto directo</h2>
    <p><strong>Nazre</strong> · Centinelia</p>
    <p>Correo: hola@centinelia.mx</p>
    <p style="margin-top: 4mm; font-size: 10pt; opacity: 0.9;">Si algo del proceso cambia de tu lado, nos avisas y actualizamos este manual. Naia se entera en cuanto cargamos la nueva versión en su portal.</p>
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
  path:            OUT_PDF,
  format:          'Letter',
  printBackground: true,
  margin:          { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
});
await browser.close();
console.log('PDF generado:', OUT_PDF);
const stats = fs.statSync(OUT_PDF);
console.log(`Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
