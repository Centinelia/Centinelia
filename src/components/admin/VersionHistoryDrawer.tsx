'use client';
export function VersionHistoryDrawer({ meerkatId, onClose }: { meerkatId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white p-4">
        Historial de {meerkatId} (pendiente Task 10)
      </div>
    </div>
  );
}
