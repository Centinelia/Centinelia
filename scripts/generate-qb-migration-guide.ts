/**
 * Genera un .docx con la guía paso a paso de migración QuickBooks Desktop
 * a QuickBooks Online — con branding Centinelia real (portada, logo,
 * colores, tipografía, callouts, footer).
 *
 * Uso: npx tsx scripts/generate-qb-migration-guide.ts
 * Sale a: docs/qb-migracion-desktop-a-online.docx
 */

import './_bootstrap';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, ImageRun, Footer, Header, PageBreak, PageNumber,
  Table, TableRow, TableCell, WidthType, ShadingType, LevelFormat,
  convertInchesToTwip,
} from 'docx';

// ── Branding tokens ────────────────────────────────────────────────────────
const BRAND = {
  primary:      '6C3BFF',   // morado Centinelia
  primaryDark:  '1A0A3B',   // texto principal
  textSecond:   '6B6480',
  subtle:       '9B8FB5',
  bgLight:      'F5F2FB',
  bgSubtle:     'FAFBFF',
  amber:        'A16207',   // Nala accent
  green:        '15803D',
  fontHeading:  'Calibri',
  fontBody:     'Calibri',
};

// ── Helpers de construcción ────────────────────────────────────────────────

function textRun(text: string, opts: { bold?: boolean; color?: string; size?: number; italic?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    bold:   opts.bold,
    italics:opts.italic,
    color:  opts.color ?? BRAND.primaryDark,
    size:   opts.size ?? 22, // half-points, 22 = 11pt
    font:   BRAND.fontBody,
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: BRAND.primary, size: 44, font: BRAND.fontHeading })],
    spacing:  { before: 480, after: 200 },
    border:   { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND.primary, space: 6 } },
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: BRAND.primaryDark, size: 30, font: BRAND.fontHeading })],
    spacing:  { before: 360, after: 140 },
  });
}

function step(num: number, title: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `Paso ${num}`, bold: true, color: BRAND.primary, size: 20, font: BRAND.fontHeading }),
      new TextRun({ text: '   ', size: 20, font: BRAND.fontHeading }),
      new TextRun({ text: title, bold: true, color: BRAND.primaryDark, size: 28, font: BRAND.fontHeading }),
    ],
    spacing: { before: 400, after: 160 },
  });
}

function p(text: string, opts: { indent?: number } = {}): Paragraph {
  return new Paragraph({
    children: [textRun(text)],
    spacing:  { before: 60, after: 60, line: 320 },
    indent:   opts.indent ? { left: convertInchesToTwip(opts.indent) } : undefined,
  });
}

function bold(text: string, rest?: string): Paragraph {
  return new Paragraph({
    children: [
      textRun(text, { bold: true }),
      ...(rest ? [textRun(rest)] : []),
    ],
    spacing: { before: 60, after: 60, line: 320 },
  });
}

// Bullet con opción de negrita en la etiqueta inicial
function bullet(label: string, body?: string): Paragraph {
  return new Paragraph({
    children: [
      textRun(label, { bold: !!body }),
      ...(body ? [textRun(body)] : []),
    ],
    bullet:  { level: 0 },
    spacing: { before: 40, after: 40, line: 300 },
    indent:  { left: convertInchesToTwip(0.25) },
  });
}

function numbered(text: string, boldPrefix?: string): Paragraph {
  return new Paragraph({
    children: [
      ...(boldPrefix ? [textRun(boldPrefix, { bold: true }), textRun(' ')] : []),
      textRun(text),
    ],
    numbering: { reference: 'steps', level: 0 },
    spacing:   { before: 60, after: 60, line: 320 },
    indent:    { left: convertInchesToTwip(0.5) },
  });
}

// Callout: cuadro con background morado suave + borde izquierdo
function callout(kind: 'info' | 'warning' | 'success', title: string, body: string): Paragraph[] {
  const color = kind === 'warning' ? BRAND.amber : kind === 'success' ? BRAND.green : BRAND.primary;
  const bg    = kind === 'warning' ? 'FDF3E7' : kind === 'success' ? 'F0FDF4' : BRAND.bgLight;

  return [
    new Paragraph({
      children: [
        textRun(title, { bold: true, color, size: 22 }),
      ],
      shading:  { type: ShadingType.SOLID, color: bg, fill: bg },
      border:   {
        left:   { style: BorderStyle.SINGLE, size: 24, color, space: 8 },
        top:    { style: BorderStyle.SINGLE, size: 4, color: bg, space: 2 },
        right:  { style: BorderStyle.SINGLE, size: 4, color: bg, space: 2 },
        bottom: { style: BorderStyle.NONE, size: 0, color: bg },
      },
      spacing:  { before: 200, after: 0 },
      indent:   { left: convertInchesToTwip(0.15) },
    }),
    new Paragraph({
      children: [textRun(body)],
      shading:  { type: ShadingType.SOLID, color: bg, fill: bg },
      border:   {
        left:   { style: BorderStyle.SINGLE, size: 24, color, space: 8 },
        top:    { style: BorderStyle.NONE, size: 0, color: bg },
        right:  { style: BorderStyle.SINGLE, size: 4, color: bg, space: 2 },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: bg, space: 2 },
      },
      spacing:  { before: 40, after: 200, line: 300 },
      indent:   { left: convertInchesToTwip(0.15) },
    }),
  ];
}

function spacer(size = 200): Paragraph {
  return new Paragraph({ children: [], spacing: { before: size, after: 0 } });
}

// ── Contenido ──────────────────────────────────────────────────────────────

async function buildDoc(): Promise<Document> {
  // Logo Centinelia con tagline
  const logoBuffer = await readFile(resolve(process.cwd(), 'public', 'logo-tagline.png'));

  const coverPage: Paragraph[] = [
    new Paragraph({
      children: [
        new ImageRun({
          data: logoBuffer,
          transformation: { width: 220, height: 60 },
          type: 'png',
        }),
      ],
      spacing:   { before: 480, after: 800 },
    }),
    new Paragraph({
      children: [textRun('Guía técnica', { color: BRAND.primary, size: 22, bold: true })],
      spacing:  { before: 0, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'Migración de QuickBooks Desktop a QuickBooks Online',
        bold: true, color: BRAND.primaryDark, size: 60, font: BRAND.fontHeading,
      })],
      spacing:  { before: 0, after: 240 },
    }),
    new Paragraph({
      children: [textRun('Requisito previo para activar el pack Ciclo OC-CFDI de Centinelia', { color: BRAND.textSecond, size: 26 })],
      spacing:  { before: 0, after: 800 },
    }),
    new Paragraph({
      children: [
        textRun('Preparado para  ', { color: BRAND.subtle, size: 20 }),
        textRun('AC Proyectos', { color: BRAND.primaryDark, bold: true, size: 22 }),
      ],
      spacing: { before: 0, after: 100 },
    }),
    new Paragraph({
      children: [
        textRun('Fecha  ', { color: BRAND.subtle, size: 20 }),
        textRun(new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }), { color: BRAND.primaryDark, bold: true, size: 22 }),
      ],
      spacing: { before: 0, after: 100 },
    }),
    new Paragraph({
      children: [
        textRun('Contacto  ', { color: BRAND.subtle, size: 20 }),
        textRun('hola@centinelia.mx', { color: BRAND.primaryDark, bold: true, size: 22 }),
      ],
      spacing: { before: 0, after: 100 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // Índice visual (opcional simple)
  const secciones: Paragraph[] = [
    h1('Contexto'),
    p('Centinelia integra únicamente con QuickBooks Online. Para activar el pack Ciclo OC-CFDI en AC Proyectos —automatización end-to-end de órdenes de compra a proveedores, firma digitalizada, coordinación de pagos y timbrado de CFDIs a clientes— es indispensable trasladar la contabilidad de QuickBooks Desktop hacia QuickBooks Online.'),
    spacer(),
    p('Esta guía documenta el proceso oficial recomendado por Intuit, con todos los pasos verificados y las precauciones necesarias para que no se pierda información. Cualquier duda técnica puntual, contactar a soporte de Centinelia.'),

    h2('Por qué migrar'),
    bullet('Compatibilidad con Centinelia: ', 'el pack Ciclo OC-CFDI solo opera contra QuickBooks Online.'),
    bullet('Acceso remoto: ', 'Ángeles, Ana y Martha pueden trabajar desde cualquier lugar sin instalaciones locales ni conexión a la máquina de contabilidad.'),
    bullet('Respaldos automáticos: ', 'los datos viven en la nube de Intuit con backups continuos, sin dependencia de una PC física.'),
    bullet('Futuro-proof: ', 'Intuit está retirando gradualmente QuickBooks Desktop en México. La migración eventualmente será obligatoria.'),
    bullet('Cero recaptura: ', 'la migración traslada automáticamente proveedores, clientes, catálogo, cuentas contables, saldos e historial de transacciones.'),

    h2('Requisitos previos'),
    bullet('QuickBooks Desktop', ' Pro, Premier o Enterprise versión 2018 o superior. Si tienen una versión más vieja, Intuit requiere actualizar primero.'),
    bullet('Suscripción activa a QuickBooks Online', ' — plan Plus o Advanced. Plus es el mínimo recomendado (incluye Órdenes de Compra, seguimiento de inventario y hasta 5 usuarios).'),
    bullet('Archivo de datos', ' de QuickBooks Desktop accesible desde la computadora que hará la exportación (típicamente el .qbw en la máquina de contabilidad).'),
    bullet('Contraseña de administrador', ' del archivo QuickBooks Desktop.'),
    bullet('Correo electrónico del responsable', ' — el mismo que se usará para la cuenta de QuickBooks Online.'),

    ...callout('warning', 'Antes de empezar',
      'Este proceso mueve toda la contabilidad de AC hacia la nube. Es reversible mientras no se comience a capturar en Online, pero conviene hacer respaldo completo antes de tocar cualquier cosa (Paso 1).'
    ),

    // ── Pasos ────────────────────────────────────────────────────────────
    step(1, 'Respaldar QuickBooks Desktop'),
    p('Antes de tocar cualquier cosa, respaldo completo. Si algo sale mal, se restaura sin pérdida.'),
    numbered('Abrir QuickBooks Desktop.'),
    numbered('Menú Archivo → Copia de seguridad → Crear copia de seguridad local.'),
    numbered('Guardar el archivo .qbb en una USB o en Dropbox / Drive.'),
    numbered('Verificar que el archivo se creó y que tiene tamaño mayor a 0 KB.'),

    step(2, 'Actualizar QuickBooks Desktop al último parche'),
    p('Intuit solo permite migrar desde versiones actualizadas.'),
    numbered('Menú Ayuda → Actualizar QuickBooks Desktop.'),
    numbered('Pestaña Actualizar ahora → Obtener actualizaciones.'),
    numbered('Esperar a que descargue e instale. Reiniciar QuickBooks Desktop.'),
    numbered('Confirmar la versión en Ayuda → Acerca de QuickBooks.'),

    step(3, 'Crear la cuenta de QuickBooks Online'),
    numbered('Ir a quickbooks.intuit.com/mx.'),
    numbered('Click en Comprar ahora.'),
    numbered('Elegir plan QuickBooks Online Plus (incluye Órdenes de Compra, Inventario y hasta 5 usuarios). Es el mínimo recomendado para AC Proyectos.'),
    numbered('Registrar con el correo del responsable de contabilidad.'),
    numbered('Completar los datos de facturación de la suscripción.'),
    ...callout('warning', 'Muy importante',
      'NO configurar la empresa desde cero. Al terminar el registro, cerrar sesión y dejar la cuenta vacía. La migración desde el Paso 5 creará la empresa automáticamente con todos los datos actuales.'
    ),

    step(4, 'Preparar el archivo Desktop para la migración'),
    numbered('Abrir QuickBooks Desktop con la empresa a migrar.'),
    numbered('Menú Empresa → Iniciar sesión como administrador (se requiere la contraseña de admin).'),
    numbered('Verificar integridad: Archivo → Utilidades → Verificar datos. Si detecta errores, correr Reconstruir datos antes de continuar.'),
    numbered('Si tienen inventario: confirmar que las cantidades reflejan el estado real. Cualquier ajuste después de la migración es doble trabajo.'),

    step(5, 'Exportar de Desktop a Online'),
    p('Aquí ocurre la migración real. Toma entre 5 minutos y 2 horas según el tamaño del archivo.'),
    numbered('Con QuickBooks Desktop abierto y la empresa cargada, ir al menú Empresa → Exportar datos de la empresa a QuickBooks Online. Si el menú no aparece: Archivo → Utilidades → Copiar datos de la empresa a QuickBooks Online.'),
    numbered('Aparece una ventana con opciones. Marcar Incluir inventario (crítico para AC) y elegir la fecha de hoy como fecha de inventario.'),
    numbered('Iniciar sesión con la cuenta de QuickBooks Online creada en el Paso 3.'),
    numbered('Seleccionar la empresa de destino (será la única disponible, recién creada).'),
    numbered('Aceptar los términos y click en Exportar.'),
    numbered('Esperar. QuickBooks muestra el progreso en pantalla.'),
    numbered('Al terminar, llega un correo de confirmación de Intuit al email del responsable.'),

    step(6, 'Verificar la migración'),
    p('Una vez confirmado el correo, revisar que todo cuadra antes de operar en la nube.'),
    numbered('Entrar a qbo.intuit.com e iniciar sesión con la cuenta creada en Paso 3.'),
    numbered('Comparar contra QuickBooks Desktop: panel principal (ingresos y gastos del último mes deben coincidir).'),
    numbered('Clientes: cantidad de clientes y saldos deben coincidir.'),
    numbered('Proveedores: cantidad y saldos deben coincidir.'),
    numbered('Órdenes de compra pendientes: verificar que aparezcan.'),
    numbered('Cuentas contables: menú Contabilidad → Plan de cuentas. Comparar saldos.'),
    ...callout('warning', 'Si algo no cuadra',
      'Contactar soporte de Intuit ANTES de seguir trabajando en la nube. Cualquier corrección manual en QuickBooks Online sobre datos incorrectos genera inconsistencias difíciles de deshacer después.'
    ),

    step(7, 'Notificar a Centinelia'),
    p('Cuando la verificación esté OK y decidan trabajar oficialmente en QuickBooks Online:'),
    numbered('Enviar correo a hola@centinelia.mx con la confirmación de que la migración se completó y el correo de la cuenta de QuickBooks Online (el mismo del Paso 3).'),
    numbered('Centinelia hace la conexión del portal de AC con QuickBooks Online.'),
    numbered('En cuestión de horas Nala empieza a operar el ciclo completo: crear Órdenes de Compra, firmar, coordinar con pagos, timbrar CFDIs a clientes y archivar todo.'),

    step(8, 'Sobre QuickBooks Desktop después de migrar'),
    bullet('No desinstalar QuickBooks Desktop.', ' Sigue siendo respaldo local por si se necesita revisar algo del pasado.'),
    bullet('No seguir capturando en Desktop.', ' Después de migrar, toda la operación diaria se hace en QuickBooks Online. Si se captura en ambos, los datos se desincronizan y es imposible reconciliar.'),
    bullet('El archivo .qbw', ' sigue en la computadora, no se borra. Simplemente se deja de usar.'),

    h1('Soporte'),
    h2('Soporte oficial de Intuit'),
    p('Si en cualquier paso surgen problemas, Intuit ofrece asistencia gratuita.'),
    bullet('Teléfono México: ', '800 953 4959 (lunes a viernes, 9:00 a 20:00 hrs).'),
    bullet('Chat en línea: ', 'botón de ayuda dentro de QuickBooks Desktop o en quickbooks.intuit.com/mx/soporte.'),
    bullet('Documentación: ', 'intuit.com/mx/desktop-a-online.'),
    ...callout('info', 'Recomendado',
      'Intuit tiene un equipo de Migration Specialists que hacen la migración gratis por videollamada si se solicita al llamar. Es el camino más seguro cuando el archivo tiene alto volumen de transacciones históricas.'
    ),

    h2('Soporte Centinelia'),
    p('Cualquier duda del lado técnico o de la integración con el pack Ciclo OC-CFDI:'),
    bullet('Correo: ', 'hola@centinelia.mx'),
    bullet('Portal: ', 'centinelia.mx/portal'),
    p('Estamos aquí para ayudarte en cada paso.'),
  ];

  // Header con logo pequeño
  const headerLogo = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 100, height: 27 },
            type: 'png',
          }),
        ],
      }),
    ],
  });

  // Footer con contacto + página
  const footerPage = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          textRun('Centinelia · hola@centinelia.mx · centinelia.mx  ·  Página ', { color: BRAND.subtle, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: BRAND.subtle, size: 18, font: BRAND.fontBody }),
          textRun(' de ', { color: BRAND.subtle, size: 18 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], color: BRAND.subtle, size: 18, font: BRAND.fontBody }),
        ],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRAND.bgLight, space: 8 } },
      }),
    ],
  });

  return new Document({
    creator:     'Centinelia',
    title:       'Migración QuickBooks Desktop a Online',
    description: 'Guía técnica para AC Proyectos',
    numbering: {
      config: [{
        reference: 'steps',
        levels: [{
          level:  0,
          format: LevelFormat.DECIMAL,
          text:   '%1.',
          alignment: AlignmentType.START,
          style: {
            paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.3) } },
            run:       { color: BRAND.primary, bold: true, font: BRAND.fontBody },
          },
        }],
      }],
    },
    styles: {
      default: {
        document: { run: { font: BRAND.fontBody, size: 22, color: BRAND.primaryDark } },
      },
    },
    sections: [
      // Portada (sin header/footer)
      {
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(1),
              right:  convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1),
            },
          },
        },
        children: coverPage,
      },
      // Contenido (con header + footer)
      {
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(1.2),
              right:  convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1),
            },
          },
        },
        headers: { default: headerLogo },
        footers: { default: footerPage },
        children: secciones,
      },
    ],
  });
}

async function main() {
  const doc    = await buildDoc();
  const buffer = await Packer.toBuffer(doc);
  const outPath = resolve(process.cwd(), 'docs', 'qb-migracion-desktop-a-online.docx');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);
  console.log(`\n✓ Documento branded generado en: ${outPath}`);
  console.log(`  Tamaño: ${Math.round(buffer.length / 1024)}KB`);
  console.log(`  Portada + header con logo + footer con paginación\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
