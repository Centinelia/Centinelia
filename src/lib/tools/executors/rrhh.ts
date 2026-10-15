/**
 * Executor del pack hr_nomina (Naia + RRHH + reloj checador).
 * Delegado desde src/lib/tools/executor.ts cuando toolName.startsWith('rrhh_').
 *
 * Las 5 tools se activan via SKILL_PACKS pack 'hr_nomina' cuando la org
 * tiene organizations.features.rrhh_nomina_v1 = true. Defense-in-depth:
 * aquí se re-verifica el flag + idealmente la whitelist por correo del
 * caller (operadora autorizada).
 *
 * Spec: .brain/skills/naia-reloj-checador-ac-proyectos.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentToolContext } from '../executor';
import { procesarQuincena } from '@/lib/rrhh/process-quincena';

export const RRHH_TOOL_NAMES = new Set([
  'rrhh_registrar_empleado',
  'rrhh_dar_baja_empleado',
  'rrhh_registrar_descansos_mensuales',
  'rrhh_registrar_vacaciones_autorizadas',
  'rrhh_procesar_quincena_desde_excel',
]);

interface OrgRow {
  features: Record<string, unknown> | null;
  rrhh_authorized_operators: string[] | null;
}

async function assertFlagEnabled(supabase: SupabaseClient, portalEmail: string): Promise<{ ok: true; org: OrgRow } | { ok: false; error: string }> {
  const { data: org } = await supabase
    .from('organizations')
    .select('features, rrhh_authorized_operators')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  const row = (org as OrgRow | null) ?? { features: null, rrhh_authorized_operators: null };
  const flag = row.features?.rrhh_nomina_v1 === true;
  if (!flag) return { ok: false, error: 'La capacidad de RRHH nómina no está activa para esta organización. Pide a Centinelia activarla.' };
  return { ok: true, org: row };
}

function iso10(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function executeRrhhTool(
  toolName:  string,
  toolInput: Record<string, unknown>,
  ctx:       AgentToolContext,
): Promise<unknown> {
  const { supabase, portalEmail } = ctx;

  const gate = await assertFlagEnabled(supabase, portalEmail);
  if (!gate.ok) return { ok: false, error: gate.error };

  const actor = ctx.agentName ?? 'Naia';

  // ─── rrhh_registrar_empleado ────────────────────────────────────────────
  if (toolName === 'rrhh_registrar_empleado') {
    const relojId      = String(toolInput.reloj_id ?? '').trim();
    const nombre       = String(toolInput.nombre   ?? '').trim();
    const horaEntrada  = typeof toolInput.hora_entrada === 'string' && /^\d{2}:\d{2}$/.test(toolInput.hora_entrada) ? toolInput.hora_entrada : null;
    const nota         = typeof toolInput.nota === 'string' ? toolInput.nota.trim() : null;
    const parseMoney = (raw: unknown, label: string): { ok: true; val: number | null } | { ok: false; error: string } => {
      if (raw === undefined || raw === null || raw === '') return { ok: true, val: null };
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,$\s]/g, ''));
      if (!isFinite(n) || n < 0) return { ok: false, error: `${label} inválido (debe ser número positivo en pesos).` };
      return { ok: true, val: n };
    };
    const parsedSueldo = parseMoney(toolInput.sueldo_diario ?? toolInput.sueldo_diario_mxn, 'sueldo_diario');
    if (!parsedSueldo.ok) return { ok: false, error: parsedSueldo.error };
    const parsedRetBase = parseMoney(toolInput.monto_retardo_base ?? toolInput.monto_retardo_base_mxn, 'monto_retardo_base');
    if (!parsedRetBase.ok) return { ok: false, error: parsedRetBase.error };
    const parsedRetDoble = parseMoney(toolInput.monto_retardo_doble ?? toolInput.monto_retardo_doble_mxn, 'monto_retardo_doble');
    if (!parsedRetDoble.ok) return { ok: false, error: parsedRetDoble.error };
    const sueldoDiario       = parsedSueldo.val;
    const montoRetardoBase   = parsedRetBase.val;
    const montoRetardoDoble  = parsedRetDoble.val;
    if (!relojId) return { ok: false, error: 'reloj_id es requerido (número del empleado en el reloj).' };
    if (!nombre)  return { ok: false, error: 'nombre es requerido.' };

    const payload: Record<string, unknown> = {
      portal_email:   portalEmail,
      reloj_id:       relojId,
      nombre,
      activo:         true,
      registrado_por: actor,
      nota,
    };
    if (horaEntrada)                payload.hora_entrada            = horaEntrada;
    if (sueldoDiario !== null)      payload.sueldo_diario_mxn       = sueldoDiario;
    if (montoRetardoBase !== null)  payload.monto_retardo_base_mxn  = montoRetardoBase;
    if (montoRetardoDoble !== null) payload.monto_retardo_doble_mxn = montoRetardoDoble;

    const { data, error } = await supabase.from('rrhh_empleados')
      .upsert(payload, { onConflict: 'portal_email,reloj_id' })
      .select('id, reloj_id, nombre, hora_entrada, sueldo_diario_mxn, monto_retardo_base_mxn, monto_retardo_doble_mxn')
      .single();
    if (error) return { ok: false, error: error.message };

    const partes: string[] = [`Empleado "${data?.nombre}" registrado con ID de reloj ${data?.reloj_id} y hora de entrada ${data?.hora_entrada}.`];
    if (data?.sueldo_diario_mxn)       partes.push(`Sueldo diario: $${Number(data.sueldo_diario_mxn).toFixed(2)}.`);
    else                               partes.push('Sueldo diario pendiente (necesario para calcular faltas).');
    if (data?.monto_retardo_base_mxn || data?.monto_retardo_doble_mxn) {
      const base  = data.monto_retardo_base_mxn  ? `$${Number(data.monto_retardo_base_mxn).toFixed(2)}` : '(global)';
      const doble = data.monto_retardo_doble_mxn ? `$${Number(data.monto_retardo_doble_mxn).toFixed(2)}` : '(global)';
      partes.push(`Montos retardo propios: base ${base}, doble ${doble}.`);
    }
    return {
      ok: true,
      empleado_id: data?.id,
      message: partes.join(' '),
    };
  }

  // ─── rrhh_dar_baja_empleado ─────────────────────────────────────────────
  if (toolName === 'rrhh_dar_baja_empleado') {
    const relojId = String(toolInput.reloj_id ?? '').trim();
    const nota    = typeof toolInput.nota === 'string' ? toolInput.nota.trim() : null;
    if (!relojId) return { ok: false, error: 'reloj_id es requerido.' };

    const { data, error } = await supabase.from('rrhh_empleados')
      .update({ activo: false, dado_baja_at: new Date().toISOString(), dado_baja_por: actor, ...(nota ? { nota } : {}) })
      .eq('portal_email', portalEmail)
      .eq('reloj_id', relojId)
      .select('nombre')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: `No encontré empleado con reloj_id ${relojId} en esta organización.` };
    return { ok: true, message: `Empleado "${data.nombre}" dado de baja. Sigue en el histórico pero ya no se contabiliza en cálculos.` };
  }

  // ─── rrhh_registrar_descansos_mensuales ─────────────────────────────────
  if (toolName === 'rrhh_registrar_descansos_mensuales') {
    const anio = Number(toolInput.anio);
    const mes  = Number(toolInput.mes);
    const descansos = Array.isArray(toolInput.descansos) ? toolInput.descansos as Array<{ reloj_id?: unknown; fechas?: unknown }> : null;
    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return { ok: false, error: 'anio inválido.' };
    if (!Number.isInteger(mes)  || mes  < 1    || mes  > 12  ) return { ok: false, error: 'mes inválido (1-12).' };
    if (!descansos || !descansos.length) return { ok: false, error: 'descansos debe ser un arreglo con al menos un empleado.' };

    const relojIds = descansos.map(d => String(d.reloj_id ?? '').trim()).filter(Boolean);
    if (!relojIds.length) return { ok: false, error: 'Ningún reloj_id válido en descansos.' };

    const { data: emps, error: empErr } = await supabase
      .from('rrhh_empleados')
      .select('id, reloj_id')
      .eq('portal_email', portalEmail)
      .in('reloj_id', relojIds);
    if (empErr) return { ok: false, error: empErr.message };
    const empByReloj = new Map((emps ?? []).map(e => [String((e as { reloj_id: string }).reloj_id), (e as { id: string }).id]));

    const sinMatch: string[] = [];
    const payload: Array<{ portal_email: string; empleado_id: string; anio: number; mes: number; fechas: string[]; registrado_por: string }> = [];
    for (const d of descansos) {
      const relojId = String(d.reloj_id ?? '').trim();
      const fechas = Array.isArray(d.fechas) ? (d.fechas as unknown[]).map(f => iso10(f)).filter((x): x is string => !!x) : [];
      if (!relojId || !fechas.length) continue;
      const empId = empByReloj.get(relojId);
      if (!empId) { sinMatch.push(relojId); continue; }
      payload.push({ portal_email: portalEmail, empleado_id: empId, anio, mes, fechas, registrado_por: actor });
    }
    if (!payload.length) return { ok: false, error: `Ningún empleado válido. reloj_ids sin alta: ${sinMatch.join(', ') || '(ninguno)'}.` };

    const { error: upErr } = await supabase.from('rrhh_descansos_mensuales')
      .upsert(payload, { onConflict: 'empleado_id,anio,mes' });
    if (upErr) return { ok: false, error: upErr.message };

    const msg = `Descansos de ${String(mes).padStart(2,'0')}/${anio} guardados para ${payload.length} empleado(s).` + (sinMatch.length ? ` No encontré en el catálogo: ${sinMatch.join(', ')}.` : '');
    return { ok: true, message: msg, actualizados: payload.length, sin_alta: sinMatch };
  }

  // ─── rrhh_registrar_vacaciones_autorizadas ──────────────────────────────
  if (toolName === 'rrhh_registrar_vacaciones_autorizadas') {
    const relojId = String(toolInput.reloj_id ?? '').trim();
    const fi = iso10(toolInput.fecha_inicio);
    const ff = iso10(toolInput.fecha_fin);
    const nota = typeof toolInput.nota === 'string' ? toolInput.nota.trim() : null;
    if (!relojId) return { ok: false, error: 'reloj_id es requerido.' };
    if (!fi || !ff) return { ok: false, error: 'fecha_inicio y fecha_fin deben ser YYYY-MM-DD.' };
    if (ff < fi) return { ok: false, error: 'fecha_fin debe ser >= fecha_inicio.' };

    const { data: emp, error: empErr } = await supabase
      .from('rrhh_empleados')
      .select('id, nombre')
      .eq('portal_email', portalEmail)
      .eq('reloj_id', relojId)
      .maybeSingle();
    if (empErr) return { ok: false, error: empErr.message };
    if (!emp) return { ok: false, error: `No encontré empleado con reloj_id ${relojId}.` };

    const { error: insErr } = await supabase.from('rrhh_vacaciones').insert({
      portal_email:   portalEmail,
      empleado_id:    (emp as { id: string }).id,
      fecha_inicio:   fi,
      fecha_fin:      ff,
      registrado_por: actor,
      nota,
    });
    if (insErr) return { ok: false, error: insErr.message };

    return { ok: true, message: `Vacaciones de "${(emp as { nombre: string }).nombre}" guardadas del ${fi} al ${ff}.` };
  }

  // ─── rrhh_procesar_quincena_desde_excel ─────────────────────────────────
  if (toolName === 'rrhh_procesar_quincena_desde_excel') {
    const excelUrl = String(toolInput.excel_url ?? toolInput.excel_path ?? '').trim();
    const fi = iso10(toolInput.fecha_inicio);
    const ff = iso10(toolInput.fecha_fin);
    if (!excelUrl) return { ok: false, error: 'excel_url es requerido (URL firmada o ruta del bucket donde está el archivo).' };
    if (!fi || !ff) return { ok: false, error: 'fecha_inicio y fecha_fin deben ser YYYY-MM-DD.' };

    // Descarga: aceptamos (a) https URL completa o (b) path "<bucket>/<file>" o (c) solo "<file>" asumiendo bucket default.
    let buf: Buffer;
    try {
      if (/^https?:\/\//i.test(excelUrl)) {
        const res = await fetch(excelUrl);
        if (!res.ok) return { ok: false, error: `No pude descargar el Excel (HTTP ${res.status}).` };
        buf = Buffer.from(await res.arrayBuffer());
      } else {
        // Formato bucket/path
        const slash = excelUrl.indexOf('/');
        const bucket = slash > 0 ? excelUrl.slice(0, slash) : 'rrhh-reloj';
        const path   = slash > 0 ? excelUrl.slice(slash + 1) : excelUrl;
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (error || !data) return { ok: false, error: `No pude descargar el Excel desde el bucket (${error?.message ?? 'archivo no encontrado'}).` };
        buf = Buffer.from(await data.arrayBuffer());
      }
    } catch (err) {
      return { ok: false, error: `Error descargando el Excel: ${(err as Error).message}` };
    }

    const result = await procesarQuincena({
      portalEmail,
      excelBuffer: buf,
      fechaInicio: fi,
      fechaFin:    ff,
      supabase,
    });

    // Guarda output en storage para que Lucero lo descargue.
    const outPath = `nomina-procesada/${portalEmail}/${fi}_a_${ff}_${Date.now()}.xlsx`;
    const { error: upErr } = await supabase.storage
      .from('rrhh-reloj')
      .upload(outPath, result.excelBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
    let downloadUrl: string | null = null;
    if (upErr) {
      // Fallo de upload no es fatal: devolvemos resumen de todos modos.
      result.resumen.warnings.push(`No pude guardar el Excel procesado en storage: ${upErr.message}`);
    } else {
      const { data: signed } = await supabase.storage.from('rrhh-reloj').createSignedUrl(outPath, 60 * 60 * 24 * 7);
      downloadUrl = signed?.signedUrl ?? null;
    }

    const r = result.resumen;
    const msgPartes: string[] = [
      `Procesé la quincena del ${fi} al ${ff}.`,
      `${r.totalEmpleados} empleados · ${r.totalChecadas} checadas leídas.`,
      `${r.totalRetardos} retardos · ${r.totalFaltas} faltas.`,
    ];
    if (r.pendienteDeMontos) {
      msgPartes.push('Montos pendientes de configurar: devuelvo clasificación sin cálculo monetario. Pídele a Centinelia que configure monto por retardo y falta en la configuración de nómina.');
    } else if (typeof r.totalMontoCalculado === 'number') {
      msgPartes.push(`Monto total a descontar: $${r.totalMontoCalculado.toFixed(2)}.`);
    }
    if (downloadUrl) msgPartes.push(`Excel listo para anexar a tu libro de nómina: ${downloadUrl}`);
    if (r.warnings.length) msgPartes.push(`Advertencias: ${r.warnings.length}.`);

    return {
      ok: true,
      message:        msgPartes.join(' '),
      download_url:   downloadUrl,
      resumen:        r,
    };
  }

  return { ok: false, error: `Tool ${toolName} no implementada en rrhh executor.` };
}
