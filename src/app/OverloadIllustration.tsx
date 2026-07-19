'use client';

import { motion } from 'motion/react';
import { Phone, MessageCircle, Mail, Calendar, Bell, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Badge = {
  label: string; Icon: LucideIcon; color: string; count: number;
  left: string; top: string; delay: number; dur: number;
  xs: number[]; ys: number[]; rots: number[];
};

const BADGES: Badge[] = [
  {
    label: 'Llamadas', Icon: Phone, color: '#f87171', count: 8,
    left: '43%', top: '14%', delay: 0, dur: 8.0,
    xs:   [0, -55, -90, -65, -15, -60, -25, 0],
    ys:   [0, -30, -55, -20,  70,  90,  50,  0],
    rots: [0,  0.5,  -1, 0.8,-0.5, 0.8,-0.5, 0],
  },
  {
    label: 'WhatsApp', Icon: MessageCircle, color: '#4ade80', count: 12,
    left: '2%', top: '26%', delay: 1.1, dur: 7.5,
    xs:   [0,  60,  90,  70,  25,  65,  25, 0],
    ys:   [0,  60,  80,  55, -25, -55, -30,  0],
    rots: [0,-0.8, 0.5,-0.8, 0.5,-0.5, 0.8, 0],
  },
  {
    label: 'Correos', Icon: Mail, color: '#60a5fa', count: 6,
    left: '41%', top: '40%', delay: 0.5, dur: 6.5,
    xs:   [0, -50, -85, -60, -15, -60, -25, 0],
    ys:   [0, -60, -80, -50,  30,  65,  35,  0],
    rots: [0,  0.8,-0.5,   1,-0.8, 0.5,-0.8, 0],
  },
  {
    label: 'Citas', Icon: Calendar, color: '#a78bfa', count: 3,
    left: '3%', top: '54%', delay: 1.8, dur: 9.0,
    xs:   [0,  65,  90,  70,  25,  60,  20, 0],
    ys:   [0, -70, -90, -60,  20,  50,  25,  0],
    rots: [0,-0.5, 0.8,  -1, 0.8,-0.8, 0.5, 0],
  },
  {
    label: 'Seguimientos', Icon: Bell, color: '#fbbf24', count: 4,
    left: '39%', top: '66%', delay: 0.7, dur: 7.0,
    xs:   [0, -45, -80, -55, -10, -55, -20, 0],
    ys:   [0, -50, -75, -45,  25,  55,  30,  0],
    rots: [0,  0.5,-0.8,   1,-0.5, 0.8,-0.5, 0],
  },
  {
    label: 'Documentos', Icon: FileText, color: '#94a3b8', count: 2,
    left: '2%', top: '80%', delay: 1.4, dur: 8.5,
    xs:   [0,  60,  90,  70,  25,  60,  20, 0],
    ys:   [0, -70, -90, -60,  15,  35,  15,  0],
    rots: [0,-0.5, 0.8,-0.8,   1,-0.8, 0.5, 0],
  },
];

export default function OverloadIllustration() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>

      {/* Caption pinned to the very top = aligns with subtitle in right column */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '0 12px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
          No son demasiados clientes.<br />
          <span style={{ color: '#C4A8FF' }}>Son demasiadas tareas para una sola persona.</span>
        </p>
      </div>

      {BADGES.map(({ label, Icon, color, count, left, top, delay, dur, xs, ys, rots }) => (
        <div key={label} style={{ position: 'absolute', left, top }}>
          <motion.div
            animate={{ x: xs, y: ys, rotate: rots }}
            transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'relative', display: 'inline-flex', willChange: 'transform' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 16px', borderRadius: '100px',
              background: 'rgba(20,10,50,0.72)',
              border: `1.5px solid ${color}45`,
              whiteSpace: 'nowrap',
              boxShadow: `0 2px 20px ${color}22`,
            }}>
              <Icon size={15} color={color} />
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
                {label}
              </span>
            </div>
            <div style={{
              position: 'absolute', top: -10, right: -10,
              minWidth: 26, height: 26, borderRadius: '100px',
              background: '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 800, color: '#fff',
              border: '2.5px solid #0D0520', padding: '0 5px', letterSpacing: '-0.5px',
            }}>
              {count}
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  );
}
