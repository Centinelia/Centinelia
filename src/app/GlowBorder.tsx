import React from 'react';

type Props = {
  children: React.ReactNode;
  radius?: number;
  thickness?: number;
  speed?: number;
  inline?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function GlowBorder({
  children,
  radius = 16,
  thickness = 2,
  speed = 4,
  inline = false,
  className = '',
  style,
}: Props) {
  const classes = ['glow-border', inline ? 'glow-border-inline' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{
        ['--glow-radius' as string]: `${radius}px`,
        ['--glow-thickness' as string]: `${thickness}px`,
        ['--glow-speed' as string]: `${speed}s`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
