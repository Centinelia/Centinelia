'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * Toaster — provider global de notificaciones. Montar en el layout root
 * (o en PortalShell) una sola vez.
 *
 * Uso de helper:
 *   import { toast } from '@/components/portal-ui';
 *   toast.success('Guardado');
 *   toast.error('Falló la operación');
 *   toast.info('Nuevo mensaje');
 *   toast.warning('Cuidado con eso');
 */

export { toast };

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      closeButton
      richColors
      toastOptions={{
        className: 'font-[var(--font-body)]',
        style: {
          background: 'var(--surface-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        },
      }}
    />
  );
}
