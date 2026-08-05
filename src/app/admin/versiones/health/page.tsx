import { redirect } from 'next/navigation';

export default function HealthRedirect() {
  redirect('/admin/versiones?tab=health');
}
