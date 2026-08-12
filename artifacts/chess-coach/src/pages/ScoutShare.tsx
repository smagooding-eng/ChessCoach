import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'wouter';
import { PageHero, CHESSCOM_GREEN, TEXT_LIGHT, TEXT_MUTED, BRASS } from '@/components/DesignSystem';
import { Target, Download, UserPlus, Loader2 } from 'lucide-react';

interface QuickWeakness {
  category: string;
  severity: string;
  description: string;
  frequency: number;
}
interface ScoutSide {
  username: string;
  weaknesses: QuickWeakness[];
  gamesChecked: number;
}
interface ScoutResponse {
  user: ScoutSide;
  opponent: ScoutSide | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#dc4343',
  High: '#e88930',
  Medium: '#e8c830',
  Low: '#7a9e5c',
};

function decodeReport(encoded: string): ScoutResponse | null {
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    const parsed = JSON.parse(json);
    if (!parsed?.user?.username || !Array.isArray(parsed?.user?.weaknesses)) return null;
    return parsed as ScoutResponse;
  } catch {
    return null;
  }
}

export function encodeReport(report: ScoutResponse): string {
  const json = JSON.stringify(report);
  return encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
}

function ScoutSideCard({ side, label }: { side: ScoutSide; label: string }) {
  return (
    <div className="rounded-2xl p-4 md:p-5" style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: TEXT_MUTED }}>{label}</p>
          <p className="font-display text-lg font-semibold" style={{ color: TEXT_LIGHT }}>{side.username}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: TEXT_MUTED }}>
          {side.gamesChecked} games checked
        </span>
      </div>
      <div className="space-y-2">
        {side.weaknesses.length === 0 ? (
          <p className="text-xs" style={{ color: TEXT_MUTED }}>No major patterns found — solid play across the games checked.</p>
        ) : (
          side.weaknesses.map((w) => {
            const color = SEVERITY_COLORS[w.severity] ?? SEVERITY_COLORS.Medium;
            return (
              <div key={w.category} className="py-2.5 px-3 rounded-xl" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: TEXT_LIGHT }}>{w.category}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>{w.severity}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>{w.description}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ScoutShare() {
  const params = useParams<{ data: string }>();
  const [report, setReport] = useState<ScoutResponse | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!params.data) { setInvalid(true); return; }
    const decoded = decodeReport(params.data);
    if (!decoded) { setInvalid(true); return; }
    setReport(decoded);
  }, [params.data]);

  const downloadImage = async () => {
    if (!captureRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#262421',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `chessscout-report-${report?.user.username ?? 'report'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // If image generation fails for any reason, fail silently rather than
      // blocking the person from still using the page — the link itself
      // remains fully shareable regardless.
    }
    setDownloading(false);
  };

  if (invalid) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-sm" style={{ color: TEXT_MUTED }}>
          This link looks broken or expired. Scouting reports are encoded directly in the link, so it needs to be copied in full.
        </p>
        <Link href="/" className="inline-block mt-4 text-sm font-semibold" style={{ color: CHESSCOM_GREEN }}>
          Try scouting a player yourself →
        </Link>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: CHESSCOM_GREEN }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <PageHero
        piece="♛"
        eyebrow="Scouting Report"
        title={report.opponent ? `${report.user.username} vs ${report.opponent.username}` : report.user.username}
        subtitle="Generated by ChessScout.net — a free, no-signup breakdown of real weaknesses from real recent games."
      />

      <div ref={captureRef} className="space-y-4 p-4 rounded-2xl" style={{ background: '#262421' }}>
        <ScoutSideCard side={report.user} label="Player" />
        {report.opponent && <ScoutSideCard side={report.opponent} label="Most recent opponent" />}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <Target className="w-3.5 h-3.5" style={{ color: BRASS }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRASS }}>chessscout.net</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={downloadImage}
          disabled={downloading}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download as image
        </button>
        <Link href="/"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black"
          style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}
        >
          <UserPlus className="w-4 h-4" />
          Get your own report
        </Link>
      </div>
    </div>
  );
}
