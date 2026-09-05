'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import OficinaModal from './OficinaModal';

/**
 * Modal para importar contactos desde una fuente conectada (Notion DB o Sheet).
 *
 * Flujo:
 *   1. Se abre → llama /sources → muestra selector de fuente + selector de DB/sheet.
 *   2. Al elegir DB/sheet → muestra field mapper (auto-detecta phone/name/email/tags).
 *   3. Al dar "Importar" → POST /import con mapping → muestra resultado (inserted/updated/skipped).
 *
 * Dedupe: re-imports actualizan por (agent_id, external_source, external_id) —
 * no duplica si un contacto ya existe.
 */

interface Agent {
  id:            string;
  agent_name:    string | null;
  business_name: string;
}

interface NotionDb {
  id:         string;
  title:      string;
  properties: Record<string, { type: string; name: string }>;
}

interface SheetsMapping {
  id:                    string;
  purpose:               string;
  custom_purpose_label:  string | null;
  spreadsheet_id:        string;
  tab_name:              string;
  headers:               string[];
}

interface Sources {
  notion: { connected: boolean; databases: NotionDb[] };
  sheets: { connected: boolean; mappings:  SheetsMapping[] };
}

interface ImportResult {
  total:    number;
  inserted: number;
  updated:  number;
  skipped:  number;
  sample:   Array<{ nombre?: string; telefono: string; email?: string; tags?: string[] }>;
}

const asMappingLabel = (m: SheetsMapping) =>
  m.custom_purpose_label ? `${m.custom_purpose_label} (${m.tab_name})` : `${m.purpose} (${m.tab_name})`;

/** Heurísticas para auto-detectar qué columna es teléfono/nombre/email/tags. */
function autoDetectMapping(columns: { name: string; type?: string }[]) {
  const find = (patterns: RegExp[]) => {
    for (const c of columns) {
      for (const p of patterns) if (p.test(c.name)) return c.name;
    }
    return '';
  };
  return {
    phone:  find([/^phone/i, /tel[eé]fono/i, /celular/i, /whatsapp/i, /wa$/i, /^tel$/i, /mobile/i]),
    name:   find([/^nombre/i, /^name$/i, /^title$/i, /cliente/i, /contacto/i]),
    email:  find([/^correo/i, /^email/i, /^mail$/i, /e-mail/i]),
    tags:   find([/^tags?$/i, /etiquetas/i, /categor[íi]a/i, /segmento/i]),
    motivo: find([/^motivo$/i, /raz[oó]n/i, /^nota/i]),
  };
}

export default function ImportContactsModal({
  open, token, agents, onClose, onImported,
}: {
  open:       boolean;
  token:      string;
  agents:     Agent[];
  onClose:    () => void;
  onImported: () => void;
}) {
  const [sources,   setSources]   = useState<Sources | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [provider,  setProvider]  = useState<'notion' | 'sheets'>('notion');
  const [sourceId,  setSourceId]  = useState('');
  const [agentId,   setAgentId]   = useState(agents[0]?.id ?? '');
  const [mapping,   setMapping]   = useState<{ phone: string; name: string; email: string; tags: string; motivo: string }>({
    phone: '', name: '', email: '', tags: '', motivo: '',
  });
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [result,    setResult]    = useState<ImportResult | null>(null);

  // Load sources when modal opens
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');
    setResult(null);
    fetch(`/api/portal/${token}/contacts/import/sources`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then((s: Sources) => {
        setSources(s);
        // Default provider = whichever is connected first
        const firstProvider = s.notion.connected ? 'notion' : s.sheets.connected ? 'sheets' : 'notion';
        setProvider(firstProvider);
      })
      .catch(() => setError('No se pudieron cargar las fuentes conectadas.'))
      .finally(() => setLoading(false));
  }, [open, token]);

  // Columns available for the current selection
  const columns: { name: string; type?: string }[] = (() => {
    if (!sources || !sourceId) return [];
    if (provider === 'notion') {
      const db = sources.notion.databases.find(d => d.id === sourceId);
      if (!db) return [];
      return Object.values(db.properties).map(p => ({ name: p.name, type: p.type }));
    } else {
      const m = sources.sheets.mappings.find(mp => mp.id === sourceId);
      if (!m) return [];
      return (m.headers ?? []).map(h => ({ name: h }));
    }
  })();

  // Auto-detect mapping whenever source changes
  useEffect(() => {
    if (columns.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapping(autoDetectMapping(columns));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, provider]);

  const providerOptions: Array<{ id: 'notion' | 'sheets'; label: string; disabled: boolean }> = [
    { id: 'notion', label: 'Notion',        disabled: !sources?.notion.connected },
    { id: 'sheets', label: 'Google Sheets', disabled: !sources?.sheets.connected },
  ];

  const availableDbs = provider === 'notion'
    ? (sources?.notion.databases ?? []).map(d => ({ id: d.id, label: d.title }))
    : (sources?.sheets.mappings ?? []).map(m => ({ id: m.id, label: asMappingLabel(m) }));

  const handleImport = async (dryRun: boolean) => {
    if (!sourceId || !mapping.phone || !agentId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/contacts/import`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          provider,
          source_id: sourceId,
          agent_id:  agentId,
          mapping:   {
            phone: mapping.phone,
            name:  mapping.name  || undefined,
            email: mapping.email || undefined,
            tags:  mapping.tags  || undefined,
            motivo: mapping.motivo || undefined,
          },
          dry_run: dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al importar.'); return; }
      setResult(data as ImportResult);
      if (!dryRun) onImported();
    } catch {
      setError('Error de red al importar.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const noSources = sources && !sources.notion.connected && !sources.sheets.connected;
  const providerLabel = providerOptions.find(p => p.id === provider)?.label ?? '';

  return (
    <OficinaModal
      open
      onClose={onClose}
      eyebrow="Importar contactos"
      title={result ? 'Importación lista' : `Desde ${providerLabel}`}
      description={
        result
          ? 'Los contactos ya están en tu lista. Los duplicados se actualizaron sin crear nuevos.'
          : 'Trae contactos desde una fuente conectada. Los tags multi-select se importan igual y sirven de una vez para filtrar campañas.'
      }
      size="lg"
      footer={
        result ? (
          <OficinaModal.PrimaryAction onClick={onClose}>Cerrar</OficinaModal.PrimaryAction>
        ) : (
          <>
            <OficinaModal.SecondaryAction onClick={onClose}>Cancelar</OficinaModal.SecondaryAction>
            <OficinaModal.PrimaryAction
              onClick={() => handleImport(false)}
              loading={busy}
              disabled={!sourceId || !mapping.phone || !agentId || busy}
            >
              Importar
            </OficinaModal.PrimaryAction>
          </>
        )
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-[13px]" style={{ color: '#6B6480' }}>
          <Loader2 size={14} className="animate-spin" /> Cargando fuentes conectadas…
        </div>
      ) : noSources ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle size={28} style={{ color: '#F59E0B' }} />
          <p className="text-[14px] font-medium" style={{ color: '#1A0A3B' }}>
            No tienes fuentes conectadas todavía.
          </p>
          <p className="text-[12px] max-w-sm" style={{ color: '#6B6480' }}>
            Conecta Notion o Google Sheets desde <strong style={{ color: '#1A0A3B' }}>Oficina → Integraciones</strong> y regresa aquí para importar tu base de contactos.
          </p>
        </div>
      ) : result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Nuevos"       value={result.inserted}  accent="#22C55E" />
            <StatCard label="Actualizados" value={result.updated}   accent="#6C3BFF" />
            <StatCard label="Sin teléfono" value={result.skipped}   accent="#F59E0B" />
          </div>
          <p className="text-[12px]" style={{ color: '#6B6480' }}>
            Total leído: <strong style={{ color: '#1A0A3B' }}>{result.total}</strong>. Los contactos con teléfono válido ya aparecen en tu lista.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">

          {/* Provider selector */}
          <OficinaModal.Field label="Fuente conectada">
            <div className="flex gap-1.5">
              {providerOptions.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.disabled}
                  onClick={() => { setProvider(p.id); setSourceId(''); }}
                  className="flex-1 py-2 rounded-lg text-[12px] font-medium transition-all disabled:opacity-40"
                  style={{
                    background: provider === p.id ? '#6C3BFF' : '#ffffff',
                    color:      provider === p.id ? '#fff' : '#6B6480',
                    border:     `1px solid ${provider === p.id ? '#6C3BFF' : '#E8E3F5'}`,
                    boxShadow:  provider === p.id ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
                  }}
                >
                  {p.label}{p.disabled && ' (no conectado)'}
                </button>
              ))}
            </div>
          </OficinaModal.Field>

          {/* Source (DB or sheet) */}
          {availableDbs.length > 0 ? (
            <OficinaModal.Field label={provider === 'notion' ? 'Database de Notion' : 'Sheet mapeado'} hint="requerido">
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="rounded-lg text-[13px]"
                  style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                  <SelectValue placeholder={provider === 'notion' ? 'Elige una database…' : 'Elige un sheet…'} />
                </SelectTrigger>
                <SelectContent>
                  {availableDbs.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </OficinaModal.Field>
          ) : sources && (
            <p className="text-[12px] px-3 py-2 rounded-lg"
              style={{ background: '#FEF6E7', color: '#B45309', border: '1px solid #FCE4B0' }}>
              {provider === 'notion'
                ? 'No hay databases accesibles. Comparte al menos una con la integración de Notion.'
                : 'No hay sheets mapeados. Configura uno en Organización → CRM en Google Sheets.'}
            </p>
          )}

          {/* Agent target */}
          {agents.length > 1 && (
            <OficinaModal.Field label="Asignar al empleado">
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="rounded-lg text-[13px]"
                  style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.agent_name ?? a.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </OficinaModal.Field>
          )}

          {/* Field mapping */}
          {columns.length > 0 && (
            <OficinaModal.Field label="Mapea las columnas" hint="teléfono es requerido; el resto opcional">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <MapField label="Teléfono"  required value={mapping.phone}  onChange={v => setMapping(m => ({ ...m, phone: v }))}  columns={columns} />
                <MapField label="Nombre"             value={mapping.name}   onChange={v => setMapping(m => ({ ...m, name: v }))}   columns={columns} />
                <MapField label="Correo"             value={mapping.email}  onChange={v => setMapping(m => ({ ...m, email: v }))}  columns={columns} />
                <MapField label="Tags (multi-select)" value={mapping.tags}  onChange={v => setMapping(m => ({ ...m, tags: v }))}   columns={columns} />
                <MapField label="Motivo"             value={mapping.motivo} onChange={v => setMapping(m => ({ ...m, motivo: v }))} columns={columns} />
              </div>
            </OficinaModal.Field>
          )}

          {sourceId && mapping.phone && (
            <button type="button" onClick={() => handleImport(true)} disabled={busy}
              className="text-[12px] font-medium self-start px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              {busy ? <Loader2 size={11} className="animate-spin inline mr-1" /> : null}
              Ver preview sin importar
            </button>
          )}

          {error && (
            <p className="text-[13px] px-3 py-2 rounded-lg"
              style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </OficinaModal>
  );
}

function MapField({
  label, value, onChange, columns, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  columns: { name: string; type?: string }[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] mb-1" style={{ color: '#9B8FB5' }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      <Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="rounded-lg text-[12px]"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
          <SelectValue placeholder="(ninguna)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(ninguna)</SelectItem>
          {columns.map(c => (
            <SelectItem key={c.name} value={c.name}>
              {c.name}{c.type ? ` · ${c.type}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>{label}</p>
      <p className="text-[20px] font-bold tabular-nums" style={{ color: accent }}>{value}</p>
    </div>
  );
}

