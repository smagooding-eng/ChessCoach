import React, { useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { useImportChessGames } from '@/hooks/use-games';
import { motion } from 'framer-motion';
import { CloudDownload, CheckCircle2, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

export function Import() {
  const { username } = useUser();
  const [months, setMonths] = useState(1);
  const { importGames, isImporting, error } = useImportChessGames();
  const [result, setResult] = useState<{imported: number, total: number} | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    try {
      const res = await importGames(username, months);
      setResult(res);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto mt-10">
      <div className="glass-card rounded-3xl p-8 md:p-10 text-center relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CloudDownload className="w-8 h-8 text-primary" />
        </div>
        
        <h1 className="text-3xl font-display font-bold mb-4">Import Chess.com Games</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Fetch your recent games from chess.com to power the AI analysis. The more games you import, the better the insights.
        </p>

        {result ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-8">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-emerald-50 mb-1">Import Complete!</h2>
            <p className="text-emerald-200/80 mb-6">Successfully imported {result.imported} new games out of {result.total} found.</p>
            <div className="flex gap-4 justify-center">
              <Link href="/games" className="px-5 py-2.5 rounded-xl bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition-colors">
                View Games
              </Link>
              <Link href="/analysis" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5">
                Analyze Now
              </Link>
            </div>
          </motion.div>
        ) : (
          <form onSubmit={handleImport} className="space-y-6 max-w-sm mx-auto text-left relative z-10">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2 ml-1">Username</label>
              <input 
                type="text" 
                value={username || ''} 
                disabled 
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1 ml-1">Connected account</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2 ml-1 flex justify-between">
                <span>History to fetch</span>
                <span className="text-primary font-bold">{months} {months === 1 ? 'month' : 'months'}</span>
              </label>
              <input 
                type="range" 
                min="1" 
                max="12" 
                value={months} 
                onChange={(e) => setMonths(parseInt(e.target.value))}
                className="w-full accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
                <span>1 month</span>
                <span>12 months</span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm flex gap-2 items-start">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>Failed to import games. Please try again.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isImporting}
              className="w-full flex justify-center items-center gap-2 px-6 py-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none hover:-translate-y-0.5 active:translate-y-0"
            >
              {isImporting ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                  Fetching Games...
                </>
              ) : (
                <>Import Games</>
              )}
            </button>
          </form>
        )}
      </div>
    </motion.div>
  );
}
