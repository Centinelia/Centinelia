'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Sheet,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
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
  { value: 'leads',        label: 'Leads',              description: 'Cada lead nuevo se agrega como fila' },
  { value: 'clientes',     label: 'Clientes',           description: 'Base de datos consultable por el empleado' },
  { value: 'bitacoras',    label: 'Bitácoras',          description: 'Registro de actividades por proyecto u obra' },
  { value: 'oc',           label: 'Órdenes de compra',  description: 'OCs para consultar y capturar' },
  { value: 'cajas_chicas', label: 'Cajas chicas',       description: 'Gastos menores y comprobantes' },
  { value: 'custom',       label: 'Otro (le pones nombre)', description: 'Un uso propio que no cabe arriba' },
] as const;

type PurposeValue = (typeof RESERVED_PURPOSES)[number]['value'];

function purposeLabel(purpose: string, customLabel: string | null): string {
  if (purpose === 'custom' && customLabel) return customLabel;
  return RESERVED_PURPOSES.find(p => p.value === purpose)?.label ?? purpose;
}

function purposeDescription(purpose: PurposeValue): string {
  return RESERVED_PURPOSES.find(p => p.value === purpose)?.description ?? '';
}

// ─── Sub-component: MappingRow ────────────────────────────────────────────────

function MappingRow({
  mapping,
  token,
  spreadsheetsMap,
  onDelete,
  isLast,
}: {
  mapping: Mapping;
  token: string;
  spreadsheetsMap: Map<string, string>;
  onRefresh: () => void;
  onDelete: () => void;
  isLast: boolean;
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
      className="px-5 py-4 flex flex-col gap-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Purpose badge */}
          <span
            className="inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full mb-2"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}
          >
            {purposeLabel(mapping.purpose, mapping.custom_purpose_label)}
          </span>

          {/* Spreadsheet + tab */}
          <p className="text-[13px] font-semibold truncate" style={{ color: '#1A0A3B' }}>
            {spreadsheetsMap.get(mapping.spreadsheet_id) ?? mapping.spreadsheet_id}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
            Hoja: {mapping.tab_name}
          </p>

          {/* Headers */}
          {localHeaders.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {localHeaders.map(h => (
                <span
                  key={h}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
                >
                  {h}
                </span>
              ))}
            </div>
          )}
          {localHeaders.length === 0 && (
            <p className="text-[11px] mt-2 italic" style={{ color: '#9B8FB5' }}>
              Aún sin detectar las columnas de tu hoja.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Volver a leer las columnas — sólo hace falta si renombraste o agregaste columnas en tu hoja"
            className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}
          >
            {refreshing
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="Eliminar"
            className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: '#FAFAFB', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}
          >
            {deleting
              ? <Loader2 size={14} className="animate-spin" />
              : <Trash2 size={14} />}
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // Este estado ya no debería aparecer aquí (el card padre gatea antes de
    // abrir el form), pero se mantiene como safety net si la conexión se cae
    // entre el mount del card y el click de "Agregar hoja".
    return (
      <div
        className="px-5 py-4"
        style={{ borderTop: '1px solid #F0EDF9', background: 'rgba(245,158,11,0.06)' }}
      >
        <p className="text-[13px]" style={{ color: '#6B6480' }}>
          Se perdió la conexión con Google. Recarga la página y vuelve a intentar.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 text-[12px] px-2.5 py-1 rounded-lg transition-opacity hover:opacity-70"
          style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
        >
          Cancelar
        </button>
      </div>
    );
  }

  const inputStyle = {
    background: '#FAFAFB',
    border: '1px solid #E8E3F5',
    color: '#1A0A3B',
  };

  return (
    <div
      className="px-5 py-4 flex flex-col gap-3"
      style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
        Nueva hoja
      </p>

      {/* Purpose */}
      <div>
        <label className="text-[12px] mb-1 block font-medium" style={{ color: '#6B6480' }}>
          ¿Qué se va a guardar aquí?
        </label>
        <div className="relative">
          <select
            id="sheets-purpose"
            value={purpose}
            onChange={e => { setPurpose(e.target.value as PurposeValue); setCustomLabel(''); }}
            className="w-full appearance-none rounded-lg px-3 py-2 pr-8 text-[13px] outline-none"
            style={inputStyle}
          >
            {RESERVED_PURPOSES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#9B8FB5' }} />
        </div>
        {purpose !== 'custom' && (
          <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>
            {purposeDescription(purpose)}
          </p>
        )}
      </div>

      {/* Custom label */}
      {purpose === 'custom' && (
        <div>
          <label className="text-[12px] mb-1 block font-medium" style={{ color: '#6B6480' }}>
            Nombre del propósito
          </label>
          <input
            id="sheets-custom-label"
            type="text"
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder="Ej: Inventario, Proveedores..."
            className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
            style={inputStyle}
          />
        </div>
      )}

      {/* Spreadsheet picker */}
      <div>
        <label className="text-[12px] mb-1 block font-medium" style={{ color: '#6B6480' }}>
          Archivo de Google Sheets
        </label>
        {sheetsLoading ? (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6B6480' }}>
            <Loader2 size={13} className="animate-spin" /> Cargando tus archivos...
          </div>
        ) : (
          <div className="relative">
            <select
              id="sheets-spreadsheet"
              value={selectedSpreadsheet}
              onChange={e => setSelectedSpreadsheet(e.target.value)}
              className="w-full appearance-none rounded-lg px-3 py-2 pr-8 text-[13px] outline-none"
              style={inputStyle}
            >
              <option value="">Elige un archivo</option>
              {spreadsheets.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#9B8FB5' }} />
          </div>
        )}
      </div>

      {/* Tab picker */}
      <div>
        <label className="text-[12px] mb-1 block font-medium" style={{ color: '#6B6480' }}>
          Pestaña dentro del archivo
        </label>
        {tabsLoading ? (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6B6480' }}>
            <Loader2 size={13} className="animate-spin" /> Cargando pestañas...
          </div>
        ) : (
          <div className="relative">
            <select
              id="sheets-tab"
              value={selectedTab}
              onChange={e => setSelectedTab(e.target.value)}
              disabled={!selectedSpreadsheet || tabs.length === 0}
              className="w-full appearance-none rounded-lg px-3 py-2 pr-8 text-[13px] outline-none disabled:opacity-50"
              style={inputStyle}
            >
              <option value="">
                {!selectedSpreadsheet ? 'Elige un archivo primero' : 'Elige una pestaña'}
              </option>
              {tabs.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#9B8FB5' }} />
          </div>
        )}
      </div>

      {/* Preview — qué va a pasar una vez configurado */}
      {selectedSpreadsheet && selectedTab && (
        <div
          className="rounded-lg p-3 text-[11px]"
          style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.15)' }}
        >
          <p className="font-semibold mb-1" style={{ color: '#1A0A3B' }}>
            Qué va a pasar:
          </p>
          <p style={{ color: '#6B6480', lineHeight: 1.6 }}>
            Leeremos la fila 1 de <strong>{selectedTab}</strong> como nombres de columnas.
            Cuando tu empleado guarde datos aquí, mapeará cada dato a su columna por nombre.
            Si después renombras o agregas columnas en la hoja, el empleado las detecta solo — no tienes que sincronizar a mano.
          </p>
        </div>
      )}

      {saveError && (
        <p className="text-[12px]" style={{ color: '#ef4444' }}>{saveError}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          id="sheets-submit"
          type="button"
          onClick={handleSubmit}
          disabled={saving || !selectedSpreadsheet || !selectedTab || (purpose === 'custom' && !customLabel.trim())}
          className="px-3 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: '#6C3BFF',
            color: '#fff',
            boxShadow: '0 1px 2px rgba(108,59,255,0.24)',
          }}
        >
          {saving ? 'Guardando...' : 'Agregar hoja'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-70"
          style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}
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
}

export default function SheetsMappingsSection({ token }: Props) {
  const [mappings, setMappings]             = useState<Mapping[]>([]);
  const [loading, setLoading]               = useState(true);
  const [loadError, setLoadError]           = useState(false);
  const [showAddForm, setShowAddForm]       = useState(false);
  const [spreadsheetsMap, setSpreadsheetsMap] = useState<Map<string, string>>(new Map());
  // null = still checking; true/false = known state
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/portal/${token}/sheets-mappings`);
      if (!res.ok) { setLoadError(true); return; }
      const d   = await res.json();
      setMappings(d.mappings ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch spreadsheet names once for human-readable display in MappingRow +
  // detecta si Google Workspace está conectado a nivel card (gate el UI antes
  // de que el usuario intente el flow de agregar).
  useEffect(() => {
    fetch(`/api/portal/${token}/sheets/spreadsheets`)
      .then(r => r.json())
      .then(d => {
        if (d.error === 'google_no_conectado') {
          setGoogleConnected(false);
          return;
        }
        setGoogleConnected(true);
        const list: Spreadsheet[] = d.spreadsheets ?? [];
        setSpreadsheetsMap(new Map(list.map(s => [s.id, s.name])));
      })
      .catch(() => { setGoogleConnected(false); });
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadMappings(); }, [loadMappings]);

  return (
    <section className="scroll-mt-6">
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#ffffff',
          border: '1px solid #E8E3F5',
          boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                Guardar copia en Google Sheets
              </h2>
              {mappings.length > 0 && (
                <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                  {mappings.length}
                </span>
              )}
            </div>
            <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
              Conecta hojas de Google Sheets a tu operación. Los leads que capture tu empleado se agregan como fila; y para clientes, órdenes de compra, bitácoras y cajas chicas puede consultar y agregar registros en la hoja que le indiques. Útil si ya llevas tu control en Sheets y no quieres migrar.
            </p>
          </div>
          {googleConnected && !loading && mappings.length > 0 && !showAddForm && (
            <div className="flex items-center gap-1.5">
              <button
                id="sheets-add-btn"
                type="button"
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90"
                style={{
                  background: '#6C3BFF',
                  color: '#fff',
                  boxShadow: '0 1px 2px rgba(108,59,255,0.24)',
                }}
              >
                <Plus size={13} />
                Agregar hoja
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        {googleConnected === false ? (
          /* Gate: sin Google conectado, un solo CTA claro en vez de form roto */
          <div style={{ borderTop: '1px solid #F0EDF9' }}>
            <EmptyState
              icon={Sheet}
              title="Primero conecta Google"
              description="Para leer y guardar en tus Sheets, tu empleado necesita acceso a Google Workspace. Se autoriza una sola vez desde Integraciones."
              size="sm"
              action={
                <Link
                  href={`/portal/${token}?tab=integraciones`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: '#6C3BFF',
                    color: '#fff',
                    boxShadow: '0 1px 2px rgba(108,59,255,0.24)',
                  }}
                >
                  <ExternalLink size={13} />
                  Ir a Integraciones
                </Link>
              }
            />
          </div>
        ) : loading || googleConnected === null ? (
          <div
            className="px-5 py-6 flex items-center gap-2 text-[13px]"
            style={{ borderTop: '1px solid #F0EDF9', color: '#6B6480' }}
          >
            <Loader2 size={15} className="animate-spin" />
            Cargando...
          </div>
        ) : mappings.length === 0 && !showAddForm ? (
          <div style={{ borderTop: '1px solid #F0EDF9' }}>
            <EmptyState
              icon={Sheet}
              title="Aún no hay ninguna hoja conectada"
              description="Agrega la primera hoja y elige qué se va a guardar ahí (leads, clientes, órdenes de compra, etc)."
              size="sm"
              action={
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    id="sheets-add-first"
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90"
                    style={{
                      background: '#6C3BFF',
                      color: '#fff',
                      boxShadow: '0 1px 2px rgba(108,59,255,0.24)',
                    }}
                  >
                    <Plus size={13} />
                    Agregar hoja
                  </button>
                  {loadError && (
                    <button
                      type="button"
                      onClick={loadMappings}
                      className="text-[11px] font-medium transition-opacity hover:opacity-70 inline-flex items-center gap-1"
                      style={{ color: '#9B8FB5' }}
                    >
                      <RefreshCw size={10} />
                      Reintentar carga
                    </button>
                  )}
                </div>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
            {mappings.map((m, idx) => (
              <MappingRow
                key={m.id}
                mapping={m}
                token={token}
                spreadsheetsMap={spreadsheetsMap}
                onRefresh={loadMappings}
                onDelete={loadMappings}
                isLast={idx === mappings.length - 1 && !showAddForm}
              />
            ))}
          </div>
        )}

        {/* Add form (rendered as sub-section with divider) */}
        {showAddForm && googleConnected && (
          <AddMappingForm
            token={token}
            onSaved={() => { setShowAddForm(false); loadMappings(); }}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </div>
    </section>
  );
}
