/**
 * Adapter de archivado para el pack ciclo_oc_cfdi.
 *
 * Destinos soportados:
 *  - 'dropbox'       → subida directa via DropboxClient (real, síncrono)
 *  - 'smb_local'     → marca pending, un Windows agent externo hace pull vía SMB
 *  - 'windows_agent' → marca pending, el Windows agent del PR #12 hace pull local
 *
 * Placeholders de nomenclatura soportados:
 *  {año} {mes} {proveedor} {folio} {fecha} {uuid} {tipo}
 * `{tipo}` = 'oc' | 'oc_firmada' | 'cfdi_xml' | 'cfdi_pdf' | 'cfdi_acuse'
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DropboxClient } from '@/lib/billing/storage/dropbox';

export interface ArchivoConfig {
  archivado_destino?:      'dropbox' | 'smb_local' | 'windows_agent';
  archivado_root?:         string;
  archivado_nomenclatura?: string;
}

export interface ArchivoInput {
  portalEmail:      string;
  expedienteId:     string;
  proveedorNombre:  string | null;
  qbPoFolio:        string | null;
  cfdiUuid:         string | null;
  fechaTimbrado:    Date;
  files: Array<{
    tipo:   'oc' | 'oc_firmada' | 'cfdi_xml' | 'cfdi_pdf' | 'cfdi_acuse';
    ext:    'pdf' | 'xml';
    /** Path en Storage (bucket `cfdi`) para descarga. */
    srcPath: string;
  }>;
}

export interface ArchivoResult {
  ok:              boolean;
  destino:         string;
  archivados:      Array<{ tipo: string; ruta_destino: string; pending?: boolean }>;
  error?:          string;
}

const DEFAULT_NOMENCLATURA = '{año}/{mes}/{proveedor}/{folio}_{fecha}_{tipo}.{ext}';

function slug(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

async function loadDropboxToken(portalEmail: string, supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', portalEmail)
    .eq('provider', 'dropbox')
    .maybeSingle();
  const cfg = (data?.config as { dropbox_token?: string; access_token?: string } | null) ?? null;
  return cfg?.dropbox_token ?? cfg?.access_token ?? null;
}

export async function archivarExpediente(
  input:    ArchivoInput,
  config:   ArchivoConfig,
  supabase: SupabaseClient,
): Promise<ArchivoResult> {
  const destino  = config.archivado_destino;
  if (!destino) return { ok: false, destino: 'none', archivados: [], error: 'No hay destino de archivado configurado.' };

  const nomencla = config.archivado_nomenclatura ?? DEFAULT_NOMENCLATURA;
  const root     = (config.archivado_root ?? '').replace(/\/$/, '');

  const fecha = input.fechaTimbrado.toISOString().slice(0, 10); // YYYY-MM-DD
  const año   = String(input.fechaTimbrado.getFullYear());
  const mes   = String(input.fechaTimbrado.getMonth() + 1).padStart(2, '0');

  const archivados: ArchivoResult['archivados'] = [];

  for (const f of input.files) {
    const rutaRelativa = fillPlaceholders(nomencla, {
      año,
      mes,
      proveedor: slug(input.proveedorNombre ?? 'sin_proveedor'),
      folio:     slug(input.qbPoFolio ?? input.expedienteId.slice(0, 8)),
      fecha,
      uuid:      input.cfdiUuid ?? '',
      tipo:      f.tipo,
      ext:       f.ext,
    });
    const rutaFinal = `${root}/${rutaRelativa}`.replace(/\/+/g, '/');

    if (destino === 'dropbox') {
      const token = await loadDropboxToken(input.portalEmail, supabase);
      if (!token) return { ok: false, destino, archivados, error: 'Dropbox no está conectado en organization_integrations.' };
      const dbx = new DropboxClient(token);

      // Descargar de Storage y subir a Dropbox
      const dl = await supabase.storage.from('cfdi').download(f.srcPath);
      if (dl.error || !dl.data) return { ok: false, destino, archivados, error: `Storage download ${f.srcPath}: ${dl.error?.message}` };
      const buf = Buffer.from(await dl.data.arrayBuffer());

      // Dropbox exige path que empiece con /
      const dbxPath = rutaFinal.startsWith('/') ? rutaFinal : `/${rutaFinal}`;
      try {
        const finalPath = await dbx.writeFile(dbxPath, buf);
        archivados.push({ tipo: f.tipo, ruta_destino: finalPath });
      } catch (err) {
        return { ok: false, destino, archivados, error: `Dropbox upload ${dbxPath}: ${(err as Error).message}` };
      }
    }
    else {
      // smb_local / windows_agent: el agent externo hace pull. Marcamos como pending
      // con la ruta calculada. Un cron o el agent se encarga del transfer real.
      archivados.push({ tipo: f.tipo, ruta_destino: rutaFinal, pending: true });
    }
  }

  return { ok: true, destino, archivados };
}
