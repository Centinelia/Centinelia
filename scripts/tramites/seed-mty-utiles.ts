/**
 * Seed inicial del trámite pre-registro útiles escolares Monterrey 2026.
 *
 * PREREQUISITO: la org del Municipio de Monterrey debe existir en la tabla
 * `organizations` con business_name = "Gobierno de Monterrey". Este script
 * la resuelve por business_name.
 *
 * Uso:
 *   npx tsx scripts/tramites/seed-mty-utiles.ts
 *
 * El trámite se inserta con activo=false. Al recibir la doc oficial del
 * municipio, actualizar endpoint_base + campos + catalogos + lookups y
 * activar via UPDATE ... SET activo=true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

// Cargar .env.local para poder correr localmente vía `npx tsx`
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const supabase = createAdminClient();

  // La org se identifica por portal_email (PK de organizations).
  // Puedes pasar el correo por env `MTY_PORTAL_EMAIL` o dejar que el script
  // busque por nombre. Si hay varias coincidencias, especifica el env.
  const explicitEmail = process.env.MTY_PORTAL_EMAIL;
  let portalEmail: string | null = null;

  if (explicitEmail) {
    const { data: found } = await supabase
      .from('organizations')
      .select('portal_email')
      .eq('portal_email', explicitEmail)
      .maybeSingle();
    if (!found) throw new Error(`No se encontró la org con portal_email=${explicitEmail}`);
    portalEmail = found.portal_email;
  } else {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('portal_email, name')
      .ilike('name', '%monterrey%')
      .maybeSingle();
    if (orgErr || !org) throw new Error(`No se encontró org con "monterrey" en el nombre. Setea MTY_PORTAL_EMAIL explícito. Detalle: ${orgErr?.message ?? 'no rows'}`);
    portalEmail = org.portal_email;
  }

  const tramite = {
    portal_email:           portalEmail,
    slug:                   'mty-utiles-2026',
    nombre_publico:         'Pre-registro Programa de Útiles Escolares 2026',
    descripcion_agente:     'Pre-registro del Programa Municipal de Útiles Escolares 2026 de Monterrey. Permite al ciudadano seleccionar sede de entrega, capturar los datos del estudiante (CURP autocompletado desde padrón, escuela, grado) y del adulto responsable que recogerá el kit (CURP, domicilio, contacto). Al finalizar se le entrega un folio y la lista de documentos que debe presentar el día de la entrega.',
    activo:                 false,
    schema_version:         1,
    endpoint_base:          'https://TODO-endpoint-real-del-municipio.gob.mx',
    auth_config:            { type: 'bearer', secret_key: 'mty_utiles_api_key' },
    campos: [
      { key: 'sede_id', tipo: 'catalogo_pick', catalogo: 'sedes', required: true, orden: 1 },
      { key: 'curp_estudiante', tipo: 'curp', required: true, orden: 2, autocompleta_desde: 'padron_estudiante' },
      { key: 'nombre_estudiante', tipo: 'string', required: true, orden: 3, source: 'padron_estudiante.nombre' },
      { key: 'apellido_paterno_estudiante', tipo: 'string', required: true, orden: 4, source: 'padron_estudiante.apellido_paterno' },
      { key: 'apellido_materno_estudiante', tipo: 'string', required: true, orden: 5, source: 'padron_estudiante.apellido_materno' },
      { key: 'fecha_nacimiento_estudiante', tipo: 'fecha', required: true, orden: 6, source: 'padron_estudiante.fecha_nacimiento' },
      { key: 'escuela_id', tipo: 'catalogo_search', catalogo: 'escuelas', required: true, orden: 7 },
      { key: 'grado_id', tipo: 'catalogo_pick', catalogo: 'grados', depende_de: 'escuela_id', required: true, orden: 8 },
      { key: 'curp_adulto', tipo: 'curp', required: true, orden: 9, autocompleta_desde: 'padron_adulto' },
      { key: 'nombre_adulto', tipo: 'string', required: true, orden: 10, source: 'padron_adulto.nombre' },
      { key: 'apellido_paterno_adulto', tipo: 'string', required: true, orden: 11, source: 'padron_adulto.apellido_paterno' },
      { key: 'apellido_materno_adulto', tipo: 'string', required: true, orden: 12, source: 'padron_adulto.apellido_materno' },
      { key: 'calle', tipo: 'string', required: true, orden: 13 },
      { key: 'numero', tipo: 'string', required: true, orden: 14 },
      { key: 'codigo_postal', tipo: 'cp', required: true, orden: 15 },
      { key: 'municipio_id', tipo: 'catalogo_search', catalogo: 'municipios', required: true, orden: 16 },
      { key: 'colonia_id', tipo: 'catalogo_pick', catalogo: 'colonias', depende_de: 'codigo_postal', required: true, orden: 17 },
      { key: 'telefono', tipo: 'telefono_mx', required: true, orden: 18 },
      { key: 'correo', tipo: 'email', required: false, orden: 19 },
      { key: 'parentesco', tipo: 'catalogo_pick', catalogo: 'parentescos', required: true, orden: 20 },
      { key: 'acepta_aviso_privacidad', tipo: 'consentimiento', required: true, orden: 21 },
    ],
    catalogos: [
      { key: 'sedes', endpoint: '/sedes', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre', extra: ['direccion', 'fechas', 'horario'] } },
      { key: 'escuelas', endpoint: '/escuelas', method: 'GET', query_param: 'q', min_query_length: 3, response_items_path: 'data', item_fields: { id: 'id', label: 'nombre', extra: ['turno', 'nivel'] } },
      { key: 'grados', endpoint: '/escuelas/{escuela_id}/grados', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
      { key: 'municipios', endpoint: '/catalogos/municipios', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
      { key: 'colonias', endpoint: '/catalogos/colonias', method: 'GET', query_param: 'cp', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
      { key: 'parentescos', endpoint: '/catalogos/parentescos', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
    ],
    lookups: [
      { key: 'padron_estudiante', endpoint: '/padron/estudiante', method: 'GET', query_param: 'curp', response_fields: { nombre: 'nombre', apellido_paterno: 'apellido_paterno', apellido_materno: 'apellido_materno', fecha_nacimiento: 'fecha_nacimiento' }, not_found_action: 'reject' },
      { key: 'padron_adulto', endpoint: '/padron/adulto', method: 'GET', query_param: 'curp', response_fields: { nombre: 'nombre', apellido_paterno: 'apellido_paterno', apellido_materno: 'apellido_materno' }, not_found_action: 'reject' },
    ],
    submit: { endpoint: '/pre-solicitud', method: 'POST', response_folio_path: 'folio', response_success_status: [200, 201] },
    reglas_negocio: {
      allow_manual_capture_on_padron_miss: false,
      max_registros_por_sesion: 1,
      idempotency_fields: ['curp_estudiante', 'sede_id'],
    },
    aviso_privacidad_texto: 'Sus datos personales serán tratados por el Gobierno de Monterrey para efectos del pre-registro del Programa de Útiles Escolares 2026 y no serán compartidos con terceros. Puede consultar el aviso completo en el enlace que le enviaremos. ¿Autoriza este tratamiento?',
    aviso_privacidad_url: 'https://TODO-url-del-aviso-oficial.gob.mx',
  };

  const { data, error } = await supabase
    .from('external_tramites')
    .upsert(tramite, { onConflict: 'portal_email,slug' })
    .select('id, slug, activo')
    .single();

  if (error) throw new Error(error.message);
  console.log('OK:', data);
}

main().catch(e => { console.error(e); process.exit(1); });
