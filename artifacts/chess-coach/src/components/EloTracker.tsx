import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { EloProgress } from '@/hooks/use-elo-progress';

const CHESSCOM_GREEN = '#81b64c';
const TEXT_MUTED = '#9e9b98';

function MiniSparkline({ data, width = 60, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const color = lastVal > firstVal ? CHESSCOM_GREEN : lastVal < firstVal ? '#dc4343' : TEXT_MUTED;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${padding},${height} ${points} ${width - padding},${height}`}
        fill="url(#sparkFill)"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EloTrackerBadge({ elo }: { elo: EloProgress }) {
  if (!elo.hasData || elo.sparkline.length < 2) return null;

  const isUp = elo.delta > 0;
  const isDown = elo.delta < 0;
  const color = isUp ? CHESSCOM_GREEN : isDown ? '#dc4343' : TEXT_MUTED;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const sign = isUp ? '+' : '';

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <MiniSparkline data={elo.sparkline} width={44} height={16} />
      <div className="flex items-center gap-0.5">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
          {sign}{elo.delta}
        </span>
      </div>
    </div>
  );
}

export function EloTrackerInline({ elo }: { elo: EloProgress }) {
  if (!elo.hasData || elo.sparkline.length < 2) return null;

  const isUp = elo.delta > 0;
  const isDown = elo.delta < 0;
  const color = isUp ? CHESSCOM_GREEN : isDown ? '#dc4343' : TEXT_MUTED;
  const sign = isUp ? '+' : '';

  return (
    <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
      {sign}{elo.delta}
    </span>
  );
}
