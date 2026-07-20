import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('voice_agents')
    .select('*')
    .not('wa_phone_number', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    client_name, business_name, business_description,
    wa_phone_number, agent_name, timezone,
    knowledge_base, transfer_whatsapp, client_email,
    capture_leads, capture_appointments, capture_orders,
  } = body;

  if (!client_name?.trim() || !business_name?.trim() || !wa_phone_number?.trim()) {
    return NextResponse.json(
      { error: 'Nombre de cliente, negocio y número de WhatsApp son requeridos' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('voice_agents')
    .insert({
      client_name:           client_name.trim(),
      business_name:         business_name.trim(),
      wa_phone_number:       wa_phone_number.trim().replace(/\s/g, ''),
      phone_number:          wa_phone_number.trim().replace(/\s/g, ''),
      business_phone_display: '',
      agent_name:            agent_name?.trim() ?? null,
      timezone:              timezone?.trim() ?? 'America/Monterrey',
      transfer_whatsapp:     transfer_whatsapp?.trim() ?? null,
      client_email:          client_email?.trim() ?? null,
      capture_leads:         capture_leads ?? true,
      capture_appointments:  capture_appointments ?? false,
      capture_orders:        capture_orders ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
