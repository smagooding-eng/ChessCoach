import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { getTierForRating } from '@/lib/elo-tips';

interface WaitTipCarouselProps {
  rating?: number | null;
  intervalMs?: number;
}

export function WaitTipCarousel({ rating, intervalMs = 7000 }: WaitTipCarouselProps) {
  const tier = getTierForRating(rating ?? 800);
  const tips = tier.tips;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * tips.length));

  useEffect(() => {
    const id = setInterval(() => {
      setIndex(prev => (prev + 1) % tips.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [tips.length, intervalMs]);

  return (
    <div className="rounded-3xl bg-amber-500/5 border border-amber-500/20 px-4 py-3 overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-[11px] font-bold text-amber-400/80 uppercase tracking-wider">
          {tier.icon} {tier.label} Tip
        </span>
        <span className="ml-auto text-[10px] text-white/20 font-mono">
          {index + 1}/{tips.length}
        </span>
      </div>
      <div className="relative min-h-[40px]">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="text-xs text-white/60 leading-relaxed"
          >
            {tips[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
