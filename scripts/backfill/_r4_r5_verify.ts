/**
 * Verify R4 + R5 después de las llamadas reales.
 * Compara contra snapshot inicial (human_requests=1, factura_requests=0, voice_calls=45).
 */
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const SNAPSHOT = { humanReq: 1, facturaReq: 0, voiceCalls: 45 };

async function main() {
  console.log('═══ Comparando contra snapshot pre-test ═══');
  console.log(`  Snapshot: human_requests=${SNAPSHOT.humanReq}, factura_requests=${SNAPSHOT.facturaReq}, voice_calls=${SNAPSHOT.voiceCalls}`);

  const { count: humanNow }    = await supa.from('human_requests').select('*', { count: 'exact', head: true }).eq('agent_id', SOFIA_ID);
  const { count: facturaNow }  = await supa.from('factura_requests').select('*', { count: 'exact', head: true }).eq('agent_id', SOFIA_ID);
  const { count: callsNow }    = await supa.from('voice_calls').select('*', { count: 'exact', head: true }).eq('agent_id', SOFIA_ID);

  const deltaHuman   = (humanNow   ?? 0) - SNAPSHOT.humanReq;
  const deltaFactura = (facturaNow ?? 0) - SNAPSHOT.facturaReq;
  const deltaCalls   = (callsNow   ?? 0) - SNAPSHOT.voiceCalls;
  console.log(`\n  Ahora:    human_requests=${humanNow} (Δ +${deltaHuman}), factura_requests=${facturaNow} (Δ +${deltaFactura}), voice_calls=${callsNow} (Δ +${deltaCalls})`);

  // ═══════════════════════════════════════════════════════════════════════
  // R4 — transferir_llamada verification
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══ R4 transferir_llamada ═══');
  if (deltaCalls === 0) {
    console.log('  ⚠️ No hay llamadas nuevas — ¿ya llamaste?');
  } else {
    // Recent calls
    const { data: recentCalls } = await supa.from('voice_calls')
      .select('id, caller_number, duration_seconds, outcome, summary, created_at, transcript')
      .eq('agent_id', SOFIA_ID)
      .order('created_at', { ascending: false }).limit(3);

    console.log(`  ${deltaCalls} llamada(s) nueva(s):`);
    for (const c of recentCalls?.slice(0, deltaCalls) ?? []) {
      console.log(`    ${c.created_at.slice(0,19)} · ${c.caller_number} · ${c.duration_seconds}s · outcome=${c.outcome}`);
      if (c.summary) console.log(`      resumen: ${c.summary.slice(0,140)}`);
      // Detect transfer in transcript
      const isTransfer = /transfer|comunicar con el equipo|un momento por favor/i.test(c.transcript ?? '');
      console.log(`      ${isTransfer ? '✅ transcript menciona transferencia' : '⚠️ transcript no menciona transferencia'}`);
    }
    console.log('\n  Preguntas para ti (revisar manual):');
    console.log('    - ¿Recibiste WhatsApp "📞 Transferencia entrante..." en +52 81 1633 3559?');
    console.log('    - ¿Sonó tu teléfono +52 81 1633 3559 con la llamada del cliente?');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // R5 — solicitar_factura verification
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══ R5 solicitar_factura ═══');
  if (deltaFactura === 0) {
    console.log('  ⚠️ No hay factura_requests nuevos — ¿Sofia invocó la tool?');
  } else {
    const { data: fr } = await supa.from('factura_requests')
      .select('id, cliente_nombre, cliente_rfc, cliente_email, uso_cfdi, forma_pago, metodo_pago, subtotal, iva, total, status, requested_at, source_call_id')
      .eq('agent_id', SOFIA_ID)
      .order('requested_at', { ascending: false }).limit(deltaFactura);

    console.log(`  ${deltaFactura} solicitud(es) nueva(s):`);
    for (const r of fr ?? []) {
      console.log(`    ${r.requested_at.slice(0,19)}`);
      console.log(`      Cliente: ${r.cliente_nombre} · RFC: ${r.cliente_rfc}`);
      console.log(`      Correo:  ${r.cliente_email}`);
      console.log(`      Fiscal:  uso=${r.uso_cfdi} · forma=${r.forma_pago} · metodo=${r.metodo_pago}`);
      console.log(`      Montos:  subtotal=$${r.subtotal} + iva=$${r.iva} = total=$${r.total}`);
      console.log(`      Status:  ${r.status}`);
      console.log(`      Vapi call source: ${r.source_call_id?.slice(0,8) ?? 'none'}`);
    }
    console.log('\n  Preguntas para ti (revisar manual):');
    console.log('    - ¿Recibiste email "Nueva solicitud de factura · ..." en studio@pneumastudio.mx?');
    console.log('    - ¿Los datos capturados por Sofia son correctos vs lo que dijiste?');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // human_requests delta (por si R4 escalated)
  // ═══════════════════════════════════════════════════════════════════════
  if (deltaHuman > 0) {
    console.log('\n═══ human_requests nuevo(s) ═══');
    const { data: hr } = await supa.from('human_requests')
      .select('title, description, target_email, urgency, status, created_at')
      .eq('agent_id', SOFIA_ID)
      .order('created_at', { ascending: false }).limit(deltaHuman);
    for (const h of hr ?? []) {
      console.log(`  [${h.status}] ${h.title?.slice(0,60)} → ${h.target_email}`);
    }
  }
}
main().catch(err => { console.error('FATAL:', err); process.exit(1); });
