// Parser para la plantilla "Ficha de Trámites y Servicios" del Gobierno de
// Santiago Nuevo León. Las fichas siguen una estructura tabular estandarizada
// (Formato SAP-CMR-05) — mismos campos, misma secuencia. Al pasarlas por unpdf
// las tablas se linealizan y el texto queda desordenado, así que en vez de
// depender de la posición usamos:
//   1. Regex de sección para dividir el cuerpo en bloques semánticos.
//   2. Regex de entidad global para extraer campos individuales (código,
//      teléfono, correo, extensión, etc.), preferiendo dominios canónicos y
//      corrigiendo typos conocidos del municipio.
//
// El rawText queda como fallback si algún campo no se detecta.

export type FichaSectionType =
  | 'header'
  | 'descripcion'
  | 'ordenamientos'
  | 'requisitos'
  | 'ubicacion'
  | 'pasos'
  | 'plazos'
  | 'costo'
  | 'inspeccion'
  | 'contacto'
  | 'otros';

export interface ParsedSection {
  type:    FichaSectionType;
  content: string;
}

export interface ParsedFicha {
  codigo:               string | null;
  titulo:               string | null;
  dependencia:          string | null;
  unidadAdministrativa: string | null;
  contactoNombre:       string | null;
  contactoPuesto:       string | null;
  contactoCorreo:       string | null;
  contactoTelefono:     string | null;
  contactoExtension:    string | null;
  ligaEnLinea:          string | null;
  direccion:            string | null;
  horario:              string | null;
  costoDescripcion:     string | null;
  plazoRespuesta:       string | null;
  rawText:              string;
  sections:             ParsedSection[];
}

// Fixes de typos conocidos en fichas del municipio (2026-09-23).
// Cuando se agreguen fichas nuevas, extender aquí si detectas patrones.
const EMAIL_TYPO_FIXES: Array<[RegExp, string]> = [
  [/^ingersos@santiago\.gob\.mx$/i,   'ingresos@santiago.gob.mx'],
  [/^isai_santiago@outlook\.com$/i,   'isai@santiago.gob.mx'],
];

function normalizeEmail(raw: string): string {
  const lower = raw.trim().toLowerCase();
  for (const [re, fix] of EMAIL_TYPO_FIXES) {
    if (re.test(lower)) return fix;
  }
  return lower;
}

function pickBestEmail(emails: string[]): string | null {
  if (emails.length === 0) return null;
  const normalized = emails.map(normalizeEmail);
  const santiago = normalized.find((e) => e.endsWith('@santiago.gob.mx'));
  return santiago ?? normalized[0];
}

function extractAllEmails(text: string): string[] {
  const matches = text.match(/\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) ?? [];
  return Array.from(new Set(matches));
}

function extractCodigo(text: string): string | null {
  const m = text.match(/\b(TS-[A-Z]+-[A-Z]+-\d+)\b/);
  return m ? m[1] : null;
}

function extractTelefono(text: string): string | null {
  // Prefer contiguous 10-digit (8121335851) or dashed (81-2133-5851)
  const dashed = text.match(/\b(\d{2}-\d{4}-\d{4})\b/);
  if (dashed) return dashed[1].replace(/-/g, '');
  const plain = text.match(/\b(\d{10})\b/);
  return plain ? plain[1] : null;
}

function extractExtension(text: string): string | null {
  // Estrategia 1: label adyacente al valor.
  const labeled = text.match(/Extensi[oó]n:\s*\n?\s*(\d{3,5})\b/i);
  if (labeled) return labeled[1];

  // Estrategia 2: la extensión sigue inmediatamente al teléfono canónico en
  // la modalidad "Vía telefónica" del PDF. unpdf linealiza estos valores en
  // secuencia aunque los labels vayan aparte.
  const phone = text.match(/\b(8121335851)\b/);
  if (phone && phone.index !== undefined) {
    const after = text.slice(phone.index + phone[0].length, phone.index + phone[0].length + 60);
    const nextInt = after.match(/^\s*\n?\s*(\d{3,5})\b/);
    if (nextInt) return nextInt[1];
  }
  return null;
}

function extractLiga(text: string): string | null {
  // URL that appears near "Liga:" or in body pointing to santiago.gob.mx
  const nearLiga = text.match(/Liga:\s*\n?\s*(https?:\/\/[^\s\n]+)/i);
  if (nearLiga) return nearLiga[1].trim();
  const anySantiago = text.match(/https?:\/\/[a-z0-9-]*santiago\.gob\.mx[^\s\n]*/i);
  return anySantiago ? anySantiago[0].trim() : null;
}

function extractTitulo(text: string, filenameHint?: string): string | null {
  // Estrategia 1: título como línea aislada tipo "Pago X." — patrón común de
  // fichas de pago del municipio. unpdf linealiza la tabla del PDF fuera de
  // orden así que este patrón es más robusto que buscar cerca de la etiqueta.
  const pagoMatch = text.match(/\b(Pago (?:del?|y|para|con)[^.\n]{10,120})\.(?=\s*\n|\s*$)/i);
  if (pagoMatch) return pagoMatch[1].trim();

  // Estrategia 2: línea después de "Nombre del trámite o servicio:" que NO
  // sea otro label conocido.
  const labelMatch = text.match(/Nombre del tr[áa]mite o servicio:[\s\S]{0,500}?\n\s*([A-ZÁÉÍÓÚÑ][^\n:]{10,120})\.?\s*\n/i);
  if (labelMatch) {
    const candidate = labelMatch[1].trim();
    const isLabel = /^(Descripci[oó]n|Presencial|En l[ií]nea|V[íi]a telef|Persona|Modalidad|Utilidad|Supuestos|Ordenamientos|Formato)/i.test(candidate);
    if (!isLabel) return candidate;
  }

  // Estrategia 3: filename hint (último recurso). Los archivos vienen como
  // "TS-SFT-RIN-02 Pago del Impuesto Predial.pdf".
  if (filenameHint) {
    const cleaned = filenameHint
      .replace(/\.pdf$/i, '')
      .replace(/\s*\(\d+\)$/, '')          // '(1)' suffix
      .replace(/^TS-[A-Z]+-[A-Z]+-\d+\s+/, '') // strip código prefix
      .trim();
    if (cleaned.length > 5) return cleaned;
  }

  return null;
}

function extractDependencia(text: string): string | null {
  // "Secretaría de Finanzas y Tesorería Municipal" — aparece varias veces
  const m = text.match(/(Secretar[íi]a de Finanzas y Tesorer[íi]a Municipal)/i);
  return m ? m[1].trim() : null;
}

function extractUnidadAdmin(text: string): string | null {
  // Common: "Dirección de Recaudación Inmobiliaria" | "Dirección de Ingresos"
  const m = text.match(/(Direcci[oó]n de (?:Recaudaci[oó]n Inmobiliaria|Ingresos|[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+))/i);
  return m ? m[1].trim() : null;
}

// Filtro para descartar candidatos de nombre que en realidad son puestos,
// dependencias o labels de la plantilla.
const NAME_BLOCKLIST = /^(Director|Directora|Tesorero|Secretar|Ingresos|Recaudaci|Finanzas|Tesorer[íi]a|Municipal|Elabor|Aprob|Categor[íi]a|Ordenamiento|Ficta|Nombre|Puesto|Correo|Sector|Sistema|Municipio|Fundamento|Reglamento|Ley|Direcci|Alcance|Persona|Presencial|Formato|Villa|Calle|Colonia|Nuevo|Santiago|Monterrey|Actividades|Efectivo|Cantidad|Supuestos|Utilidad|Documento|Mediante|Cumplir|Realizar|Boleta|Etapa|Objetivo|F[ií]sica|Moral|Trámite|Servicio|Plazo)/i;
const NAME_BAD_TOKENS = /(Municipal|Ingresos|Recaudaci|Finanzas|Tesorer[íi]a|Reglamento|Ordenamiento|Direcci[oó]n|Villa|Calle|Colonia|Nuevo Le[oó]n|Santiago,|Actividades|Servicio)/i;

// Cuando unpdf linealiza la tabla, a veces pega el label de la siguiente
// celda al final del nombre. Ej. "Elvira Guadalupe Saldivar Fernandez Categoría"
// donde "Categoría" es el header de la siguiente sección. Trimeamos.
const NAME_TRAILING_JUNK = /\s+(Categor[íi]a|Sector|Elabor[oó]?|Aprob[oó]?|Ficta|Puesto|Correo|Nombre|Villa|Calle|Director(?:a)?|Tesorero|Municipal|Ingresos|Recaudaci|Finanzas|Ordenamiento|Reglamento|Documento|Descripci|Fundamento|Utilidad|Servicio|Tr[áa]mite|Formato|Persona|Presencial|Cantidad|Sistema|Contacto|L[ií]nea|Dependencia|Dudas|Etapa|Objetivo|Plazo|Boleta)\b[\s\S]*$/i;

function cleanupName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(NAME_TRAILING_JUNK, '').trim();
}

function pickValidName(region: string): string | null {
  const candidates = region.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,4}/g) ?? [];
  for (const raw of candidates) {
    const cleaned = cleanupName(raw);
    if (!cleaned) continue;
    if (NAME_BLOCKLIST.test(cleaned)) continue;
    if (NAME_BAD_TOKENS.test(cleaned)) continue;
    const words = cleaned.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    return cleaned;
  }
  return null;
}

function extractContactoNombreYPuesto(text: string): { nombre: string | null; puesto: string | null } {
  let nombre: string | null = null;
  let puesto: string | null = null;

  // Puesto: buscar "Director[a] de X" antes de "Tesorero Municipal".
  // unpdf a veces duplica el label ("Directora de Ingresos Directora de Ingresos"),
  // así que aplicamos dedup si la mitad izquierda == mitad derecha.
  const puestoM = text.match(/(Director(?:a)?\s+de\s+[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+?)\s+Tesorero\s+Municipal/i);
  if (puestoM) {
    const raw = puestoM[1].trim().replace(/\s+/g, ' ');
    const words = raw.split(' ');
    if (words.length % 2 === 0) {
      const half = words.length / 2;
      const left  = words.slice(0, half).join(' ');
      const right = words.slice(half).join(' ');
      puesto = left === right ? left : raw;
    } else {
      puesto = raw;
    }
  }

  // Nombre: intentar primero patrones ADYACENTES a "Erick Rafael Barbosa Alanis"
  // porque unpdf a veces concatena el nombre del elaborador directamente al
  // del aprobador sin espacio (visto en Multas: "AlanisMaria del Socorro...").
  const beforeAdjacent = text.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,4})\s*Erick\s*Rafael\s*Barbosa\s*Alanis/);
  if (beforeAdjacent) {
    const cand = cleanupName(beforeAdjacent[1]);
    if (cand && !NAME_BLOCKLIST.test(cand) && !NAME_BAD_TOKENS.test(cand)) nombre = cand;
  }
  if (!nombre) {
    const afterAdjacent = text.match(/Erick\s*Rafael\s*Barbosa\s*Alanis\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,4})/);
    if (afterAdjacent) {
      const cand = cleanupName(afterAdjacent[1]);
      if (cand && !NAME_BLOCKLIST.test(cand) && !NAME_BAD_TOKENS.test(cand)) nombre = cand;
    }
  }
  if (!nombre) {
    // Fallback: ventana ±250 chars alrededor de Erick con filtro
    const erickMatch = text.match(/Erick\s*Rafael\s*Barbosa\s*Alanis/);
    if (erickMatch && erickMatch.index !== undefined) {
      const idx = erickMatch.index;
      const before = text.slice(Math.max(0, idx - 250), idx);
      const after  = text.slice(idx + erickMatch[0].length, Math.min(text.length, idx + erickMatch[0].length + 250));
      nombre = pickValidName(after) ?? pickValidName(before);
    }
  }

  if (nombre || puesto) return { nombre, puesto };

  // Fallback: sección "Dudas e Información Adicional".
  const dudas = text.match(/Dudas e Informaci[oó]n Adicional:([\s\S]{0,1500})/i);
  if (dudas) {
    const chunk = dudas[1];
    const nombreM = chunk.match(/Nombre:\s*\n?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,4})/);
    if (nombreM) {
      const cand = nombreM[1].trim().replace(/\s+/g, ' ');
      if (!NAME_BLOCKLIST.test(cand) && !NAME_BAD_TOKENS.test(cand)) nombre = cand;
    }
    const pM = chunk.match(/Puesto:\s*\n?\s*([^\n]+?)(?:\n|Correo)/i);
    if (pM && !puesto) puesto = pM[1].trim();
  }
  return { nombre, puesto };
}

function extractHorario(text: string): string | null {
  const m = text.match(/(Lunes a Viernes de \d+:\d+ a \d+:\d+ horas)/i);
  return m ? m[1].trim() : null;
}

function extractDireccion(text: string): string | null {
  const m = text.match(/(Calle [A-ZÁÉÍÓÚÑa-záéíóúñ]+ #?\d+,?[^\n]*)/i);
  return m ? m[1].trim().replace(/\.$/, '') : null;
}

function extractCosto(text: string): string | null {
  // "No Aplica" aparece como flag en varias secciones (Inspección, Ficta,
  // Plazos), así que no lo consideramos costo válido. Preferimos:
  //   1. "Desde $..." (búsqueda global — es inequívoco monto).
  //   2. "Variable" | "Sin costo" | "Gratuito" en línea aislada (celda de la
  //      tabla de costo que unpdf linealiza sola).
  //   3. Etiquetas en la sección "¿Cuál es el costo?" como último recurso.
  const desde = text.match(/(Desde\s+\$[\d,.]+\s*(?:Pesos\s+Mexicanos)?)/i);
  if (desde) return desde[1].trim().replace(/\s+/g, ' ');

  const flatLine = text.match(/^\s*(Variable|Sin costo|Gratuito)\s*$/m);
  if (flatLine) return flatLine[1];

  const seccion = text.match(/¿Cu[áa]l es el costo del tr[áa]mite\?([\s\S]{0,500})/i);
  if (seccion) {
    const flat = seccion[1].match(/\b(Variable|Sin costo|Gratuito)\b/i);
    if (flat) return flat[1];
  }
  return null;
}

function extractPlazoRespuesta(text: string): string | null {
  const m = text.match(/Plazo m[áa]ximo de respuesta[\s\S]{0,300}?\b(\d+\s*(?:D[íi]as?|Horas?)|No Aplica|Inmediato)\b/i);
  return m ? m[1].trim() : null;
}

// Divide el texto en secciones semánticas. Los markers son los headers estables
// de la plantilla. Cada match consume del texto lo que va hasta el siguiente
// marker (o al fin).
interface SectionMarker {
  type:  FichaSectionType;
  regex: RegExp;
}

const SECTION_MARKERS: SectionMarker[] = [
  { type: 'descripcion',   regex: /Descripci[oó]n del tr[áa]mite o servicio:/i },
  { type: 'ordenamientos', regex: /Ordenamientos jur[íi]dicos/i },
  { type: 'requisitos',    regex: /¿Qu[eé] requisitos son necesarios\?/i },
  { type: 'ubicacion',     regex: /¿D[oó]nde se puede presentar el tr[áa]mite o servicio\?/i },
  { type: 'pasos',         regex: /¿Qu[eé] pasos sigo y cu[áa]l es el tiempo para solicitar el tr[áa]mite/i },
  { type: 'plazos',        regex: /¿Cu[áa]nto tarda la respuesta y qu[eé] se obtiene al finalizar el tr[áa]mite\?/i },
  { type: 'costo',         regex: /¿Cu[áa]l es el costo del tr[áa]mite\?/i },
  { type: 'inspeccion',    regex: /¿Es necesaria una inspecci[oó]n y\/o verificaci[oó]n\?/i },
  { type: 'contacto',      regex: /Dudas e Informaci[oó]n Adicional:/i },
];

function splitSections(text: string): ParsedSection[] {
  const hits: Array<{ type: FichaSectionType; start: number; end: number }> = [];
  for (const m of SECTION_MARKERS) {
    const match = text.match(m.regex);
    if (match && match.index !== undefined) {
      hits.push({ type: m.type, start: match.index, end: match.index + match[0].length });
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const sections: ParsedSection[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].end;
    const end   = i + 1 < hits.length ? hits[i + 1].start : text.length;
    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      sections.push({ type: hits[i].type, content });
    }
  }
  return sections;
}

export interface ParseOpts {
  filenameHint?: string;
}

export function parseFichaSantiago(rawText: string, opts: ParseOpts = {}): ParsedFicha {
  const emails = extractAllEmails(rawText);
  const { nombre, puesto } = extractContactoNombreYPuesto(rawText);

  return {
    codigo:               extractCodigo(rawText),
    titulo:               extractTitulo(rawText, opts.filenameHint),
    dependencia:          extractDependencia(rawText),
    unidadAdministrativa: extractUnidadAdmin(rawText),
    contactoNombre:       nombre,
    contactoPuesto:       puesto,
    contactoCorreo:       pickBestEmail(emails),
    contactoTelefono:     extractTelefono(rawText),
    contactoExtension:    extractExtension(rawText),
    ligaEnLinea:          extractLiga(rawText),
    direccion:            extractDireccion(rawText),
    horario:              extractHorario(rawText),
    costoDescripcion:     extractCosto(rawText),
    plazoRespuesta:       extractPlazoRespuesta(rawText),
    rawText,
    sections:             splitSections(rawText),
  };
}
