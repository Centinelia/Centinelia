// D-L2: aceptar invitación de sub-usuario. Reemplaza el flow legacy donde
// el owner pasaba la password por WhatsApp. Ver Scope D3 R-3.
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import JoinForm from './JoinForm';

interface Props { params: Promise<{ token: string }> }

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: invite } = await supabase
    .from('portal_user_invites')
    .select('account_id, email, name, expires_at, used_at')
    .eq('token', token)
    .maybeSingle() as { data: {
      account_id: string; email: string; name: string | null;
      expires_at: string; used_at: string | null;
    } | null };

  if (!invite) notFound();

  const expired = new Date(invite.expires_at).getTime() < Date.now();
  const used    = !!invite.used_at;

  return (
    <JoinForm
      inviteToken={token}
      email={invite.email}
      name={invite.name}
      accountEmail={invite.account_id}
      expired={expired}
      used={used}
    />
  );
}
