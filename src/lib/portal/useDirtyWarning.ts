import { useEffect } from 'react';

const dirty = new Set<string>();
const MSG = 'Tienes cambios sin guardar. ¿Deseas salir de esta página?';
let origPush: typeof window.history.pushState | null = null;

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

function install() {
  if (origPush) return;
  origPush = window.history.pushState.bind(window.history);
  window.history.pushState = function (data, unused, url) {
    if (dirty.size === 0 || window.confirm(MSG)) origPush!(data, unused, url);
  };
  window.addEventListener('beforeunload', onBeforeUnload);
}

function uninstall() {
  if (!origPush) return;
  window.history.pushState = origPush;
  origPush = null;
  window.removeEventListener('beforeunload', onBeforeUnload);
}

export function useDirtyWarning(id: string, isDirty: boolean) {
  useEffect(() => {
    if (isDirty) {
      dirty.add(id);
      install();
    } else {
      dirty.delete(id);
      if (dirty.size === 0) uninstall();
    }
    return () => {
      dirty.delete(id);
      if (dirty.size === 0) uninstall();
    };
  }, [id, isDirty]);
}
