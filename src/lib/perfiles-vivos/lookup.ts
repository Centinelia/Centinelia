// Búsqueda y actualización de perfiles vivos.
//
// El match por teléfono es tolerante: normaliza a solo dígitos y compara los
// últimos 10 (formato mexicano) para que "8112345678", "+528112345678" y
// "52 811 234 5678" todos matcheen contra el mismo contacto.

import { createAdminClient } from '@/lib/supabase/admin';

export interface ContactoVivoLite {
  id:                       string;
  external_id:              string | null;
  nombre:                   string;
  telefono:                 string | null;
  correo:                   string | null;
  estado_actual:            string;
  datos_operacionales:      Record<string, unknown>;
  ultima_interaccion_at:    string | null;
  ultima_interaccion_tipo:  string | null;
  proxima_accion_at:        string | null;
  proxima_accion_tipo:      string | null;
  total_interacciones:      number;
  promesas_hechas:          number;
  promesas_cumplidas:       number;
  sentimiento_ultimo:       string | null;
  capacidad_pago_detectada: string | null;
  notas:                    string | null;
}

export interface InteraccionLite {
  id:              string;
  fecha:           string;
  tipo:            string;
  duracion_seg:    number | null;
  resumen:         string | null;
  sentimiento:    string | null;
  temas:           string[] | null;
  promesa_monto:   number | null;
  promesa_fecha:   string | null;
  proxima_accion:  string | null;
  escalado_a:      string | null;
}

export interface LookupOpts {
  telefono?:   string;
  correo?:     string;
  external_id?: string;
  nombre?:     string;              // fuzzy match como fallback
  maxHistorial?: number;            // últimas N interacciones (default 5)
}

export interface LookupResult {
  contacto:      ContactoVivoLite | null;
  interacciones: InteraccionLite[];
  matched_by:    'external_id' | 'telefono' | 'correo' | 'nombre' | null;
}

function last10Digits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  return digits.slice(-10);
}

export async function lookupContacto(portalEmail: string, opts: LookupOpts): Promise<LookupResult> {
  const supabase = createAdminClient();
  const maxHist  = opts.maxHistorial ?? 5;
  let contacto: ContactoVivoLite | null = null;
  let matched_by: LookupResult['matched_by'] = null;

  // 1. external_id (más preciso)
  if (opts.external_id) {
    const { data } = await supabase
      .from('contactos_vivos')
      .select('*')
      .eq('portal_email', portalEmail)
      .eq('external_id', opts.external_id)
      .maybeSingle();
    if (data) { contacto = data as ContactoVivoLite; matched_by = 'external_id'; }
  }

  // 2. Teléfono por sufijo de 10 dígitos
  if (!contacto && opts.telefono) {
    const suffix = last10Digits(opts.telefono);
    if (suffix) {
      const { data } = await supabase
        .rpc('lookup_contacto_by_phone_suffix', { p_portal_email: portalEmail, p_phone_suffix: suffix })
        .maybeSingle();
      // Fallback si la RPC no existe todavía: query directa
      if (data) { contacto = data as ContactoVivoLite; matched_by = 'telefono'; }
      else {
        // Query directa como fallback
        const { data: rows } = await supabase
          .from('contactos_vivos')
          .select('*')
          .eq('portal_email', portalEmail)
          .not('telefono', 'is', null);
        const match = (rows ?? []).find((r) => last10Digits(r.telefono as string) === suffix);
        if (match) { contacto = match as ContactoVivoLite; matched_by = 'telefono'; }
      }
    }
  }

  // 3. Correo (exacto, case-insensitive)
  if (!contacto && opts.correo) {
    const correoLower = opts.correo.toLowerCase().trim();
    const { data } = await supabase
      .from('contactos_vivos')
      .select('*')
      .eq('portal_email', portalEmail)
      .ilike('correo', correoLower)
      .maybeSingle();
    if (data) { contacto = data as ContactoVivoLite; matched_by = 'correo'; }
  }

  // 4. Nombre (fuzzy — último recurso)
  if (!contacto && opts.nombre && opts.nombre.trim().length >= 3) {
    const { data } = await supabase
      .from('contactos_vivos')
      .select('*')
      .eq('portal_email', portalEmail)
      .ilike('nombre', `%${opts.nombre.trim()}%`)
      .limit(1)
      .maybeSingle();
    if (data) { contacto = data as ContactoVivoLite; matched_by = 'nombre'; }
  }

  if (!contacto) return { contacto: null, interacciones: [], matched_by: null };

  const { data: interacciones } = await supabase
    .from('contactos_interacciones')
    .select('id, fecha, tipo, duracion_seg, resumen, sentimiento, temas, promesa_monto, promesa_fecha, proxima_accion, escalado_a')
    .eq('contacto_id', contacto.id)
    .order('fecha', { ascending: false })
    .limit(maxHist);

  return {
    contacto,
    interacciones: (interacciones ?? []) as InteraccionLite[],
    matched_by,
  };
}

export interface RegistrarInteraccionOpts {
  portalEmail:      string;
  contactoId:       string;
  tipo:             string;
  meerkatId?:       string;
  canal_ref_id?:    string;
  duracion_seg?:    number;
  resumen?:         string;
  sentimiento?:     string;
  temas?:           string[];
  promesa_monto?:   number;
  promesa_fecha?:   string;         // YYYY-MM-DD
  proxima_accion?:  string;
  escalado_a?:      string;
  raw_transcript?:  string;
}

export async function registrarInteraccion(opts: RegistrarInteraccionOpts): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('contactos_interacciones')
    .insert({
      contacto_id:    opts.contactoId,
      portal_email:   opts.portalEmail,
      tipo:           opts.tipo,
      canal_ref_id:   opts.canal_ref_id ?? null,
      meerkat_id:     opts.meerkatId ?? null,
      duracion_seg:   opts.duracion_seg ?? null,
      resumen:        opts.resumen ?? null,
      sentimiento:    opts.sentimiento ?? null,
      temas:          opts.temas ?? null,
      promesa_monto:  opts.promesa_monto ?? null,
      promesa_fecha:  opts.promesa_fecha ?? null,
      proxima_accion: opts.proxima_accion ?? null,
      escalado_a:     opts.escalado_a ?? null,
      raw_transcript: opts.raw_transcript ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Registrar interacción error: ${error.message}`);
  return { id: data.id as string };
}

export interface ActualizarEstadoOpts {
  portalEmail:              string;
  contactoId:               string;
  estado_actual?:           string;
  proxima_accion_at?:       string;
  proxima_accion_tipo?:     string;
  capacidad_pago_detectada?:string;
  notas?:                   string;
  promesa_cumplida?:        boolean;   // incrementa contador si true
}

export async function actualizarContactoEstado(opts: ActualizarEstadoOpts): Promise<void> {
  const supabase = createAdminClient();

  // Primero: si promesa_cumplida, incrementamos el contador con RPC/expr para no race.
  if (opts.promesa_cumplida) {
    // Incremento atómico si existe la RPC; si no, fallback read-modify-write.
    const rpcResult = await supabase.rpc('incr_promesas_cumplidas', { p_contacto_id: opts.contactoId });
    if (rpcResult.error) {
      const { data } = await supabase.from('contactos_vivos').select('promesas_cumplidas').eq('id', opts.contactoId).single();
      const cur = (data?.promesas_cumplidas as number) ?? 0;
      await supabase.from('contactos_vivos').update({ promesas_cumplidas: cur + 1 }).eq('id', opts.contactoId);
    }
  }

  const patch: Record<string, unknown> = {};
  if (opts.estado_actual !== undefined)            patch.estado_actual            = opts.estado_actual;
  if (opts.proxima_accion_at !== undefined)        patch.proxima_accion_at        = opts.proxima_accion_at;
  if (opts.proxima_accion_tipo !== undefined)      patch.proxima_accion_tipo      = opts.proxima_accion_tipo;
  if (opts.capacidad_pago_detectada !== undefined) patch.capacidad_pago_detectada = opts.capacidad_pago_detectada;
  if (opts.notas !== undefined)                    patch.notas                    = opts.notas;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('contactos_vivos').update(patch).eq('id', opts.contactoId).eq('portal_email', opts.portalEmail);
    if (error) throw new Error(`Actualizar contacto error: ${error.message}`);
  }
}
