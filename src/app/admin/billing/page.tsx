import { redirect } from 'next/navigation';

// Retro-compat: /admin/billing → /admin/facturacion?tab=stripe
export default function BillingRedirectPage() {
  redirect('/admin/facturacion?tab=stripe');
}
