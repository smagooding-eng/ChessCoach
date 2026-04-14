import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { EloProgress, MultiEloProgress } from '@/hooks/use-elo-progress';

const CHESSCOM_GREEN = '#81b64c';
const LICHESS_WHITE = '#b0b0b0';
const TEXT_MUTED = '#9e9b98';

function MiniSparkline({ data, width = 60, height = 20, color: overrideColor }: { data: number[]; width?: number; height?: number; color?: string }) {
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
  const color = overrideColor ?? (lastVal > firstVal ? CHESSCOM_GREEN : lastVal < firstVal ? '#dc4343' : TEXT_MUTED);
  const gradId = `sparkFill-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${padding},${height} ${points} ${width - padding},${height}`}
        fill={`url(#${gradId})`}
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

function getDeltaColor(delta: number) {
  if (delta > 0) return CHESSCOM_GREEN;
  if (delta < 0) return '#dc4343';
  return TEXT_MUTED;
}

function EloLine({ elo, label, accentColor }: { elo: EloProgress; label: string; accentColor?: string }) {
  const color = getDeltaColor(elo.delta);
  const Icon = elo.delta > 0 ? TrendingUp : elo.delta < 0 ? TrendingDown : Minus;
  const sign = elo.delta > 0 ? '+' : '';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-wider w-5 shrink-0" style={{ color: accentColor || TEXT_MUTED }}>
        {label}
      </span>
      <MiniSparkline data={elo.sparkline} width={36} height={14} />
      <span className="text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>
        {elo.currentRating}
      </span>
      <div className="flex items-center gap-0.5">
        <Icon className="w-2.5 h-2.5" style={{ color }} />
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
          {sign}{elo.delta}
        </span>
      </div>
    </div>
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
      <span className="text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>
        {elo.currentRating}
      </span>
      <div className="flex items-center gap-0.5">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
          {sign}{elo.delta}
        </span>
      </div>
    </div>
  );
}

export function MultiEloTrackerBadge({ multi }: { multi: MultiEloProgress }) {
  const { combined, chesscom, lichess } = multi;
  const hasBoth = chesscom?.hasData && lichess?.hasData;
  const hasAny = combined?.hasData || chesscom?.hasData || lichess?.hasData;

  if (!hasAny) return null;

  if (!hasBoth) {
    const single = combined ?? chesscom ?? lichess;
    if (!single || !single.hasData || single.sparkline.length < 2) return null;
    return <EloTrackerBadge elo={single} />;
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.04)' }}>
      {chesscom?.hasData && chesscom.sparkline.length >= 2 && (
        <EloLine elo={chesscom} label="CC" accentColor={CHESSCOM_GREEN} />
      )}
      {lichess?.hasData && lichess.sparkline.length >= 2 && (
        <EloLine elo={lichess} label="LC" accentColor={LICHESS_WHITE} />
      )}
      {combined?.hasData && combined.sparkline.length >= 2 && (
        <EloLine elo={combined} label="All" accentColor="#f0c040" />
      )}
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
    <span className="flex items-center gap-0.5">
      <span className="text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>
        {elo.currentRating}
      </span>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
        ({sign}{elo.delta})
      </span>
    </span>
  );
}

export function MultiEloInline({ multi }: { multi: MultiEloProgress }) {
  const { chesscom, lichess } = multi;
  const hasCC = chesscom?.hasData && chesscom.sparkline.length >= 2;
  const hasLC = lichess?.hasData && lichess.sparkline.length >= 2;

  if (!hasCC && !hasLC) return null;

  return (
    <span className="flex items-center gap-1">
      {hasCC && (
        <span className="flex items-center gap-0.5">
          <span className="text-[8px] font-bold" style={{ color: CHESSCOM_GREEN }}>CC</span>
          <span className="text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>
            {chesscom!.currentRating}
          </span>
          <span className="text-[9px] font-bold tabular-nums" style={{ color: getDeltaColor(chesscom!.delta) }}>
            ({chesscom!.delta > 0 ? '+' : ''}{chesscom!.delta})
          </span>
        </span>
      )}
      {hasCC && hasLC && <span className="text-[8px]" style={{ color: TEXT_MUTED }}>/</span>}
      {hasLC && (
        <span className="flex items-center gap-0.5">
          <span className="text-[8px] font-bold" style={{ color: LICHESS_WHITE }}>LC</span>
          <span className="text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>
            {lichess!.currentRating}
          </span>
          <span className="text-[9px] font-bold tabular-nums" style={{ color: getDeltaColor(lichess!.delta) }}>
            ({lichess!.delta > 0 ? '+' : ''}{lichess!.delta})
          </span>
        </span>
      )}
    </span>
  );
}
