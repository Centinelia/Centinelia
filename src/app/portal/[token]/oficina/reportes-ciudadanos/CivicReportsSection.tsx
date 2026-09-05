'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, Phone, Calendar, ChevronDown, Search, X, Check, FileCheck2 } from 'lucide-react';
import {
  STATUS_LABELS, STATUS_COLORS, CATEGORY_LABELS,
  type CivicStatus, type TramiteDocsConfig,
} from '@/lib/civic/folio';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

interface CivicReport {
  id:               string;
  folio:            string;
  category:         string;
  description:      string | null;
  location_text:    string | null;
  status:           CivicStatus;
  caller_number:    string | null;
  caller_name:      string | null;
  notes:            string | null;
  tramite_tipo:     string | null;
  docs_received:    string[] | null;
  area_responsable: string | null;
  created_at:       string;
  resolved_at:      string | null;
}

const STATUS_ORDER: CivicStatus[] = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];

function StatusBadge({ status }: { status: CivicStatus }) {
  const cfg = STATUS_COLORS[status] ?? STATUS_COLORS.abierto;
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatusSelect({ folio, current, token, onChange }: {
  folio: string; current: CivicStatus; token: string; onChange: (s: CivicStatus) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);

  async function pick(s: CivicStatus) {
    setOpen(false);
    if (s === current) return;
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/civic-reports/${folio}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: s }),
      });
      onChange(s);
    } finally { setSaving(false); }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className="flex items-center gap-1.5 text-[11px] px-2.5 h-7 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}
      >
        <StatusBadge status={current} />
        <ChevronDown size={11} style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 flex flex-col rounded-xl overflow-hidden shadow-xl"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', minWidth: 140 }}>
          {STATUS_ORDER.map(s => (
            <button key={s} onClick={() => pick(s)}
              className="flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors hover:bg-[#FAFAFB]"
              style={{ color: s === current ? '#6C3BFF' : '#1A0A3B' }}>
              {s === current && <Check size={11} />}
              <span className={s === current ? 'ml-0' : 'ml-[15px]'}>{STATUS_LABELS[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DocsChecklist({ report, token, tramiteDocs, onUpdate }: {
  report: CivicReport;
  token: string;
  tramiteDocs: TramiteDocsConfig;
  onUpdate: (patch: Partial<CivicReport>) => void;
}) {
  const tipo = report.tramite_tipo;
  if (!tipo) return null;
  const required = tramiteDocs[tipo];
  if (!required?.length) return null;

  const received: string[] = report.docs_received ?? [];

  async function toggle(doc: string) {
    const newReceived = received.includes(doc)
      ? received.filter(d => d !== doc)
      : [...received, doc];
    await fetch(`/api/portal/${token}/civic-reports/${report.folio}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docs_received: newReceived }),
    });
    onUpdate({ docs_received: newReceived });
  }

  const doneCount = required.filter(d => received.includes(d)).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: '#6B6480' }}>
          <FileCheck2 size={12} /> Documentos: {tipo}
        </p>
        <span className="text-[11px] font-medium" style={{ color: doneCount === required.length ? '#22c55e' : '#9B8FB5' }}>
          {doneCount}/{required.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {required.map(doc => {
          const done = received.includes(doc);
          return (
            <button
              key={doc}
              onClick={() => toggle(doc)}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors hover:bg-[#FAFAFB]"
              style={{ border: '1px solid #E8E3F5', background: done ? 'rgba(34,197,94,0.06)' : '#ffffff' }}
            >
              <div className="flex-shrink-0 flex items-center justify-center rounded"
                style={{
                  width: 16, height: 16,
                  background: done ? '#22c55e' : '#ffffff',
                  border: done ? 'none' : '1.5px solid #E8E3F5',
                }}>
                {done && <Check size={10} color="#fff" />}
              </div>
              <span className="text-[12px]" style={{ color: done ? '#6B6480' : '#1A0A3B', textDecoration: done ? 'line-through' : 'none' }}>
                {doc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportRow({ report: initialReport, token, tramiteDocs, isLast, onUpdate }: {
  report: CivicReport; token: string; tramiteDocs: TramiteDocsConfig; isLast: boolean;
  onUpdate: (folio: string, patch: Partial<CivicReport>) => void;
}) {
  const [report,   setReport]   = useState(initialReport);
  const [expanded, setExpanded] = useState(false);
  const [notes,    setNotes]    = useState(report.notes ?? '');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const date = new Date(report.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

  function applyPatch(patch: Partial<CivicReport>) {
    setReport(r => ({ ...r, ...patch }));
    onUpdate(report.folio, patch);
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/civic-reports/${report.folio}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      setSaved(true);
      applyPatch({ notes });
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  const hasDocs = report.tramite_tipo && tramiteDocs[report.tramite_tipo]?.length;

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}>
      <div
        className="flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-[#FAFAFB]"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] font-bold" style={{ color: '#6C3BFF' }}>{report.folio}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              {CATEGORY_LABELS[report.category] ?? report.category}
            </span>
            {report.area_responsable && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium"
                style={{ background: 'rgba(34,197,94,0.08)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}>
                {report.area_responsable}
              </span>
            )}
            {report.tramite_tipo && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium"
                style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                {report.tramite_tipo}
              </span>
            )}
            {hasDocs && (() => {
              const req  = tramiteDocs[report.tramite_tipo!];
              const done = (report.docs_received ?? []).filter(d => req.includes(d)).length;
              const all  = done === req.length;
              return (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{ background: all ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: all ? '#16a34a' : '#d97706' }}>
                  {done}/{req.length} docs
                </span>
              );
            })()}
          </div>
          {report.description && (
            <p className="text-[13px] leading-snug line-clamp-2" style={{ color: '#1A0A3B' }}>{report.description}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {report.location_text && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: '#6B6480' }}>
                <MapPin size={11} />{report.location_text}
              </span>
            )}
            {report.caller_number && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: '#6B6480' }}>
                <Phone size={11} />{report.caller_name ? `${report.caller_name} · ` : ''}{report.caller_number}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#9B8FB5' }}>
              <Calendar size={11} />{date}
            </span>
          </div>
        </div>

        <div onClick={e => e.stopPropagation()}>
          <StatusSelect
            folio={report.folio} current={report.status} token={token}
            onChange={s => applyPatch({ status: s })}
          />
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-4 pt-3 flex flex-col gap-4"
          style={{ background: '#FAFAFB', borderTop: '1px solid #F0EDF9' }}>
          <DocsChecklist
            report={report}
            token={token}
            tramiteDocs={tramiteDocs}
            onUpdate={patch => applyPatch(patch)}
          />
          <div>
            <p className="text-[12px] font-semibold mb-1.5" style={{ color: '#6B6480' }}>Notas internas</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Agrega notas de seguimiento..."
              className="w-full text-[13px] px-3 py-2 rounded-lg resize-none outline-none"
              style={{
                background: '#ffffff', border: '1px solid #E8E3F5',
                color: '#1A0A3B',
              }}
            />
            <button
              onClick={saveNotes}
              disabled={saving || notes === (report.notes ?? '')}
              className="mt-2 flex items-center gap-1.5 text-[12px] px-3 h-8 rounded-lg font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
            >
              {saved ? <><Check size={12} /> Guardado</> : saving ? 'Guardando...' : 'Guardar notas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CivicReportsSection({ token, tramiteDocs }: { token: string; tramiteDocs: TramiteDocsConfig }) {
  const [reports,   setReports]   = useState<CivicReport[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [statusF,   setStatusF]   = useState<CivicStatus | ''>('');
  const [categoryF, setCategoryF] = useState('');
  const [areaF,     setAreaF]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusF)   sp.set('status', statusF);
      if (categoryF) sp.set('category', categoryF);
      if (search)    sp.set('q', search);
      const res = await fetch(`/api/portal/${token}/civic-reports?${sp}`);
      const data = await res.json();
      setReports(data.reports ?? []);
    } finally { setLoading(false); }
  }, [token, statusF, categoryF, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function handleUpdate(folio: string, patch: Partial<CivicReport>) {
    setReports(rs => rs.map(r => r.folio === folio ? { ...r, ...patch } : r));
  }

  const displayReports = areaF ? reports.filter(r => r.area_responsable === areaF) : reports;
  const allAreas       = [...new Set(reports.map(r => r.area_responsable).filter(Boolean))] as string[];

  const openCount      = displayReports.filter(r => r.status === 'abierto').length;
  const inProcessCount = displayReports.filter(r => r.status === 'en_proceso').length;

  const subtitle = openCount > 0 || inProcessCount > 0
    ? [
        openCount > 0 ? `${openCount} abierto${openCount !== 1 ? 's' : ''}` : '',
        inProcessCount > 0 ? `${inProcessCount} en proceso` : '',
      ].filter(Boolean).join(' · ')
    : 'Sin reportes pendientes';

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Folios recibidos
            </h2>
            {reports.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {displayReports.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>{subtitle}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 pb-3 flex gap-2 flex-wrap"
        style={{ borderTop: '1px solid #F0EDF9', paddingTop: 12 }}>
        <div className="flex items-center gap-2 flex-1 min-w-[200px] px-3 h-9 rounded-lg"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
          <Search size={13} style={{ color: '#9B8FB5', flexShrink: 0 }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por folio, descripción, teléfono..."
            className="flex-1 text-[13px] bg-transparent outline-none"
            style={{ color: '#1A0A3B' }}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
              <X size={12} style={{ color: '#9B8FB5' }} />
            </button>
          )}
        </div>

        <Select value={statusF || '__all'} onValueChange={v => setStatusF(v === '__all' ? '' : (v as CivicStatus))}>
          <SelectTrigger className="w-auto rounded-lg h-9 text-[12px]"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los estatus</SelectItem>
            {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={categoryF || '__all'} onValueChange={v => setCategoryF(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-auto rounded-lg h-9 text-[12px]"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas las categorías</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        {allAreas.length > 0 && (
          <Select value={areaF || '__all'} onValueChange={v => setAreaF(v === '__all' ? '' : v)}>
            <SelectTrigger className="w-auto rounded-lg h-9 text-[12px]"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#6B6480' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas las áreas</SelectItem>
              {allAreas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {[1,2,3].map((i, idx) => (
            <div key={i} className="px-5 py-4 h-20 animate-pulse"
              style={{ borderBottom: idx === 2 ? 'none' : '1px solid #F0EDF9', background: '#FAFAFB' }} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <EmptyState
            icon={MapPin}
            title={search || statusF || categoryF ? 'Sin resultados para ese filtro' : 'No hay reportes ciudadanos aún'}
          />
        </div>
      ) : displayReports.length === 0 ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <EmptyState icon={MapPin} title="Sin resultados para ese filtro" />
        </div>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {displayReports.map((r, idx) => (
            <ReportRow
              key={r.id}
              report={r}
              token={token}
              tramiteDocs={tramiteDocs}
              isLast={idx === displayReports.length - 1}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
