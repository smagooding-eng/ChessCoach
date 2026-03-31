import React, { useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { useLocation } from 'wouter';
import { ArrowRight, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';

export function Setup() {
  const [inputName, setInputName] = useState('');
  const { login } = useUser();
  const [, setLocation] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputName.trim()) {
      login(inputName.trim());
      setLocation('/');
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
          alt="Hero background" 
          className="w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-panel p-8 md:p-10 rounded-3xl relative z-10 text-center"
      >
        <div className="mx-auto w-20 h-20 mb-6 bg-primary/20 rounded-full flex items-center justify-center shadow-[0_0_30px_hsl(89_44%_50%_/_0.3)]">
          <Trophy className="w-10 h-10 text-primary" />
        </div>
        
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-3 text-white">
          Welcome to <span className="text-gradient">Chess Coach</span>
        </h1>
        <p className="text-muted-foreground mb-8">
          Enter your chess.com username to start importing games, discovering your weaknesses, and generating personalized courses.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2 ml-1">
              Chess.com Username
            </label>
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="e.g. Hikaru"
              className="w-full px-5 py-4 rounded-xl bg-secondary/80 border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all duration-200"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full group flex items-center justify-center gap-2 btn-primary text-base"
          >
            Start Analyzing
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
