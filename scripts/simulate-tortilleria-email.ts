/**
 * simulate-tortilleria-email.ts — smoke E2E del pipeline Excel de Nala.
 *
 * Qué hace:
 *   1. Sube 1..N xlsx a Storage (bucket billing-attachments) bajo un email_id
 *      sintético.
 *   2. Inserta una row en billing_incoming_emails con attachments_meta apuntando
 *      a los storageKey subidos.
 *   3. Corre BillingEmployee.runOnEmail(emailId) directamente (skipea el cron).
 *   4. Imprime las cards que se crearon en billing_pending_review + warnings.
 *   5. Con --approve-first N, marca la primera N cards como 'approved' y vuelve
 *      a disparar runOnEmail para verificar que llegan XMLs a Dropbox.
 *   6. Con --cleanup, borra el email + attachments + pendings al terminar.
 *
 * Uso (Powershell):
 *   $env:AGENT_ID='e3bad8c7-...'          # Nala trial tortillería
 *   npx tsx scripts/simulate-tortilleria-email.ts `
 *     --xlsx src/lib/billing/parsers/__tests__/fixtures/varios.xlsx `
 *     --xlsx src/lib/billing/parsers/__tests__/fixtures/ortiz.xlsx `
 *     --approve-first 1 --cleanup
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// --- CLI parsing -----------------------------------------------------------

interface Args {
  agentId:       string;
  xlsxPaths:     string[];
  approveFirst:  number;
  cleanup:       boolean;
  portalOverride?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {
    agentId:       process.env.AGENT_ID ?? '',
    xlsxPaths:     [],
    approveFirst:  0,
    cleanup:       false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--agent':          out.agentId = args[++i]; break;
      case '--xlsx':           out.xlsxPaths.push(args[++i]); break;
      case '--approve-first':  out.approveFirst = Number(args[++i]); break;
      case '--cleanup':        out.cleanup = true; break;
      case '--portal':         out.portalOverride = args[++i]; break;
      case '--help':
      case '-h':
        console.log(
          `Uso: npx tsx scripts/simulate-tortilleria-email.ts \\\n` +
          `  --agent <voice_agent_id> \\\n` +
          `  --xlsx <path> [--xlsx <path> ...] \\\n` +
          `  [--approve-first N] [--cleanup] [--portal <email>]\n\n` +
          `Alternativa: exportar AGENT_ID en el env.\n`,
        );
        process.exit(0);
    }
  }
  if (!out.agentId) {
    console.error('ERROR: falta --agent o AGENT_ID env');
    process.exit(2);
  }
  if (out.xlsxPaths.length === 0) {
    console.error('ERROR: pasar al menos --xlsx <path>');
    process.exit(2);
  }
  return out;
}

// --- Helpers ---------------------------------------------------------------

function line(char = '─', n = 78) { return char.repeat(n); }

function pretty(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

// --- Main ------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log(line('='));
  console.log('SIMULATE TORTILLERÍA EMAIL — smoke E2E pipeline Excel');
  console.log(line('='));

  // 1) Resolver portal_email + integration del agente ----------------------
  const { data: agentRow, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, portal_email, active')
    .eq('id', args.agentId)
    .maybeSingle<{ id: string; agent_name: string; portal_email: string; active: boolean }>();
  if (agentErr || !agentRow) {
    console.error(`Agent ${args.agentId} no encontrado: ${agentErr?.message ?? 'null row'}`);
    process.exit(1);
  }
  const portalEmail = args.portalOverride ?? agentRow.portal_email;
  console.log(`Agent: ${agentRow.agent_name} (${agentRow.id.slice(0, 8)}) portal=${portalEmail}`);

  const { data: integRow, error: integErr } = await supabase
    .from('organization_integrations')
    .select('id, config')
    .eq('portal_email', portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle<{ id: string; config: Record<string, unknown> }>();
  if (integErr || !integRow) {
    console.error(`organization_integrations type=contpaqi no encontrado para ${portalEmail}: ${integErr?.message ?? 'null row'}`);
    process.exit(1);
  }
  console.log(`Integration: ${integRow.id.slice(0, 8)}`);

  // 2) Insert billing_incoming_emails --------------------------------------
  // Insert temprano para tener el email_id y usarlo como prefijo de storage.
  const attachmentsMeta = args.xlsxPaths.map((p, i) => ({
    filename:    basename(p),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size:        readFileSync(p).length,
    index:       i,
  }));

  const { data: emailRow, error: emailErr } = await supabase
    .from('billing_incoming_emails')
    .insert({
      portal_email:     portalEmail,
      integration_id:   integRow.id,
      from_address:     'smoke-simulator@localhost',
      to_address:       portalEmail,
      subject:          `[SMOKE] simulate-tortilleria-email ${new Date().toISOString()}`,
      body_text:        'Smoke test synthetic email — safe to delete.',
      attachment_count: args.xlsxPaths.length,
      attachments_meta: attachmentsMeta,
      raw_payload:      { source: 'simulate-tortilleria-email' },
    })
    .select('id')
    .single();
  if (emailErr || !emailRow) {
    console.error(`insert billing_incoming_emails failed: ${emailErr?.message}`);
    process.exit(1);
  }
  const emailId = emailRow.id as string;
  console.log(`Email inserted: ${emailId}`);

  // 3) Subir xlsx a Storage y enriquecer attachments_meta ------------------
  console.log(line());
  console.log(`Uploading ${args.xlsxPaths.length} xlsx to storage...`);
  const { uploadBillingAttachments } = await import('../src/lib/billing/storage/attachments');
  const stored = await uploadBillingAttachments(
    emailId,
    args.xlsxPaths.map((p) => {
      const content = readFileSync(p);
      return {
        filename:    basename(p),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content,
        size:        content.length,
      };
    }),
  );
  const enrichedMeta = stored.map((s, i) => ({
    filename:    s.filename,
    contentType: s.contentType,
    size:        s.size,
    storageKey:  s.storageKey,
    index:       i,
  }));
  await supabase
    .from('billing_incoming_emails')
    .update({ attachments_meta: enrichedMeta })
    .eq('id', emailId);
  for (const s of stored) console.log(`  ✓ ${s.storageKey} (${s.size}b)`);

  // 4) Correr BillingEmployee.runOnEmail directo ---------------------------
  console.log(line());
  console.log('Running BillingEmployee.runOnEmail (fast-path Excel) ...');
  const { BillingEmployee } = await import('../src/lib/billing/employee/loop');
  const { buildAdapter, decryptDropboxToken: _keep } = await import('../src/lib/billing/adapters');
  void _keep; // keep-import for tree-shake safety in tsx
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = buildAdapter(integRow.config as any);
  const employee = new BillingEmployee(adapter, {
    portalEmail,
    integrationId:   integRow.id,
    dropboxToken:    '',
    dropboxBasePath: '',
    escalationEmail: 'nazre20@gmail.com',
    orgName:         portalEmail,
    agentId:         args.agentId,
  });
  const runResult = await employee.runOnEmail(emailId);
  console.log('runOnEmail result:', pretty(runResult));

  // 5) Reportar cards creadas ----------------------------------------------
  console.log(line());
  console.log('Cards en billing_pending_review:');
  const { data: cards } = await supabase
    .from('billing_pending_review')
    .select('id, status, cliente_texto, rfc_matched, fecha, total, productos, reason, extracted, created_at')
    .eq('email_id', emailId)
    .order('created_at', { ascending: true });
  for (const c of (cards ?? []) as Array<Record<string, unknown>>) {
    const productos = (c['productos'] as Array<Record<string, unknown>> | null) ?? [];
    console.log(
      `  [${(c['id'] as string).slice(0,8)}] ${c['status']} rfc=${c['rfc_matched']} fecha=${c['fecha']} total=$${c['total']} lines=${productos.length}`,
    );
  }

  // 6) Approve-first N y re-run --------------------------------------------
  if (args.approveFirst > 0 && (cards?.length ?? 0) > 0) {
    const toApprove = cards!.slice(0, args.approveFirst);
    console.log(line());
    console.log(`Marking first ${toApprove.length} card(s) as approved ...`);
    for (const c of toApprove) {
      const { error } = await supabase
        .from('billing_pending_review')
        .update({
          status:      'approved',
          resolved_at: new Date().toISOString(),
          resolved_by: 'simulate-tortilleria-email',
        })
        .eq('id', c['id'] as string);
      if (error) console.log(`  ✗ ${(c['id'] as string).slice(0,8)}: ${error.message}`);
      else       console.log(`  ✓ ${(c['id'] as string).slice(0,8)}: rfc=${c['rfc_matched']}`);
    }

    console.log(line());
    console.log('Re-running BillingEmployee.runOnEmail → debería empujar XMLs a Dropbox ...');
    const runResult2 = await employee.runOnEmail(emailId);
    console.log('runOnEmail result (post-approve):', pretty(runResult2));

    // Verificar xml_path en extracted
    const { data: cardsAfter } = await supabase
      .from('billing_pending_review')
      .select('id, status, rfc_matched, extracted')
      .in('id', toApprove.map(c => c['id'] as string));
    console.log(line());
    console.log('Verificación xml_path:');
    for (const c of (cardsAfter ?? []) as Array<Record<string, unknown>>) {
      const extracted = (c['extracted'] as Record<string, unknown> | null) ?? {};
      const xmlPath = extracted['xml_path'];
      const submittedAt = extracted['xml_submitted_at'];
      if (xmlPath) {
        console.log(`  ✓ ${(c['id'] as string).slice(0,8)} rfc=${c['rfc_matched']}`);
        console.log(`    → xml_path=${xmlPath}`);
        console.log(`    → xml_submitted_at=${submittedAt}`);
      } else {
        console.log(`  ✗ ${(c['id'] as string).slice(0,8)} rfc=${c['rfc_matched']} SIN xml_path`);
      }
    }
  }

  // 7) Cleanup opcional ----------------------------------------------------
  if (args.cleanup) {
    console.log(line());
    console.log('Cleanup ...');
    await supabase.from('billing_pending_review').delete().eq('email_id', emailId);
    const { deleteBillingAttachments } = await import('../src/lib/billing/storage/attachments');
    await deleteBillingAttachments(emailId);
    await supabase.from('billing_incoming_emails').delete().eq('id', emailId);
    console.log(`  ✓ borradas cards, storage prefix ${emailId}/, y email row`);
  } else {
    console.log(line());
    console.log(`(sin cleanup — email_id ${emailId} queda en DB para inspección manual)`);
  }

  console.log(line('='));
  console.log('Done.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
