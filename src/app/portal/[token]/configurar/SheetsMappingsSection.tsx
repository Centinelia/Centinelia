'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Sheet,
  Plus,
  Trash2,
  RefreshCw,
  WifiOff,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import EmptyState from '@/components/ui/empty-state';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Mapping {
  id: string;
  purpose: string;
  custom_purpose_label: string | null;
  spreadsheet_id: string;
  tab_name: string;
  headers: string[];
  headers_synced_at: string | null;
}

interface Spreadsheet {
  id: string;
  name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RESERVED_PURPOSES = [
  { value: 'clientes',     label: 'Clientes' },
  { value: 'leads',        label: 'Leads' },
  { value: 'bitacoras',    label: 'Bitácoras' },
  { value: 'oc',           label: 'Órdenes de compra' },
  { value: 'cajas_chicas', label: 'Cajas chicas' },
  { value: 'custom',       label: 'Personalizado' },
] as const;

type PurposeValue = (typeof RESERVED_PURPOSES)[number]['value'];

function purposeLabel(purpose: string, customLabel: string | null): string {
  if (purpose === 'custom' && customLabel) return customLabel;
  return RESERVED_PURPOSES.find(p => p.value === purpose)?.label ?? purpose;
}

// ─── Sub-component: MappingRow ────────────────────────────────────────────────

function MappingRow({
  mapping,
  token,
  onRefresh,
  onDelete,
}: {
  mapping: Mapping;
  token: string;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localHeaders, setLocalHeaders] = useState<string[]>(mapping.headers ?? []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/portal/${token}/sheets-mappings/${mapping.id}/refresh-headers`,
        { method: 'POST' }
      );
      if (res.ok) {
        const d = await res.json();
        setLocalHeaders(d.headers ?? []);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Desconectar la hoja de "${purposeLabel(mapping.purpose, mapping.custom_purpose_label)}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/portal/${token}/sheets-mappings/${mapping.id}`, { method: 'DELETE' });
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Purpose badge */}
          <span
            className="inline-block text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded mb-2"
            style={{ background: 'var(--c-hover)', color: 'var(--c-text-3)' }}
          >
            {purposeLabel(mapping.purpose, mapping.custom_purpose_label)}
          </span>

          {/* Spreadsheet + tab */}
          <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
            {mapping.spreadsheet_id}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Hoja: {mapping.tab_name}
          </p>

          {/* Headers */}
          {localHeaders.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {localHeaders.map(h => (
                <span
                  key={h}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
                >
                  {h}
                </span>
              ))}
            </div>
          )}
          {localHeaders.length === 0 && (
            <p className="text-xs mt-2 italic" style={{ color: 'var(--c-text-4)' }}>
              Sin columnas detectadas. Usa "Actualizar columnas".
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Actualizar columnas"
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--c-text-3)' }}
          >
            {refreshing
              ? <Loader2 size={15} className="animate-spin" />
              : <RefreshCw size={15} />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="Eliminar"
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--c-text-3)' }}
          >
            {deleting
              ? <Loader2 size={15} className="animate-spin" />
              : <Trash2 size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: AddMappingForm ────────────────────────────────────────────

function AddMappingForm({
  token,
  onSaved,
  onCancel,
}: {
  token: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [purpose, setPurpose] = useState<PurposeValue>('clientes');
  const [customLabel, setCustomLabel] = useState('');
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
  const [tabs, setTabs] = useState<string[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load spreadsheets on mount
  useEffect(() => {
    setSheetsLoading(true);
    setSheetsError(null);
    fetch(`/api/portal/${token}/sheets/spreadsheets`)
      .then(r => r.json())
      .then(d => {
        if (d.error === 'google_no_conectado') {
          setSheetsError('google_no_conectado');
        } else {
          setSpreadsheets(d.spreadsheets ?? []);
        }
      })
      .catch(() => setSheetsError('error'))
      .finally(() => setSheetsLoading(false));
  }, [token]);

  // Load tabs when spreadsheet changes
  useEffect(() => {
    if (!selectedSpreadsheet) { setTabs([]); setSelectedTab(''); return; }
    setTabsLoading(true);
    setSelectedTab('');
    fetch(`/api/portal/${token}/sheets/spreadsheets/${selectedSpreadsheet}/tabs`)
      .then(r => r.json())
      .then(d => setTabs(d.tabs ?? []))
      .catch(() => setTabs([]))
      .finally(() => setTabsLoading(false));
  }, [selectedSpreadsheet, token]);

  const handleSubmit = async () => {
    if (!selectedSpreadsheet || !selectedTab) return;
    if (purpose === 'custom' && !customLabel.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, string> = {
        purpose,
        spreadsheet_id: selectedSpreadsheet,
        tab_name: selectedTab,
      };
      if (purpose === 'custom') body.custom_purpose_label = customLabel.trim();
      const res = await fetch(`/api/portal/${token}/sheets-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error ?? 'Error al guardar');
        return;
      }
      onSaved();
    } catch {
      setSaveError('Error al guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (sheetsError === 'google_no_conectado') {
    return (
      <div
        className="rounded-lg p-4"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
      >
        <div className="flex items-start gap-2.5">
          <WifiOff size={14} style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
              Google no conectado
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
              Conecta Google Workspace en la sección de Integraciones de la Oficina para acceder a tus sheets.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 text-xs"
          style={{ color: 'var(--c-text-3)' }}
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{ border: '1px dashed var(--c-border)', background: 'var(--c-surface-2)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>
        Nueva hoja
      </p>

      {/* Purpose */}
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--c-text-2)' }}>
          Propósito
        </label>
        <div className="relative">
          <select
            id="sheets-purpose"
            value={purpose}
            onChange={e => { setPurpose(e.target.value as PurposeValue); setCustomLabel(''); }}
            className="w-full appearance-none rounded-md px-3 py-2 pr-8 text-sm"
            style={{
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-text)',
            }}
          >
            {RESERVED_PURPOSES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-3)' }} />
        </div>
      </div>

      {/* Custom label */}
      {purpose === 'custom' && (
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--c-text-2)' }}>
            Nombre del propósito
          </label>
          <input
            id="sheets-custom-label"
            type="text"
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder="Ej: Inventario, Proveedores..."
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-text)',
            }}
          />
        </div>
      )}

      {/* Spreadsheet picker */}
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--c-text-2)' }}>
          Spreadsheet
        </label>
        {sheetsLoading ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
            <Loader2 size={13} className="animate-spin" /> Cargando sheets...
          </div>
        ) : (
          <div className="relative">
            <select
              id="sheets-spreadsheet"
              value={selectedSpreadsheet}
              onChange={e => setSelectedSpreadsheet(e.target.value)}
              className="w-full appearance-none rounded-md px-3 py-2 pr-8 text-sm"
              style={{
                background: 'var(--c-surface)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-text)',
              }}
            >
              <option value="">Elige un spreadsheet</option>
              {spreadsheets.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-3)' }} />
          </div>
        )}
      </div>

      {/* Tab picker */}
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--c-text-2)' }}>
          Hoja (tab)
        </label>
        {tabsLoading ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
            <Loader2 size={13} className="animate-spin" /> Cargando hojas...
          </div>
        ) : (
          <div className="relative">
            <select
              id="sheets-tab"
              value={selectedTab}
              onChange={e => setSelectedTab(e.target.value)}
              disabled={!selectedSpreadsheet || tabs.length === 0}
              className="w-full appearance-none rounded-md px-3 py-2 pr-8 text-sm disabled:opacity-50"
              style={{
                background: 'var(--c-surface)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-text)',
              }}
            >
              <option value="">
                {!selectedSpreadsheet ? 'Elige un spreadsheet primero' : 'Elige una hoja'}
              </option>
              {tabs.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-3)' }} />
          </div>
        )}
      </div>

      {saveError && (
        <p className="text-xs" style={{ color: '#ef4444' }}>{saveError}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          id="sheets-submit"
          type="button"
          onClick={handleSubmit}
          disabled={saving || !selectedSpreadsheet || !selectedTab || (purpose === 'custom' && !customLabel.trim())}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition-opacity disabled:opacity-40"
          style={{ background: 'var(--c-text)', color: 'var(--c-bg)' }}
        >
          {saving ? 'Guardando...' : 'Agregar hoja'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ color: 'var(--c-text-3)' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

interface Props {
  token: string;
  agentId: string;
  initialSyncLeads: boolean;
}

export default function SheetsMappingsSection({ token, agentId, initialSyncLeads }: Props) {
  const [mappings, setMappings]       = useState<Mapping[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncLeads, setSyncLeads]     = useState(initialSyncLeads);
  const [syncSaving, setSyncSaving]   = useState(false);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/sheets-mappings`);
      const d   = await res.json();
      setMappings(d.mappings ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const hasLeadsMapping = mappings.some(m => m.purpose === 'leads');

  const handleToggleSyncLeads = async (checked: boolean) => {
    setSyncSaving(true);
    setSyncLeads(checked);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_leads_to_sheets: checked }),
      });
    } catch {
      // Revert on error
      setSyncLeads(!checked);
    } finally {
      setSyncSaving(false);
    }
  };

  return (
    <section id="sheets-del-negocio" className="scroll-mt-6">
      {/* Section header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
          Sheets del negocio
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Conecta un Google Sheet a cada tipo de dato. El empleado escribira y leera directamente en tus hojas existentes, respetando los encabezados que ya tienes.
        </p>
      </div>

      {/* Mapping list */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm" style={{ color: 'var(--c-text-3)' }}>
          <Loader2 size={15} className="animate-spin" />
          Cargando hojas configuradas...
        </div>
      ) : mappings.length === 0 && !showAddForm ? (
        <EmptyState
          icon={Sheet}
          title="Sin hojas configuradas"
          description="Agrega la primera hoja para que el empleado pueda leer y escribir datos directamente en Google Sheets."
          size="sm"
          action={
            <button
              type="button"
              id="sheets-add-first"
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium"
              style={{ background: 'var(--c-text)', color: 'var(--c-bg)' }}
            >
              <Plus size={14} />
              Agregar hoja
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {mappings.map(m => (
            <MappingRow
              key={m.id}
              mapping={m}
              token={token}
              onRefresh={loadMappings}
              onDelete={loadMappings}
            />
          ))}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="mt-3">
          <AddMappingForm
            token={token}
            onSaved={() => { setShowAddForm(false); loadMappings(); }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Add button (shown when list is not empty) */}
      {!loading && mappings.length > 0 && !showAddForm && (
        <button
          id="sheets-add-btn"
          type="button"
          onClick={() => setShowAddForm(true)}
          className="mt-3 flex items-center gap-1.5 text-sm"
          style={{ color: 'var(--c-text-3)' }}
        >
          <Plus size={14} />
          Agregar otra hoja
        </button>
      )}

      {/* Sync leads toggle */}
      {!loading && (
        <div
          className="mt-5 pt-4"
          style={{ borderTop: '1px solid var(--c-border)' }}
        >
          <label
            className="flex items-start gap-3 cursor-pointer"
            style={{ opacity: hasLeadsMapping ? 1 : 0.4 }}
          >
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                id="sync-leads-toggle"
                type="checkbox"
                checked={syncLeads}
                disabled={!hasLeadsMapping || syncSaving}
                onChange={e => handleToggleSyncLeads(e.target.checked)}
                className="sr-only"
              />
              {/* Custom toggle */}
              <div
                className="w-9 h-5 rounded-full transition-colors"
                style={{
                  background: syncLeads && hasLeadsMapping ? 'var(--c-accent, #6C3BFF)' : 'var(--c-border)',
                }}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white shadow transition-transform absolute top-0.5"
                  style={{
                    left: syncLeads && hasLeadsMapping ? '1.15rem' : '0.15rem',
                  }}
                />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                Sincronizar leads a Sheets
              </span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                {hasLeadsMapping
                  ? 'Cada lead capturado por este empleado se escribira automaticamente en el sheet de Leads.'
                  : 'Requiere configurar una hoja con proposito "Leads" arriba.'}
              </p>
            </div>
          </label>
        </div>
      )}
    </section>
  );
}
