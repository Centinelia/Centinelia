import { redirect } from 'next/navigation';

// WhatsApp se activa desde el editor del agente (tab WhatsApp), no como entidad separada.
export default function Page() {
  redirect('/admin/agentes');
}
