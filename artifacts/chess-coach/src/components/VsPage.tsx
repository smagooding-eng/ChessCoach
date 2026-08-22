import { Link } from 'wouter';
import { ArrowLeft, Check, Minus, ArrowRight } from 'lucide-react';
import { setPageMeta } from '@/lib/pageMeta';
import { useEffect } from 'react';

const G = '#81b64c';
const BG = '#141413';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const CARD = '#1c1b19';

export interface ComparisonRow {
  feature: string;
  us: boolean | string;
  them: boolean | string;
}

interface VsPageProps {
  competitorName: string;
  title: string;
  metaDescription: string;
  canonicalPath: string;
  intro: string;
  rows: ComparisonRow[];
  honestNote: string;
}

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value
      ? <Check className="w-4 h-4 mx-auto" style={{ color: G }} />
      : <Minus className="w-4 h-4 mx-auto" style={{ color: MUTED }} />;
  }
  return <span className="text-xs" style={{ color: TEXT }}>{value}</span>;
}

export function VsPage({ competitorName, title, metaDescription, canonicalPath, intro, rows, honestNote }: VsPageProps) {
  useEffect(() => {
    setPageMeta(title, metaDescription, canonicalPath);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-8" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="text-3xl font-black mb-4" style={{ color: TEXT }}>
          ChessScout vs {competitorName}
        </h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: MUTED }}>{intro}</p>

        <div className="rounded-xl overflow-hidden mb-6" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: CARD }}>
                <th className="text-left p-3 font-bold" style={{ color: TEXT }}>Feature</th>
                <th className="p-3 font-bold text-center" style={{ color: G }}>ChessScout</th>
                <th className="p-3 font-bold text-center" style={{ color: MUTED }}>{competitorName}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td className="p-3" style={{ color: TEXT }}>{row.feature}</td>
                  <td className="p-3 text-center"><Cell value={row.us} /></td>
                  <td className="p-3 text-center"><Cell value={row.them} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl p-4 mb-8" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{honestNote}</p>
        </div>

        <Link href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black"
          style={{ background: G, color: '#fff' }}>
          Try ChessScout Free <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
