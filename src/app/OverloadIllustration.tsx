'use client';

import { motion } from 'motion/react';
import { Phone, MessageCircle, Mail, Calendar, Bell, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Badge = {
  label: string; Icon: LucideIcon; color: string; count: number;
  left: string; top: string; delay: number; dur: number;
  xs: number[]; ys: number[]; rots: number[];
};

/* Left side — pills drift toward center (positive x) */
const BADGES_LEFT: Badge[] = [
  {
    label: 'Llamadas', Icon: Phone, color: '#f87171', count: 8,
    left: '4%', top: '8%', delay: 0, dur: 8.0,
    xs:   [0, 28, 52, 36, 10, 33, 14, 0],
    ys:   [0, -18, -38, -12, 40, 55, 26, 0],
    rots: [0, 0.5, -1, 0.8, -0.5, 0.8, -0.5, 0],
  },
  {
    label: 'WhatsApp', Icon: MessageCircle, color: '#4ade80', count: 12,
    left: '-6%', top: '42%', delay: 1.1, dur: 7.5,
    xs:   [0, 34, 58, 42, 14, 40, 20, 0],
    ys:   [0, 28, 46, 32, -14, -32, -16, 0],
    rots: [0, -0.8, 0.5, -0.8, 0.5, -0.5, 0.8, 0],
  },
  {
    label: 'Documentos', Icon: FileText, color: '#94a3b8', count: 2,
    left: '8%', top: '76%', delay: 1.4, dur: 8.5,
    xs:   [0, 30, 54, 38, 10, 34, 16, 0],
    ys:   [0, -42, -56, -36, 10, 22, 10, 0],
    rots: [0, -0.5, 0.8, -0.8, 1, -0.8, 0.5, 0],
  },
];

/* Right side — pills drift toward center (negative x) */
const BADGES_RIGHT: Badge[] = [
  {
    label: 'Correos', Icon: Mail, color: '#60a5fa', count: 6,
    left: '10%', top: '8%', delay: 0.5, dur: 6.5,
    xs:   [0, -28, -52, -38, -10, -34, -15, 0],
    ys:   [0, -38, -54, -34, 20, 42, 22, 0],
    rots: [0, 0.8, -0.5, 1, -0.8, 0.5, -0.8, 0],
  },
  {
    label: 'Citas', Icon: Calendar, color: '#a78bfa', count: 3,
    left: '-4%', top: '42%', delay: 1.8, dur: 9.0,
    xs:   [0, -32, -56, -42, -12, -38, -18, 0],
    ys:   [0, -44, -60, -40, 14, 32, 16, 0],
    rots: [0, -0.5, 0.8, -1, 0.8, -0.8, 0.5, 0],
  },
  {
    label: 'Seguimientos', Icon: Bell, color: '#fbbf24', count: 4,
    left: '4%', top: '76%', delay: 0.7, dur: 7.0,
    xs:   [0, -26, -50, -36, -8, -30, -12, 0],
    ys:   [0, -28, -48, -28, 16, 35, 18, 0],
    rots: [0, 0.5, -0.8, 1, -0.5, 0.8, -0.5, 0],
  },
];

export default function OverloadIllustration({ half }: { half: 'left' | 'right' }) {
  const badges = half === 'left' ? BADGES_LEFT : BADGES_RIGHT;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }}>
      {badges.map(({ label, Icon, color, count, left, top, delay, dur, xs, ys, rots }) => (
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
