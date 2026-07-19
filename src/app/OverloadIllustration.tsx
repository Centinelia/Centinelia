'use client';

import { motion } from 'motion/react';
import { Phone, MessageCircle, Mail, Calendar, Bell, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Container: top:250px, bottom:0, left:0, width:312px — adaptive height.
// Starts at subtitle level, stretches to section bottom regardless of viewport.
//
// Caption at top:2% → immediately at top = subtitle level.
// Badges from top:14% to top:82% → fills cards→quote area.
// X-travel capped so no badge exits the 312px zone.

type Badge = {
  label: string; Icon: LucideIcon; color: string; count: number;
  left: string; top: string; delay: number; dur: number;
  xs: number[]; ys: number[]; rots: number[];
};

const BADGES: Badge[] = [
  {
    label: 'Llamadas', Icon: Phone, color: '#f87171', count: 8,
    left: '43%', top: '10%', delay: 0, dur: 8.0,
    xs:   [0, -55, -90, -65, -15, -60, -25, 0],
    ys:   [0, -50, -80, -30, 180, 250, 150,  0],
    rots: [0,  0.5,  -1, 0.8,-0.5, 0.8,-0.5, 0],
  },
  {
    label: 'WhatsApp', Icon: MessageCircle, color: '#4ade80', count: 12,
    left: '2%', top: '22%', delay: 1.1, dur: 7.5,
    xs:   [0,  60,  90,  70,  25,  65,  25, 0],
    ys:   [0, 160, 230, 170, -80,-140, -60,  0],
    rots: [0,-0.8, 0.5,-0.8, 0.5,-0.5, 0.8, 0],
  },
  {
    label: 'Correos', Icon: Mail, color: '#60a5fa', count: 6,
    left: '41%', top: '36%', delay: 0.5, dur: 6.5,
    xs:   [0, -50, -85, -60, -15, -60, -25, 0],
    ys:   [0,-140,-200,-160,  90, 170,  80,  0],
    rots: [0,  0.8,-0.5,   1,-0.8, 0.5,-0.8, 0],
  },
  {
    label: 'Citas', Icon: Calendar, color: '#a78bfa', count: 3,
    left: '3%', top: '50%', delay: 1.8, dur: 9.0,
    xs:   [0,  65,  90,  70,  25,  60,  20, 0],
    ys:   [0,-170,-240,-190,  50, 100,  50,  0],
    rots: [0,-0.5, 0.8,  -1, 0.8,-0.8, 0.5, 0],
  },
  {
    label: 'Seguimientos', Icon: Bell, color: '#fbbf24', count: 4,
    left: '39%', top: '64%', delay: 0.7, dur: 7.0,
    xs:   [0, -45, -80, -55, -10, -55, -20, 0],
    ys:   [0,-130,-200,-160,  40,  80,  40,  0],
    rots: [0,  0.5,-0.8,   1,-0.5, 0.8,-0.5, 0],
  },
  {
    label: 'Documentos', Icon: FileText, color: '#94a3b8', count: 2,
    left: '2%', top: '78%', delay: 1.4, dur: 8.5,
    xs:   [0,  60,  90,  70,  25,  60,  20, 0],
    ys:   [0,-160,-230,-180,  30,  60,  30,  0],
    rots: [0,-0.5, 0.8,-0.8,   1,-0.8, 0.5, 0],
  },
];

export default function OverloadIllustration() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>

      {/* Caption at the very top of the illustration = subtitle level */}
      <div style={{ position: 'absolute', top: '2%', left: 0, right: 0, padding: '0 12px', textAlign: 'center' }}>
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
              background: 'rgba(255,255,255,0.09)',
              border: `1.5px solid ${color}45`,
              backdropFilter: 'blur(10px)',
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
