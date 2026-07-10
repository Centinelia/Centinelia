'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Square, Check, Loader, ChevronDown } from 'lucide-react';

type ElevenVoice = {
  voice_id: string;
  name: string;
  preview_url: string | null;
  labels: Record<string, string>;
};

const DESC_LABEL: Record<string, string> = {
  calm:           'Tranquila',
  energetic:      'Energética',
  friendly:       'Amigable',
  professional:   'Profesional',
  warm:           'Cálida',
  confident:      'Segura',
  soft:           'Suave',
  deep:           'Profunda',
  crisp:          'Nítida',
  smooth:         'Fluida',
  raspy:          'Ronca',
  storyteller:    'Narrativa',
  conversational: 'Conversacional',
  narrative:      'Narrativa',
  natural:        'Natural',
  excited:        'Animada',
  formal:         'Formal',
  casual:         'Casual',
  neutral:        'Neutral',
  upbeat:         'Dinámica',
  gentle:         'Gentil',
  classy:         'Elegante',
};

// Description overrides, checked first, before the ElevenLabs `descriptive` label
const VOICE_DESC_OVERRIDE: Record<string, string> = {
  // Female
  'jUxkp8eMgszgJX3XU2pV': 'Bilingüe',  // Annie, EL label 'casual', pero es bilingüe
  'nTkjq09AuYgsNR8E4sDe': 'Regia',      // Cristina, EL label 'excited'
  'crQgCQuWgUucmYHEPsrB': 'Enérgica',   // Fran, EL label 'excited', pero es más energética
  'cAvMBIZ0VNTU8XdsUpEq': 'Cálida',     // Susana, EL label 'casual', pero es "Warm, Soft"
  // Male
  'htFfPSZGJwjBv1CL0aMD': 'Neutral',    // Antonio, EL label 'confident'
  'id7LQ3n0ft94moeTT1ER': 'Intenso',    // David, EL label 'professional', pero es "Intense, Rapid"
  'dlGxemPxFMTY7iXagmOj': 'Persuasivo', // Fernando, EL label 'casual', pero es "Rapid, Persuasive"
  'sDh3eviBhiuHKi0MjTNq': 'Elegante',   // Francis, EL label 'professional', pero es "Corporate, Elegant"
  '3mmJ2Z5SLZ9OkeZZcv5p': 'Fluido',     // Oscar, EL label 'confident', pero es "Fluid pitch"
};

// Name overrides, removes last names and fixes non-standard dash patterns
const VOICE_NAME_OVERRIDE: Record<string, string> = {
  // Female
  'j7e3J6ksqsziQcIGyAWI': 'Valentina',   // Valentina
  'jUxkp8eMgszgJX3XU2pV': 'Centinelia', // Annie KPasa, voz oficial
  'hrlCBOGwBPZYViXHeZjS': 'Sofía',      // "Sofía Juliette - ..."
  'cAvMBIZ0VNTU8XdsUpEq': 'Susana',     // "Susana Elizabeth - ..."
  'nTkjq09AuYgsNR8E4sDe': 'Cristina',   // "Cristina Campos - ..."
  'pBabaO9WxfrjXjKADHma': 'Cindy',      // "Cindy Calderon" (sin guion)
  // Male
  'YKUjKbMlejgvkOZlnnvt': 'Alejandro',  // "Alejandro Ballesteros-Warm..." (guion sin espacios)
  'XgQWNZcJ8SRkxXwwhPTo': 'Brian',      // "Brian Cortez - ..."
  'dlGxemPxFMTY7iXagmOj': 'Fernando',   // "Fernando Martínez - ..."
};

const MASCULINE_MAP: Record<string, string> = {
  'Tranquila':   'Tranquilo',
  'Energética':  'Energético',
  'Cálida':      'Cálido',
  'Segura':      'Seguro',
  'Profunda':    'Profundo',
  'Nítida':      'Nítido',
  'Fluida':      'Fluido',
  'Ronca':       'Ronco',
  'Narrativa':   'Narrativo',
  'Animada':     'Animado',
  'Dinámica':    'Dinámico',
};

function getBaseName(voice: ElevenVoice): string {
  if (VOICE_NAME_OVERRIDE[voice.voice_id]) return VOICE_NAME_OVERRIDE[voice.voice_id];
  const dash = voice.name.indexOf(' - ');
  return dash !== -1 ? voice.name.slice(0, dash) : voice.name;
}

function getDescription(voice: ElevenVoice): string | null {
  const override = VOICE_DESC_OVERRIDE[voice.voice_id];
  const key      = voice.labels.descriptive?.toLowerCase();
  const base     = override ?? (key ? (DESC_LABEL[key] ?? key) : null);
  if (!base) return null;
  if (voice.labels.gender?.toLowerCase() === 'male') return MASCULINE_MAP[base] ?? base;
  return base;
}

function VoiceCard({
  voice,
  isSelected,
  isPlaying,
  onPlay,
  onSelect,
}: {
  voice: ElevenVoice;
  isSelected: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onSelect: () => void;
}) {
  const displayName = getBaseName(voice);
  const desc        = getDescription(voice);
  const hasPreview  = !!voice.preview_url || (voice.labels.language?.toLowerCase() !== 'es');

  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
      style={{
        background: isSelected ? 'rgba(108,59,255,0.08)' : 'var(--c-surface-2)',
        border:     `2px solid ${isSelected ? '#6C3BFF' : 'transparent'}`,
        outline:    isSelected ? 'none' : '1px solid var(--c-border)',
      }}
    >
      {/* Play button */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onPlay(); }}
        disabled={!hasPreview}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background: isPlaying ? '#6C3BFF' : isSelected ? 'rgba(108,59,255,0.15)' : 'var(--c-surface)',
          border:     `1px solid ${isPlaying ? '#6C3BFF' : isSelected ? 'rgba(108,59,255,0.3)' : 'var(--c-border)'}`,
          opacity:    hasPreview ? 1 : 0.25,
        }}
      >
        {isPlaying
          ? <Square size={10} fill="#fff" style={{ color: '#fff' }} />
          : <Play   size={10} fill={isSelected ? '#6C3BFF' : 'var(--c-text-3)'}
                              style={{ color: isSelected ? '#6C3BFF' : 'var(--c-text-3)', marginLeft: 1 }} />
        }
      </button>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: isSelected ? '#6C3BFF' : 'var(--c-text)' }}>
          {displayName}
        </p>
        {desc && (
          <div className="mt-1">
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
              {desc}
            </span>
          </div>
        )}
      </div>

      {isSelected && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: '#6C3BFF' }}>
          <Check size={11} style={{ color: '#fff' }} />
        </div>
      )}
    </div>
  );
}

const OFFICIAL_VOICE_ID = 'jUxkp8eMgszgJX3XU2pV';

export default function VoiceSelector({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (voiceId: string) => void;
}) {
  const [voices, setVoices]   = useState<ElevenVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [open, setOpen]       = useState<Record<string, boolean>>({ female: false, male: false, other: false });
  const audioRef              = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/voices')
      .then(r => r.json())
      .then(d => {
        const list: ElevenVoice[] = d.voices ?? [];
        setVoices(list);
      })
      .finally(() => setLoading(false));
  }, [selected]);

  const getPreviewUrl = (voice: ElevenVoice): string | null => {
    // Non-Spanish voices get a Spanish TTS sample instead of the native preview
    const lang = voice.labels.language?.toLowerCase();
    if (lang && lang !== 'es') return `/api/voices/${voice.voice_id}/sample`;
    return voice.preview_url;
  };

  const playPreview = (voice: ElevenVoice) => {
    const url = getPreviewUrl(voice);
    if (!url) return;
    if (playing === voice.voice_id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play();
    setPlaying(voice.voice_id);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
  };

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6" style={{ color: 'var(--c-text-3)' }}>
        <Loader size={14} className="animate-spin" />
        <span className="text-sm">Cargando voces…</span>
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <p className="text-sm py-4" style={{ color: 'var(--c-text-3)' }}>
        No se encontraron voces. Verifica la clave de ElevenLabs en Vercel.
      </p>
    );
  }

  const groups: { key: string; label: string; emoji: string; voices: ElevenVoice[] }[] = [
    {
      key:    'female',
      label:  'Voces femeninas',
      emoji:  '👩',
      voices: [
        ...voices.filter(v => v.voice_id === OFFICIAL_VOICE_ID),
        ...voices.filter(v => v.labels.gender?.toLowerCase() === 'female' && v.voice_id !== OFFICIAL_VOICE_ID),
      ],
    },
    {
      key:    'male',
      label:  'Voces masculinas',
      emoji:  '👨',
      voices: voices.filter(v => v.labels.gender?.toLowerCase() === 'male'),
    },
    {
      key:    'other',
      label:  'Otras voces',
      emoji:  '🎙️',
      voices: voices.filter(v => !v.labels.gender || !['female', 'male'].includes(v.labels.gender.toLowerCase())),
    },
  ].filter(g => g.voices.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {groups.map(group => {
        const hasSelected = group.voices.some(v => v.voice_id === selected);
        const selectedVoice = hasSelected ? group.voices.find(v => v.voice_id === selected) : null;
        return (
        <div key={group.key} className="rounded-xl overflow-hidden"
          style={{ border: hasSelected && !open[group.key] ? '1px solid #6C3BFF' : '1px solid var(--c-border)' }}>

          {/* Collapsible header */}
          <button
            type="button"
            onClick={() => toggle(group.key)}
            className="w-full flex items-center gap-2 px-4 py-3 transition-colors"
            style={{ background: hasSelected && !open[group.key] ? 'rgba(108,59,255,0.06)' : 'var(--c-surface-2)' }}
          >
            <span className="text-sm">{group.emoji}</span>
            <span className="text-xs font-semibold tracking-widest uppercase flex-1 text-left"
              style={{ color: 'var(--c-text-3)' }}>
              {group.label}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--c-surface)', color: 'var(--c-text-4)', border: '1px solid var(--c-border)' }}>
              {group.voices.length}
            </span>
            {hasSelected && !open[group.key] && selectedVoice && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }}>
                {getBaseName(selectedVoice)}
              </span>
            )}
            <ChevronDown size={14} style={{
              color: hasSelected && !open[group.key] ? '#9B6DFF' : 'var(--c-text-3)',
              transform: open[group.key] ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }} />
          </button>

          {/* Voice grid */}
          {open[group.key] && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 p-3"
              style={{ borderTop: '1px solid var(--c-border)' }}>
              {group.voices.map(v => (
                <VoiceCard
                  key={v.voice_id}
                  voice={v}
                  isSelected={selected === v.voice_id}
                  isPlaying={playing === v.voice_id}
                  onPlay={() => playPreview(v)}
                  onSelect={() => onChange(v.voice_id)}
                />
              ))}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
