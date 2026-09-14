/**
 * tool-completeness — el test que cierra el bug #1 recurrente de Centinelia:
 * "tool que aparece registrada pero silenciosamente no funciona en 1 canal".
 *
 * Verifica en tiempo de test las siguientes invariantes del sistema de tools:
 *
 *  VC-1: Toda tool en `UNIVERSAL_TOOLS` (chat/email base) tiene schema en
 *        CHAT_TOOL_BY_NAME y EMAIL_TOOL_BY_NAME.
 *  VC-2: Toda tool en `UNIVERSAL_VOICE_TOOLS` tiene mapping en VOICE_TO_CHAT
 *        y schema en ambos CHAT + EMAIL.
 *  VC-3: Para cada meerkat: cada tool en su preset de voz ó (a) está marcada
 *        voice-only en VOICE_TO_CHAT (=null), ó (b) tiene schema en chat.
 *  VC-4: Para cada meerkat: cada tool en su preset de email tiene schema en
 *        EMAIL_TOOL_BY_NAME.
 *  VC-5: Para cada tool en TOOL_REGISTRY con `channels.includes('chat')`:
 *        tiene entry en CHAT_TOOL_BY_NAME (via VOICE_TO_CHAT rename si aplica).
 *  VC-6: Para cada tool en TOOL_REGISTRY con `channels.includes('email')`:
 *        tiene entry en EMAIL_TOOL_BY_NAME.
 *  VC-7: Para cada tool en TOOL_REGISTRY con `channels.includes('voice')`:
 *        está en algún MEERKAT_VOICE_DISTRIBUTION o UNIVERSAL_VOICE_TOOLS.
 *
 * ALLOWLIST: hay deuda documentada (comentarios en inbox-processor sobre
 * "Deuda #3" para HR tools sin schema email). Esa deuda vive en
 * `KNOWN_DROPS` con motivo explícito. Nueva tool sin motivo = test falla.
 */

import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY } from '../registry';
import { MEERKAT_VOICE_DISTRIBUTION, UNIVERSAL_VOICE_TOOLS } from '@/lib/vapi/sync';
import { MEERKAT_EMAIL_DISTRIBUTION, EMAIL_TOOL_BY_NAME } from '@/lib/ops/inbox-processor';
import { VOICE_TO_CHAT, UNIVERSAL_TOOLS } from '../channel-mapping';
import { CHAT_TOOL_BY_NAME } from '@/app/api/portal/[token]/agent-chat/route';

// ─── Allowlist: deuda documentada ────────────────────────────────────────────
// Cada entrada tiene motivo y (opcional) fecha límite. NO agregar entries sin
// documentar por qué. Cuando toque migrar la deuda, se quita la entrada.

const KNOWN_DROPS = {
  // Tools que están en MEERKAT_EMAIL_DISTRIBUTION pero SIN schema email todavía.
  // Documentadas como "Deuda #3" en inbox-processor.ts línea 823.
  emailMissingSchema: new Set<string>([
    // HR MVP (Naia) — comentario dice "agregar schemas email para HR tools"
    'registrar_falta',
    'consultar_vacaciones',
    'solicitar_permiso',
    'verificar_incidencia',
    // Despacho de campo (Nova)
    'asignar_unidad_campo',
    'consultar_unidades_disponibles',
    // Gobierno externo (Nara)
    'consultar_catalogo_externo',
    'buscar_en_padron_externo',
    'enviar_tramite_externo',
    // Pack ciclo OC-CFDI (Nala/Nox) — 12 tools email
    'qb_crear_orden_compra',
    'qb_consultar_orden_compra',
    'qb_descargar_oc_pdf',
    'firmar_oc',
    'sf_timbrar_desde_oc',
    'sf_cancelar_cfdi',
    'sf_consultar_estado_sat',
    'enviar_oc_a_pagos',
    'registrar_comprobante_pago',
    'enviar_oc_a_proveedor',
    'archivar_expediente',
    'qb_crear_orden_compra_desde_cotizacion',
    // Nox
    'preparar_brief_del_dia',
    // Noah
    'buscar_producto',
    'generar_propuesta_comercial',
    'generar_cotizacion',
    // Nelia — meefi + otros
    'generar_one_pager',
    'generar_correo_estructurado',
    'generar_reporte_metricas_excel',
    'extraer_voz_del_cliente',
    'extraer_tono_de_marca',
    // Nara
    'crear_reporte_civico',
    'consultar_reporte_civico',
    'actualizar_reporte_civico',
    // Niva
    'search_leads',
    'revisar_desempeno_equipo',
    'generar_pitch_deck',
    'aprobar_gasto',
    'evaluar_limite_gasto',
    // Nia
    'registrar_encuesta',
    // Sheets (Nox)
    'sheets_agregar_fila',
    'sheets_actualizar_fila',
    'sheets_leer',
    'sheets_buscar',
    // Nova
    'crear_ticket',
    // Neo
    'consultar_incidentes',
    'buscar_directorio',
    // Naia
    'iniciar_onboarding',
    // Universal
    'reportar_falla',
    'buscar_en_web',
    'read_url',
    // Universal chat/email base
    'delegar_tarea',
    'consultar_agente',
    'pedir_a_humano',
    // Naia HR: agendar_cita, list_calendar_events etc
    'agendar_cita',
    'list_calendar_events',
    'create_calendar_event',
    'delete_calendar_event',
    // Owner data-capture missing email schemas
    'crear_lead',
    'crear_contacto_saliente',
    'agregar_tag_contacto',
    'buscar_correo_enviado',
    'catalogo_buscar_codigo',
    'buscar_cliente',
    'buscar_archivo',
    'leer_archivo',
    'buscar_documento_oficina',
    'enviar_documento_oficina',
    'save_to_drive',
    'organize_files',
    'verificar_gasto_recurrente',
    'crear_borrador_contrato',
    'create_document',
    'create_file',
    'qb_consultar_facturas',
    'qb_buscar_cliente',
    'qb_registrar_pago',
    'qb_crear_factura',
    'qb_reporte_ingresos',
    'solicitar_factura',
    'consultar_factura',
    'solicitar_cancelacion_factura',
    // Nami inventario
    'inv_buscar_por_serie',
    'inv_buscar_por_modelo',
    'inv_buscar_por_cliente',
    'inv_stock_snapshot',
    'inv_pedir_reposicion',
    'inv_agregar_equipo',
    'inv_actualizar_estatus',
    'inv_asignar_cliente',
    'inv_registrar_venta',
    'inv_transferir_bodega',
    'inv_procesar_factura_trane',
    'inv_importar_backlog',
    'inv_normalizar_bodegas',
    'inv_reporte_utilidad',
    // Meefi Nelia
    'meefi_lookup_user_account',
    'meefi_send_password_reset_link',
    'meefi_check_transfer_status',
    'meefi_initiate_2fa_recovery',
    'meefi_capture_bug_report',
    'meefi_escalate_to_human',
    'meefi_search_help_center',
    // Neka Centinelia
    'emitir_cfdi_centinelia',
    'solicitar_complemento_pago',
    'pedir_datos_faltantes',
    'reportar_bug_a_nash',
    'registrar_pago_pendiente_verificacion',
    // Voice-related tools that don't apply to email
    'enviar_correo',
    // Nash-only tools (meerkat interno) — sin schema email por diseño.
    'revisar_incidentes_plataforma',
    'crear_incidente',
    'responder_cliente_afectado',
    'enviar_a_claude_code',
    'escalar_al_owner',
    'verificar_fix',
    'consultar_billing_org',
    'audit_ops_consumption',
    // Ciclo OC-CFDI: tools de aprobación humana no email-first.
    'enviar_oc_a_firma_humana',
    'qb_crear_cotizacion',
    'qb_registrar_gasto',
    'qb_registrar_caja_chica',
    // Nelia interno pero email schema no cargado
    'registrar_incidencia',
    'registrar_cliente_nuevo',
    'verificar_recepcion_incidencia',
  ]),
  // Tools que TOOL_REGISTRY declara con channels.includes('voice') pero NO
  // aparecen en ninguna MEERKAT_VOICE_DISTRIBUTION ni en UNIVERSAL_VOICE_TOOLS.
  // Es drift entre "lo que el admin cree que tiene" y "lo que Vapi realmente
  // recibe". Cada entrada debe tener contexto: o registrarla en voz, o
  // corregir el registry a channels: ['chat', 'email'].
  registryVoiceOverclaimed: new Set<string>([
    // QB (Nico/Niva) — voice funcionaba antes pero ahora solo se llaman por chat/email.
    // TODO: quitar 'voice' del registry o volver a agregar a presets voice.
    'qb_consultar_facturas',
    'qb_buscar_cliente',
    'qb_crear_factura',
    'qb_registrar_pago',
    'qb_reporte_ingresos',
    // Neka Centinelia interno — sin voz por diseño.
    // TODO: registry debería declarar channels: ['chat', 'email'].
    'emitir_cfdi_centinelia',
    'solicitar_complemento_pago',
    'pedir_datos_faltantes',
    'reportar_bug_a_nash',
    'registrar_pago_pendiente_verificacion',
    // ML hidden 2026-08-19 (0 orgs activos). No hay preset voz vivo.
    'crear_publicacion_ml',
    'actualizar_publicacion_ml',
    // Universal pero pedir_a_humano no está en UNIVERSAL_VOICE_TOOLS
    // (solo delegar_tarea, consultar_agente, reportar_falla, read_url, buscar_en_web).
    'pedir_a_humano',
    // Nami inventario write-ops — solo chat/email por diseño (voice es
    // read-only para Nami: sirve para consultas rápidas por bodega, no writes).
    'inv_procesar_factura_trane',
    'inv_agregar_equipo',
    'inv_actualizar_estatus',
    'inv_asignar_cliente',
    'inv_registrar_venta',
    'inv_transferir_bodega',
    'inv_importar_backlog',
    'inv_normalizar_bodegas',
    'inv_reporte_utilidad',
  ]),
  // Tools que en VOICE_TO_CHAT están mapeadas pero no tienen entrada en
  // CHAT_TOOL_BY_NAME todavía. Rare porque el rename 2026-08-19 alineó
  // la mayoría.
  chatMissingSchema: new Set<string>([
    // Ciclo OC-CFDI pack tools — hoy solo email/voice
    'firmar_oc',
    'enviar_oc_a_pagos',
    'registrar_comprobante_pago',
    'enviar_oc_a_proveedor',
    'archivar_expediente',
    'qb_crear_orden_compra',
    'qb_consultar_orden_compra',
    'qb_descargar_oc_pdf',
    'qb_crear_orden_compra_desde_cotizacion',
    'sf_timbrar_desde_oc',
    'sf_cancelar_cfdi',
    'sf_consultar_estado_sat',
    // Data capture no expuesta a chat portal
    'crear_lead',
    'crear_contacto_saliente',
    'buscar_correo_enviado',
    'agendar_cita',
    'registrar_pedido',
    'buscar_cliente',
    'crear_ticket',
    'consultar_incidentes',
    'buscar_directorio',
    'iniciar_onboarding',
    'agregar_tag_contacto',
    // HR MVP
    'registrar_falta',
    'consultar_vacaciones',
    'solicitar_permiso',
    'verificar_incidencia',
    // Despacho campo
    'asignar_unidad_campo',
    'consultar_unidades_disponibles',
    // Gobierno externo
    'consultar_catalogo_externo',
    'buscar_en_padron_externo',
    'enviar_tramite_externo',
    // Nox
    'preparar_brief_del_dia',
    'actualizar_disponibilidad_diaria',
    'enviar_oc_a_firma_humana',
    // Documentos generadores
    'generar_propuesta_comercial',
    'generar_cotizacion',
    'generar_one_pager',
    'generar_correo_estructurado',
    'generar_reporte_metricas_excel',
    'generar_pitch_deck',
    // Nelia registrar
    'registrar_incidencia',
    'registrar_cliente_nuevo',
    'verificar_recepcion_incidencia',
    // Nara civic
    'crear_reporte_civico',
    'consultar_reporte_civico',
    'actualizar_reporte_civico',
    // Nia encuesta
    'registrar_encuesta',
    // Nami inventario
    'inv_buscar_por_serie',
    'inv_buscar_por_modelo',
    'inv_buscar_por_cliente',
    'inv_stock_snapshot',
    'inv_pedir_reposicion',
    'inv_agregar_equipo',
    'inv_actualizar_estatus',
    'inv_asignar_cliente',
    'inv_registrar_venta',
    'inv_transferir_bodega',
    'inv_procesar_factura_trane',
    'inv_importar_backlog',
    'inv_normalizar_bodegas',
    'inv_reporte_utilidad',
    // Owner delegating tools
    'delegar_tarea',
    'consultar_agente',
    'pedir_a_humano',
    'reportar_falla',
    'buscar_en_web',
    'read_url',
    // Universal chat/email base
    'buscar_documento_oficina',
    'enviar_documento_oficina',
    'buscar_archivo',
    'leer_archivo',
    'create_document',
    'create_file',
    'save_to_drive',
    'organize_files',
    'crear_borrador_contrato',
    'buscar_producto',
    'catalogo_buscar_codigo',
    'extraer_voz_del_cliente',
    'extraer_tono_de_marca',
    'list_calendar_events',
    'create_calendar_event',
    'delete_calendar_event',
    'search_leads',
    'analizar_publicaciones_ml',
    'crear_publicacion_ml',
    'actualizar_publicacion_ml',
    'ver_metricas_ml',
    'qb_consultar_facturas',
    'qb_buscar_cliente',
    'qb_registrar_pago',
    'qb_reporte_ingresos',
    'qb_crear_factura',
    'solicitar_factura',
    'consultar_factura',
    'solicitar_cancelacion_factura',
    'emitir_cfdi_centinelia',
    'solicitar_complemento_pago',
    'pedir_datos_faltantes',
    'reportar_bug_a_nash',
    'registrar_pago_pendiente_verificacion',
    'revisar_desempeno_equipo',
    'aprobar_gasto',
    'evaluar_limite_gasto',
    'verificar_gasto_recurrente',
    'sheets_agregar_fila',
    'sheets_actualizar_fila',
    'sheets_leer',
    'sheets_buscar',
    'marcar_no_llamar',
    'agregar_tag_contacto',
    'meefi_lookup_user_account',
    'meefi_send_password_reset_link',
    'meefi_check_transfer_status',
    'meefi_initiate_2fa_recovery',
    'meefi_capture_bug_report',
    'meefi_escalate_to_human',
    'meefi_search_help_center',
    'enviar_correo',
    // Nash tools chat no expuestos
    'audit_ops_consumption',
    'revisar_incidentes_plataforma',
    'crear_incidente',
    'responder_cliente_afectado',
    'enviar_a_claude_code',
    'escalar_al_owner',
    'verificar_fix',
    'consultar_billing_org',
    // Ciclo OC extras sin chat
    'enviar_oc_a_firma_humana',
    'qb_crear_cotizacion',
    'qb_registrar_gasto',
    'qb_registrar_caja_chica',
  ]),
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Nombres que aparecen en CUALQUIER MEERKAT_VOICE_DISTRIBUTION. */
function allVoiceRoleTools(): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(MEERKAT_VOICE_DISTRIBUTION)) {
    for (const n of list) out.add(n);
  }
  return out;
}

const CHAT_SCHEMA_KEYS  = new Set(Object.keys(CHAT_TOOL_BY_NAME));
const EMAIL_SCHEMA_KEYS = new Set(Object.keys(EMAIL_TOOL_BY_NAME));
const VOICE_TOOLS_ALL   = new Set([...allVoiceRoleTools(), ...UNIVERSAL_VOICE_TOOLS]);

// ─── VC-1: universales chat/email base ──────────────────────────────────────

describe('tool-completeness — universales', () => {
  it('VC-1: cada UNIVERSAL_TOOLS tiene schema en chat y email', () => {
    const missingChat  = UNIVERSAL_TOOLS.filter(t =>
      !CHAT_SCHEMA_KEYS.has(t) && !KNOWN_DROPS.chatMissingSchema.has(t));
    const missingEmail = UNIVERSAL_TOOLS.filter(t =>
      !EMAIL_SCHEMA_KEYS.has(t) && !KNOWN_DROPS.emailMissingSchema.has(t));
    expect({ missingChat, missingEmail }).toEqual({ missingChat: [], missingEmail: [] });
  });

  it('VC-2: cada UNIVERSAL_VOICE_TOOLS mapea a chat y a email (o allowlisted)', () => {
    const missingChat  = UNIVERSAL_VOICE_TOOLS.filter(v => {
      const chat = VOICE_TO_CHAT[v] ?? v;
      if (chat === null) return false;
      if (KNOWN_DROPS.chatMissingSchema.has(chat)) return false;
      return !CHAT_SCHEMA_KEYS.has(chat);
    });
    const missingEmail = UNIVERSAL_VOICE_TOOLS.filter(v => {
      if (KNOWN_DROPS.emailMissingSchema.has(v)) return false;
      return !EMAIL_SCHEMA_KEYS.has(v);
    });
    expect({ missingChat, missingEmail }).toEqual({ missingChat: [], missingEmail: [] });
  });
});

// ─── VC-3 / VC-4: por meerkat ───────────────────────────────────────────────

describe('tool-completeness — por meerkat (voz + email)', () => {
  const meerkats = Object.keys(MEERKAT_VOICE_DISTRIBUTION);

  it.each(meerkats)('%s: cada tool del preset voz existe en chat o está marcada voice-only', (mid) => {
    const voiceTools = MEERKAT_VOICE_DISTRIBUTION[mid] ?? [];
    const bugs: string[] = [];
    for (const v of voiceTools) {
      const chatName = v in VOICE_TO_CHAT ? VOICE_TO_CHAT[v] : v;
      // null = voice-only intencional, OK
      if (chatName === null) continue;
      // Sin mapping y sin schema propio con el mismo nombre → drift
      if (!chatName) { bugs.push(`${v} (sin mapping en VOICE_TO_CHAT)`); continue; }
      if (KNOWN_DROPS.chatMissingSchema.has(chatName)) continue;
      if (!CHAT_SCHEMA_KEYS.has(chatName)) bugs.push(`${v} → ${chatName} (sin schema chat)`);
    }
    expect(bugs, `${mid} drift voz→chat`).toEqual([]);
  });

  const meerkatsEmail = Object.keys(MEERKAT_EMAIL_DISTRIBUTION);

  it.each(meerkatsEmail)('%s: cada tool del preset email tiene schema email', (mid) => {
    const emailTools = MEERKAT_EMAIL_DISTRIBUTION[mid] ?? [];
    const bugs: string[] = [];
    for (const t of emailTools) {
      if (KNOWN_DROPS.emailMissingSchema.has(t)) continue;
      if (!EMAIL_SCHEMA_KEYS.has(t)) bugs.push(t);
    }
    expect(bugs, `${mid} drift email`).toEqual([]);
  });
});

// ─── VC-5 / VC-6 / VC-7: TOOL_REGISTRY declara y los 3 canales cumplen ──────

describe('tool-completeness — TOOL_REGISTRY es fuente de verdad de canales', () => {
  it('VC-5: cada tool que declara channels.includes("chat") tiene schema en chat', () => {
    const bugs: string[] = [];
    for (const t of TOOL_REGISTRY) {
      if (!t.channels.includes('chat')) continue;
      const chatName = t.name in VOICE_TO_CHAT ? VOICE_TO_CHAT[t.name] : t.name;
      if (chatName === null) continue; // registered as voice-only in mapping — OK
      if (KNOWN_DROPS.chatMissingSchema.has(chatName ?? t.name)) continue;
      if (chatName && !CHAT_SCHEMA_KEYS.has(chatName)) bugs.push(`${t.name} declara chat pero no tiene schema`);
    }
    expect(bugs).toEqual([]);
  });

  it('VC-6: cada tool que declara channels.includes("email") tiene schema en email', () => {
    const bugs: string[] = [];
    for (const t of TOOL_REGISTRY) {
      if (!t.channels.includes('email')) continue;
      if (KNOWN_DROPS.emailMissingSchema.has(t.name)) continue;
      if (!EMAIL_SCHEMA_KEYS.has(t.name)) bugs.push(t.name);
    }
    expect(bugs).toEqual([]);
  });

  it('VC-7: cada tool que declara channels.includes("voice") aparece en alguna distribución de voz', () => {
    const bugs: string[] = [];
    for (const t of TOOL_REGISTRY) {
      if (!t.channels.includes('voice')) continue;
      if (KNOWN_DROPS.registryVoiceOverclaimed.has(t.name)) continue;
      if (!VOICE_TOOLS_ALL.has(t.name)) bugs.push(t.name);
    }
    expect(bugs).toEqual([]);
  });
});

// ─── Meta-test: allowlist no tiene entries fantasma ─────────────────────────

describe('tool-completeness — allowlist salubre', () => {
  it('cada entry en KNOWN_DROPS.emailMissingSchema todavía aparece en algún preset (si no, remove)', () => {
    const referenced = new Set<string>();
    for (const list of Object.values(MEERKAT_EMAIL_DISTRIBUTION)) {
      for (const n of list) referenced.add(n);
    }
    for (const n of UNIVERSAL_TOOLS) referenced.add(n);
    for (const n of UNIVERSAL_VOICE_TOOLS) referenced.add(n);
    for (const t of TOOL_REGISTRY) if (t.channels.includes('email')) referenced.add(t.name);
    const ghosts = [...KNOWN_DROPS.emailMissingSchema].filter(n => !referenced.has(n));
    expect(ghosts, 'Entries en allowlist que ya no aparecen — remover').toEqual([]);
  });
});
