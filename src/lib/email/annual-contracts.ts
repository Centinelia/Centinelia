// Templates de correo para contratos anuales prepagados.
// Todos usan el shell() dark de send.ts (compatible con Gmail/Outlook).
// Ver docs/superpowers/specs/2026-08-02-annual-contracts-design.md §6.

import { shell, badge, heading, infoCard, btn, sectionLabel, progressBar } from './send';
import type { AnnualContract } from '@/types/annual-contract';
import { todayInMexico } from '@/lib/billing/tz';

const BASE_URL   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
const ADMIN_MAIL = 'hola@centinelia.mx';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtMXN(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

/**
 * NOTE: `fromISO` debe venir en tz México (usar `todayInMexico()` de
 * `@/lib/billing/tz`) — no `new Date().toISOString().slice(0,10)` que da la
 * fecha en UTC y produce off-by-one en Monterrey al borde del día.
 */
function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00Z').getTime();
  const b = new Date(toISO   + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// ── E1: Contrato activado (cliente) ─────────────────────────────────────────

export interface E1Input {
  businessName:       string;
  clientContactName?: string | null;
  contract:           AnnualContract;
  portalUrl:          string;
  employeesList:      string[];  // ["Nia", "Nara", "Nova"]
}

export function annualContractActivatedHtml(opts: E1Input): string {
  const c = opts.contract;
  const daysToExpiry = daysBetween(todayInMexico(), c.end_date);
  const greeting = opts.clientContactName ? `Hola, ${escapeHtml(opts.clientContactName)}` : 'Hola';
  const employees = opts.employeesList.length
    ? opts.employeesList.map(e => `<li style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 4px">${escapeHtml(e)}</li>`).join('')
    : `<li style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0">(sin empleados registrados aún)</li>`;

  return shell(
    `${badge('Contrato activo', '#22C55E')}
    ${heading('Contrato anual activado', escapeHtml(opts.businessName))}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">${greeting}, tu contrato anual con Centinelia (folio <strong style="color:#F1EEFF">${escapeHtml(c.contract_folio)}</strong>) está activo. Aquí están los detalles:</p>
    ${infoCard(`
      ${sectionLabel('Vigencia')}
      <p style="color:#F1EEFF;font-size:15px;font-weight:600;margin:0 0 4px">${fmtDate(c.start_date)} al ${fmtDate(c.end_date)}</p>
      <p style="color:#C8BEE8;font-size:13px;margin:0">${daysToExpiry} días de servicio</p>
    `, true)}
    ${infoCard(`
      ${sectionLabel('Pool mensual incluido')}
      <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 4px"><strong>${c.monthly_minutes_pool.toLocaleString('es-MX')}</strong> minutos de llamadas</p>
      <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0"><strong>${c.monthly_ops_pool.toLocaleString('es-MX')}</strong> tareas de oficina</p>
      <p style="color:#8C7FB8;font-size:12px;margin:8px 0 0">El pool se renueva cada mes en la fecha aniversaria del contrato.</p>
    `)}
    ${infoCard(`
      ${sectionLabel('Empleados incluidos')}
      <ul style="margin:0;padding-left:20px">${employees}</ul>
    `)}
    ${c.invoice_folio ? infoCard(`
      ${sectionLabel('Facturación')}
      <p style="color:#F1EEFF;font-size:14px;margin:0 0 4px">Monto: <strong>${fmtMXN(Number(c.amount_mxn))}</strong></p>
      <p style="color:#C8BEE8;font-size:13px;margin:0">CFDI: ${escapeHtml(c.invoice_folio)}</p>
    `) : ''}
    ${btn('Entrar al portal →', opts.portalUrl, { color: '#22C55E' })}
    <p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:20px 0 0;text-align:center">
      Cualquier duda sobre tu contrato, responde este correo o escribe a <a href="mailto:${ADMIN_MAIL}" style="color:#9B6DFF;text-decoration:none">${ADMIN_MAIL}</a>.
    </p>`,
    { preheader: `Contrato ${c.contract_folio} activo hasta ${fmtDate(c.end_date)}` },
  );
}

// ── E2: Recordatorio de renovación (60d y 15d) ──────────────────────────────

export interface E2Input {
  businessName:      string;
  contract:          AnnualContract;
  urgency:           '60d' | '15d';
  avgMinutesUsed:    number;   // promedio mensual observado del año
  avgOpsUsed:        number;
}

export function annualContractRenewalReminderHtml(opts: E2Input): string {
  const c = opts.contract;
  const isUrgent = opts.urgency === '15d';
  const accent = isUrgent ? '#EF4444' : '#FBBF24';
  const badgeLabel = isUrgent ? 'Renovación urgente · 15 días' : 'Renovación · 60 días';

  const daysToExpiry = daysBetween(todayInMexico(), c.end_date);

  const usagePct = c.monthly_minutes_pool > 0 ? Math.round((opts.avgMinutesUsed / c.monthly_minutes_pool) * 100) : 0;

  return shell(
    `${badge(badgeLabel, accent)}
    ${heading(isUrgent ? 'Necesitamos renovar el contrato pronto' : 'Es tiempo de renovar tu contrato', escapeHtml(opts.businessName))}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 16px">Tu contrato anual con Centinelia (folio <strong style="color:#F1EEFF">${escapeHtml(c.contract_folio)}</strong>) vence el <strong style="color:#F1EEFF">${fmtDate(c.end_date)}</strong> (en ${daysToExpiry} días).</p>
    ${infoCard(`
      ${sectionLabel('Consumo promedio del año')}
      ${progressBar(usagePct, accent)}
      <p style="color:#C8BEE8;font-size:13px;margin:10px 0 0"><strong style="color:#F1EEFF">${opts.avgMinutesUsed.toLocaleString('es-MX')}</strong> de ${c.monthly_minutes_pool.toLocaleString('es-MX')} min mensuales (${usagePct}%)</p>
      <p style="color:#C8BEE8;font-size:13px;margin:6px 0 0"><strong style="color:#F1EEFF">${opts.avgOpsUsed.toLocaleString('es-MX')}</strong> de ${c.monthly_ops_pool.toLocaleString('es-MX')} tareas mensuales</p>
    `, true)}
    ${infoCard(`
      ${sectionLabel('¿Qué pasa si no renuevas?')}
      <p style="color:#C8BEE8;font-size:13px;line-height:1.7;margin:0">Al vencer el contrato tu oficina se pausará automáticamente. Tus empleados dejarán de recibir llamadas y de completar tareas hasta que firmemos la renovación.</p>
    `)}
    ${btn('Renovar mi contrato →', `mailto:${ADMIN_MAIL}?subject=${encodeURIComponent(`Renovación contrato ${c.contract_folio}`)}`, { color: accent })}
    <p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:20px 0 0;text-align:center">
      Responde este correo con tu confirmación o cualquier cambio que necesites para el próximo año.
    </p>`,
    { preheader: `${badgeLabel} · ${escapeHtml(c.contract_folio)}` },
  );
}

// ── E3: Contrato expirado (cliente) ─────────────────────────────────────────

export interface E3Input {
  businessName: string;
  contract:     AnnualContract;
}

export function annualContractExpiredHtml(opts: E3Input): string {
  const c = opts.contract;
  return shell(
    `${badge('Oficina pausada', '#F87171')}
    ${heading('Tu contrato venció y tu oficina fue pausada', escapeHtml(opts.businessName))}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">El contrato <strong style="color:#F1EEFF">${escapeHtml(c.contract_folio)}</strong> venció el <strong style="color:#F1EEFF">${fmtDate(c.end_date)}</strong>. <strong style="color:#F87171">Tu oficina fue pausada</strong> y tus empleados no pueden recibir llamadas ni completar tareas hasta que firmemos la renovación.</p>
    ${infoCard(`
      ${sectionLabel('Puedes reactivar en cualquier momento')}
      <p style="color:#C8BEE8;font-size:13px;line-height:1.7;margin:0">Nuestro equipo te contactará hoy con la propuesta de renovación. En cuanto firmes, tu oficina vuelve a operar de inmediato con el pool completo del nuevo ciclo.</p>
    `, true)}
    ${btn('Contactar a Centinelia →', `mailto:${ADMIN_MAIL}?subject=${encodeURIComponent(`Reactivar oficina (contrato ${c.contract_folio})`)}`, { color: '#F87171' })}`,
    { preheader: `Contrato ${c.contract_folio} vencido, oficina pausada` },
  );
}

// ── E4: Overage 100% / 120% (interno) ───────────────────────────────────────

export interface E4Input {
  businessName:     string;
  contract:         AnnualContract;
  minutesUsed:      number;
  opsUsed:          number;
  daysRemainingCycle: number;
  threshold:        '100' | '120';
}

export function annualContractOverageAlertHtml(opts: E4Input): string {
  const c = opts.contract;
  const isCritical = opts.threshold === '120';
  const accent = isCritical ? '#EF4444' : '#FBBF24';
  const badgeLabel = isCritical ? 'Overage 20% arriba' : 'Pool al límite';
  const minPct = c.monthly_minutes_pool > 0 ? Math.round((opts.minutesUsed / c.monthly_minutes_pool) * 100) : 0;
  const opsPct = c.monthly_ops_pool > 0     ? Math.round((opts.opsUsed / c.monthly_ops_pool) * 100)         : 0;

  return shell(
    `${badge(badgeLabel, accent)}
    ${heading(`${escapeHtml(opts.businessName)} está en overage`, escapeHtml(c.contract_folio))}
    ${infoCard(`
      ${sectionLabel('Consumo del ciclo actual')}
      <p style="color:#F1EEFF;font-size:14px;margin:0 0 6px">Minutos: <strong>${opts.minutesUsed.toLocaleString('es-MX')}</strong> de ${c.monthly_minutes_pool.toLocaleString('es-MX')} (<span style="color:${accent}">${minPct}%</span>)</p>
      <p style="color:#F1EEFF;font-size:14px;margin:0 0 6px">Tareas: <strong>${opts.opsUsed.toLocaleString('es-MX')}</strong> de ${c.monthly_ops_pool.toLocaleString('es-MX')} (<span style="color:${accent}">${opsPct}%</span>)</p>
      <p style="color:#8C7FB8;font-size:12px;margin:8px 0 0">Reset del pool en ${opts.daysRemainingCycle} días.</p>
    `, true)}
    ${infoCard(`
      ${sectionLabel('Sugerencia')}
      <p style="color:#C8BEE8;font-size:13px;line-height:1.7;margin:0">El consumo real está ${isCritical ? '20%' : 'al límite'} arriba del contratado. Considera renegociar el pool en la próxima renovación.</p>
    `)}
    ${btn('Ver contrato →', `${BASE_URL}/admin/facturacion/${c.id}`, { color: accent })}`,
    { preheader: `${badgeLabel} · ${escapeHtml(c.contract_folio)}` },
  );
}

// ── E5: Digest semanal de overage 80% (interno) ─────────────────────────────

export interface E5Item {
  businessName:  string;
  contractFolio: string;
  contractId:    string;
  minPct:        number;
  daysToReset:   number;
}
export interface E5Input {
  items: E5Item[];
}

export function annualContractWeeklyOverageDigestHtml(opts: E5Input): string {
  const rows = opts.items.map(it => infoCard(`
    <p style="color:#F1EEFF;font-size:14px;font-weight:600;margin:0 0 4px">${escapeHtml(it.businessName)}</p>
    <p style="color:#8C7FB8;font-size:12px;margin:0 0 8px">${escapeHtml(it.contractFolio)}</p>
    <p style="color:#C8BEE8;font-size:13px;margin:0"><strong style="color:#FBBF24">${it.minPct}%</strong> del pool consumido · reset en ${it.daysToReset} días</p>
  `)).join('');

  return shell(
    `${badge('Digest semanal', '#9B6DFF')}
    ${heading(`${opts.items.length} contratos con pool ≥80%`, 'Overage watch')}
    ${rows}
    ${btn('Ver todos los contratos →', `${BASE_URL}/admin/facturacion?tab=contratos`)}`,
    { preheader: `${opts.items.length} contratos consumidos ≥80% esta semana` },
  );
}

// ── E6: Vencido sin renovación (interno) ────────────────────────────────────

export interface E6Input {
  businessName: string;
  contract:     AnnualContract;
  lastInteractionDaysAgo: number | null;
}

export function annualContractExpiredInternalHtml(opts: E6Input): string {
  const c = opts.contract;
  return shell(
    `${badge('Contrato vencido sin renovación', '#EF4444')}
    ${heading(escapeHtml(opts.businessName), escapeHtml(c.contract_folio))}
    ${infoCard(`
      ${sectionLabel('Detalles')}
      <p style="color:#F1EEFF;font-size:14px;margin:0 0 4px">Vigencia: ${fmtDate(c.start_date)} al ${fmtDate(c.end_date)}</p>
      <p style="color:#F1EEFF;font-size:14px;margin:0 0 4px">Valor anualidad: ${fmtMXN(Number(c.amount_mxn))}</p>
      ${opts.lastInteractionDaysAgo !== null ? `<p style="color:#C8BEE8;font-size:13px;margin:0">Última interacción de renovación: hace ${opts.lastInteractionDaysAgo} días</p>` : ''}
    `, true)}
    ${btn('Ver contrato →', `${BASE_URL}/admin/facturacion/${c.id}`, { color: '#EF4444' })}`,
    { preheader: `${escapeHtml(c.contract_folio)} vencido sin renovar` },
  );
}
