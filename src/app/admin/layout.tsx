import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import AdminShell from './AdminShell';
import { ThemeProvider } from '@/components/ThemeProvider';
import { isAdmin } from '@/lib/admin/auth';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const isAuth = await isAdmin();

  if (!isAuth) {
    return (
      <ThemeProvider storageKey="Centinelia-admin-theme" defaultTheme="dark">
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider storageKey="Centinelia-admin-theme" defaultTheme="dark">
      <AdminShell>{children}</AdminShell>
    </ThemeProvider>
  );
}
