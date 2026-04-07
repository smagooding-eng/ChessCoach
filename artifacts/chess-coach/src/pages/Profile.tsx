import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@/hooks/use-user';
import { useChessPlayer } from '@/hooks/use-chess-player';
import { useMyAnalysisSummary } from '@/hooks/use-analysis';
import { useMyGames } from '@/hooks/use-games';
import { useMyCourses } from '@/hooks/use-courses';
import { Link, useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Crown, LogOut, ChevronRight, Trophy, Swords, Target,
  GraduationCap, Settings, Shield, Edit3, Check, X, Eye, Users, CreditCard,
  Activity, Send, AlertCircle, CheckCircle2, Bold, Italic, Heading1, Heading2,
  Link as LinkIcon, Image, Type, Palette, List, ListOrdered, Minus, Undo2, Redo2, FileText, Sparkles
} from 'lucide-react';

interface AdminStats {
  pageViews: { total: number; today: number };
  uniqueVisitors: { total: number; today: number };
  users: { total: number; today: number };
  subscriptions: { active: number; trialing: number; canceled: number; pastDue: number; total: number };
}

interface AdminUser {
  id: string;
  email: string | null;
  chesscomUsername: string | null;
  firstName: string | null;
  createdAt: string;
  tier: 'admin' | 'pro' | 'trial' | 'free';
  tierDetail: number | null;
  planInterval: string | null;
  daysSinceLogin: number | null;
}

type UserFilter = 'all' | 'admin' | 'pro' | 'trial' | 'free';

function TierBadge({ user }: { user: AdminUser }) {
  const interval = user.planInterval === 'week' ? '/wk' : user.planInterval === 'month' ? '/mo' : '';

  if (user.tier === 'admin') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
        Admin
      </span>
    );
  }

  if (user.tier === 'pro') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
        Pro{interval ? ` ${interval}` : ''} {user.tierDetail !== null ? `${user.tierDetail}d` : ''}
      </span>
    );
  }

  if (user.tier === 'trial') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
        Trial {user.tierDetail !== null ? `${user.tierDetail}d left` : ''}
      </span>
    );
  }

  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-500/20 text-neutral-400">
      Free {user.tierDetail !== null ? `${user.tierDetail}d` : ''}
    </span>
  );
}

const FILTER_TABS: { key: UserFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'text-amber-400' },
  { key: 'admin', label: 'Admin', color: 'text-amber-400' },
  { key: 'pro', label: 'Pro', color: 'text-emerald-400' },
  { key: 'trial', label: 'Trial', color: 'text-blue-400' },
  { key: 'free', label: 'Free', color: 'text-neutral-400' },
];

function UserListPanel({ onClose, onEmailUsers }: { onClose: () => void; onEmailUsers: (emails: string[]) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<UserFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.users) setUsers(d.users); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? users : users.filter(u => u.tier === filter);
  const counts = users.reduce((acc, u) => {
    acc[u.tier] = (acc[u.tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const emailableUsers = filtered.filter(u => u.email);
  const allSelected = emailableUsers.length > 0 && emailableUsers.every(u => selected.has(u.id));

  const toggleUser = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(emailableUsers.map(u => u.id)));
    }
  };

  const handleEmailSelected = () => {
    const emails = users.filter(u => selected.has(u.id) && u.email).map(u => u.email!);
    if (emails.length > 0) {
      onEmailUsers(emails);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-t border-amber-500/15 overflow-hidden"
    >
      <div className="px-4 py-3 flex items-center justify-between bg-amber-500/5">
        <span className="text-xs font-bold text-amber-400">Registered Users</span>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={handleEmailSelected}
              className="text-[10px] font-semibold px-2.5 py-1 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors flex items-center gap-1"
            >
              <Mail className="w-3 h-3" /> Email {selected.size} user{selected.size !== 1 ? 's' : ''}
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {!loading && users.length > 0 && (
        <div className="px-3 py-2 flex items-center gap-1 overflow-x-auto border-b border-border/20">
          <button
            onClick={toggleAll}
            className={`text-[11px] font-semibold px-2 py-1 rounded transition-colors mr-1 ${allSelected ? 'bg-amber-500/20 text-amber-400' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'}`}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <div className="w-px h-4 bg-border/30 mx-1" />
          {FILTER_TABS.map(tab => {
            const c = tab.key === 'all' ? users.length : (counts[tab.key] || 0);
            if (tab.key !== 'all' && c === 0) return null;
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${active ? 'bg-amber-500/15' : 'hover:bg-secondary/50'}`}
                style={{ color: active ? undefined : 'var(--muted-foreground)' }}
              >
                <span className={active ? tab.color : ''}>{tab.label}</span>
                <span className="ml-1 opacity-60">{c}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
        ) : (
          <div className="divide-y divide-border/20">
            {filtered.map(u => {
              const isSelected = selected.has(u.id);
              const hasEmail = !!u.email;
              return (
                <button
                  key={u.id}
                  onClick={() => hasEmail && toggleUser(u.id)}
                  disabled={!hasEmail}
                  className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${hasEmail ? 'hover:bg-amber-500/5 cursor-pointer' : 'opacity-50 cursor-default'} ${isSelected ? 'bg-amber-500/8' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-border/50'}`}>
                      {isSelected && <Check className="w-3 h-3 text-black" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {u.email || (u.chesscomUsername ? `♟ ${u.chesscomUsername}` : u.firstName || 'Unknown')}
                      </p>
                      {u.email && u.chesscomUsername && (
                        <p className="text-[11px] text-muted-foreground/60 truncate">♟ {u.chesscomUsername}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TierBadge user={u} />
                    <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap leading-tight text-right">
                      {u.daysSinceLogin !== null ? (
                        u.daysSinceLogin === 0 ? 'today' : `${u.daysSinceLogin}d ago`
                      ) : 'never'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const EMAIL_TEMPLATES = [
  {
    name: 'Welcome',
    subject: 'Welcome to ChessScout!',
    html: `<h2 style="color:#81b64c;">Welcome to ChessScout! ♜</h2>
<p>Thanks for joining — the #1 chess scouting tool.</p>
<p>Here's what you can do:</p>
<ul>
<li><strong>Opponent Scout</strong> — Analyze any player's weaknesses</li>
<li><strong>Game Lookup</strong> — Review any Chess.com game with AI</li>
<li><strong>Play Local</strong> — Practice over the board</li>
<li><strong>Practice Bots</strong> — Train against different styles</li>
</ul>
<p><a href="https://chessscout.net" style="display:inline-block;background:#81b64c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Start Scouting →</a></p>`,
  },
  {
    name: 'New Feature',
    subject: 'New on ChessScout: [Feature Name]',
    html: `<h2 style="color:#81b64c;">Something new on ChessScout ♜</h2>
<p>We've just shipped a new feature we think you'll love:</p>
<h3>[Feature Name]</h3>
<p>[Describe the feature and how it helps their chess game]</p>
<p><a href="https://chessscout.net" style="display:inline-block;background:#81b64c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Try It Now →</a></p>`,
  },
  {
    name: 'Pro Upgrade',
    subject: 'Upgrade to ChessScout Pro',
    html: `<h2 style="color:#81b64c;">Level Up Your Chess ♜</h2>
<p>You've been using ChessScout — and we hope you're enjoying it!</p>
<p>With <strong>ChessScout Pro</strong>, you unlock:</p>
<ul>
<li>🔍 <strong>Opponent Scouting</strong> — AI-powered weakness analysis</li>
<li>📊 <strong>Deep Game Analysis</strong> — Detailed move-by-move insights</li>
<li>📚 <strong>Personalized Courses</strong> — Built from your actual games</li>
<li>🎯 <strong>Endgame Training</strong> — Targeted drills for your weaknesses</li>
</ul>
<p>Plans start at just <strong>$1/week</strong>.</p>
<p><a href="https://chessscout.net/subscription" style="display:inline-block;background:#81b64c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Upgrade to Pro →</a></p>`,
  },
];

function EmailComposerModal({ onClose, initialRecipients }: { onClose: () => void; initialRecipients?: string[] }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState('');
  const [recipients, setRecipients] = useState<string[]>(initialRecipients || []);
  const [recipientInput, setRecipientInput] = useState('');
  const [mode, setMode] = useState<'compose' | 'preview'>('compose');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [broadcastAll, setBroadcastAll] = useState(false);

  const execCmd = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }, []);

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      execCmd('insertHTML', `<img src="${url}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`);
    }
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      const text = window.getSelection()?.toString() || url;
      execCmd('insertHTML', `<a href="${url}" style="color:#81b64c;text-decoration:underline;">${text}</a>`);
    }
  };

  const insertButton = () => {
    const url = prompt('Button URL:', 'https://chessscout.net');
    const text = prompt('Button text:', 'Visit ChessScout');
    if (url && text) {
      execCmd('insertHTML', `<p><a href="${url}" style="display:inline-block;background:#81b64c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">${text}</a></p>`);
    }
  };

  const addRecipient = () => {
    const trimmed = recipientInput.trim();
    if (trimmed && !recipients.includes(trimmed)) {
      setRecipients(prev => [...prev, trimmed]);
      setRecipientInput('');
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients(prev => prev.filter(e => e !== email));
  };

  const applyTemplate = (tpl: typeof EMAIL_TEMPLATES[0]) => {
    setSubject(tpl.subject);
    if (editorRef.current) {
      editorRef.current.innerHTML = tpl.html;
    }
    setShowTemplates(false);
  };

  const getEditorHtml = () => {
    return editorRef.current?.innerHTML || '';
  };

  const sanitizeForEmail = (html: string, forPreview = false): string => {
    const div = document.createElement('div');
    div.innerHTML = html;

    div.querySelectorAll('script,style,link,meta').forEach(el => el.remove());

    div.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('data:')) {
        if (forPreview) {
          const notice = document.createElement('div');
          notice.setAttribute('style', 'color:#ff6b6b;font-size:13px;font-style:italic;margin:8px 0;padding:8px 12px;border:1px dashed #ff6b6b;border-radius:6px;background:rgba(255,107,107,0.08);');
          notice.textContent = '\u26a0 This pasted image won\'t appear in the email. Use the image button (\ud83d\uddbc) to insert a hosted URL.';
          img.replaceWith(notice);
        } else {
          img.remove();
        }
        return;
      }
      img.setAttribute('style', 'max-width:100%;height:auto;border-radius:8px;margin:8px 0;display:block;');
      img.removeAttribute('class');
    });

    const inlineStyles: Record<string, string> = {
      'h1': 'color:#81b64c;font-size:24px;font-weight:bold;margin:0 0 12px;line-height:1.3;',
      'h2': 'color:#81b64c;font-size:20px;font-weight:bold;margin:0 0 10px;line-height:1.3;',
      'h3': 'color:#e8e6e3;font-size:17px;font-weight:600;margin:0 0 8px;line-height:1.4;',
      'h4': 'color:#e8e6e3;font-size:15px;font-weight:600;margin:0 0 6px;line-height:1.4;',
      'p': 'color:#e8e6e3;font-size:15px;line-height:1.7;margin:0 0 12px;',
      'ul': 'color:#e8e6e3;font-size:15px;line-height:1.7;margin:0 0 12px;padding-left:20px;',
      'ol': 'color:#e8e6e3;font-size:15px;line-height:1.7;margin:0 0 12px;padding-left:20px;',
      'li': 'color:#e8e6e3;margin-bottom:4px;',
      'strong': 'color:#e8e6e3;font-weight:bold;',
      'b': 'color:#e8e6e3;font-weight:bold;',
      'em': 'color:#e8e6e3;font-style:italic;',
      'i': 'color:#e8e6e3;font-style:italic;',
      'hr': 'border:none;border-top:1px solid #444;margin:16px 0;',
      'blockquote': 'border-left:3px solid #81b64c;padding-left:12px;margin:12px 0;color:#9e9b98;font-style:italic;',
    };

    Object.entries(inlineStyles).forEach(([tag, style]) => {
      div.querySelectorAll(tag).forEach(el => {
        const existing = el.getAttribute('style') || '';
        if (tag === 'a') return;
        el.setAttribute('style', style + existing);
        el.removeAttribute('class');
      });
    });

    div.querySelectorAll('a').forEach(a => {
      const existing = a.getAttribute('style') || '';
      if (existing.includes('background')) {
        a.setAttribute('style', existing);
      } else {
        a.setAttribute('style', 'color:#81b64c;text-decoration:underline;' + existing);
      }
      a.removeAttribute('class');
    });

    div.querySelectorAll('div,span,section,article,header,footer,main,figure,figcaption').forEach(el => {
      if (!el.getAttribute('style')) {
        el.setAttribute('style', 'color:#e8e6e3;');
      }
      el.removeAttribute('class');
    });

    return div.innerHTML;
  };

  const wrapInEmailTemplate = (bodyHtml: string): string => {
    const sanitized = sanitizeForEmail(bodyHtml);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#262421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:24px;">
<h1 style="color:#81b64c;font-size:24px;margin:0;">♜ ChessScout.net</h1>
</div>
<div style="background-color:#302e2b;border-radius:12px;padding:32px;color:#e8e6e3;font-size:15px;line-height:1.7;">
${sanitized}
</div>
<p style="color:#666;font-size:12px;text-align:center;margin-top:24px;">ChessScout.net — Know your opponent's weaknesses.</p>
</div>
</body>
</html>`;
  };

  const handleSend = async () => {
    const html = getEditorHtml();
    if (!subject.trim()) {
      setResult({ type: 'error', message: 'Subject is required' });
      return;
    }
    if (!html.trim()) {
      setResult({ type: 'error', message: 'Email body is required' });
      return;
    }
    if (!broadcastAll && recipients.length === 0) {
      setResult({ type: 'error', message: 'Add at least one recipient or select "All Users"' });
      return;
    }

    const hasDataImages = html.includes('src="data:');
    if (hasDataImages) {
      setResult({ type: 'error', message: 'Some images are still uploading. Wait for "Uploading image..." to finish, then try again.' });
      return;
    }

    setSending(true);
    setResult(null);

    const wrappedHtml = wrapInEmailTemplate(html);

    try {
      let res: Response;
      if (broadcastAll) {
        res = await apiFetch('/api/admin/email/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subject: subject.trim(), html: wrappedHtml, recipientFilter: 'all' }),
        });
      } else if (recipients.length === 1) {
        res = await apiFetch('/api/admin/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ to: recipients[0], subject: subject.trim(), html: wrappedHtml }),
        });
      } else {
        res = await apiFetch('/api/admin/email/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subject: subject.trim(), html: wrappedHtml, recipientFilter: 'specific', emails: recipients }),
        });
      }

      if (res.status === 413) {
        setResult({ type: 'error', message: 'Email content is too large. Try removing images or shortening the content.' });
      } else {
        let data: any;
        try { data = await res.json(); } catch { data = {}; }
        if (res.ok) {
          const msg = broadcastAll || recipients.length > 1
            ? `Sent to ${data.sent ?? 0} recipient${(data.sent ?? 0) !== 1 ? 's' : ''}${data.failed ? `, ${data.failed} failed` : ''}`
            : 'Email sent successfully!';
          setResult({ type: 'success', message: msg });
        } else {
          setResult({ type: 'error', message: data.error || `Server error (${res.status})` });
        }
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err?.message || 'Network error — check your connection' });
    } finally {
      setSending(false);
    }
  };

  const handleTestEmail = async () => {
    setSending(true);
    setResult(null);
    const html = getEditorHtml();
    const wrappedHtml = html.trim() ? wrapInEmailTemplate(html) : undefined;
    try {
      const res = await apiFetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          html: wrappedHtml,
        }),
      });
      if (res.status === 413) {
        setResult({ type: 'error', message: 'Email content is too large. Try removing images or shortening the content.' });
      } else {
        let data: any;
        try { data = await res.json(); } catch { data = {}; }
        if (res.ok) {
          setResult({ type: 'success', message: `Test sent to ${data.sentTo}` });
        } else {
          setResult({ type: 'error', message: data.error || `Server error (${res.status})` });
        }
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err?.message || 'Network error — check your connection' });
    } finally {
      setSending(false);
    }
  };

  const toolbarBtn = (active: boolean = false) =>
    `p-1.5 rounded transition-colors ${active ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl max-h-[90vh] bg-[#302e2b] border border-amber-500/20 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-amber-500/15 bg-amber-500/5 flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-amber-400 flex items-center gap-2">
            <Mail className="w-5 h-5" /> Compose Email
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(v => !v)}
              className={`text-xs px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 ${showTemplates ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/15'}`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Templates
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b border-amber-500/10 overflow-hidden"
            >
              <div className="p-3 flex gap-2 overflow-x-auto">
                {EMAIL_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.name}
                    onClick={() => applyTemplate(tpl)}
                    className="shrink-0 bg-[#262421] border border-border/30 rounded-lg px-4 py-3 text-left hover:border-amber-500/30 transition-colors"
                  >
                    <p className="text-xs font-semibold text-amber-400">{tpl.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[140px] truncate">{tpl.subject}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">To</label>
              <div className="bg-[#262421] border border-border/40 rounded-lg p-2 min-h-[40px]">
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {broadcastAll && (
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-500/15 text-amber-400 px-2 py-1 rounded-md font-medium">
                      All Users
                      <button onClick={() => setBroadcastAll(false)} className="hover:text-amber-200 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {!broadcastAll && recipients.map(email => (
                    <span key={email} className="inline-flex items-center gap-1 text-xs bg-secondary/50 text-foreground px-2 py-1 rounded-md">
                      {email}
                      <button onClick={() => removeRecipient(email)} className="hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                {!broadcastAll && (
                  <div className="flex gap-2">
                    <input
                      value={recipientInput}
                      onChange={e => setRecipientInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipient(); } }}
                      placeholder="Type email and press Enter"
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-w-[150px]"
                    />
                    <button
                      onClick={() => setBroadcastAll(true)}
                      className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/15 hover:text-amber-400 transition-colors whitespace-nowrap"
                    >
                      All Users
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line"
                className="w-full bg-[#262421] border border-border/40 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-amber-500/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Body</label>
                <div className="flex gap-1 p-0.5 bg-[#262421] rounded-md">
                  <button
                    onClick={() => setMode('compose')}
                    className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${mode === 'compose' ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground'}`}
                  >
                    Compose
                  </button>
                  <button
                    onClick={() => setMode('preview')}
                    className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${mode === 'preview' ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground'}`}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {mode === 'compose' ? (
                <>
                  <div className="flex flex-wrap gap-0.5 bg-[#262421] border border-border/40 border-b-0 rounded-t-lg px-2 py-1.5">
                    <button onClick={() => execCmd('bold')} className={toolbarBtn()} title="Bold">
                      <Bold className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('italic')} className={toolbarBtn()} title="Italic">
                      <Italic className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={() => execCmd('formatBlock', 'h2')} className={toolbarBtn()} title="Heading 1">
                      <Heading1 className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('formatBlock', 'h3')} className={toolbarBtn()} title="Heading 2">
                      <Heading2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('formatBlock', 'p')} className={toolbarBtn()} title="Paragraph">
                      <Type className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={() => execCmd('insertUnorderedList')} className={toolbarBtn()} title="Bullet List">
                      <List className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('insertOrderedList')} className={toolbarBtn()} title="Numbered List">
                      <ListOrdered className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={insertLink} className={toolbarBtn()} title="Insert Link">
                      <LinkIcon className="w-4 h-4" />
                    </button>
                    <button onClick={insertImage} className={toolbarBtn()} title="Insert Image">
                      <Image className="w-4 h-4" />
                    </button>
                    <button onClick={insertButton} className={toolbarBtn()} title="Insert CTA Button">
                      <FileText className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border/30 mx-1 self-center" />
                    <button onClick={() => execCmd('insertHorizontalRule')} className={toolbarBtn()} title="Horizontal Rule">
                      <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('undo')} className={toolbarBtn()} title="Undo">
                      <Undo2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => execCmd('redo')} className={toolbarBtn()} title="Redo">
                      <Redo2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    className="bg-[#262421] border border-border/40 rounded-b-lg px-4 py-3 min-h-[200px] max-h-[350px] overflow-y-auto text-sm text-[#e8e6e3] focus:outline-none focus:border-amber-500/40 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[#81b64c] [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[#e8e6e3] [&_h3]:mb-1 [&_p]:mb-2 [&_a]:text-[#81b64c] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 [&_hr]:border-border/30 [&_hr]:my-3"
                    data-placeholder="Start typing your email..."
                    onPaste={(e) => {
                      const items = e.clipboardData.items;
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.startsWith('image/')) {
                          e.preventDefault();
                          const file = items[i].getAsFile();
                          if (file) {
                            const placeholderId = `img-upload-${Date.now()}`;
                            document.execCommand('insertHTML', false,
                              `<span id="${placeholderId}" style="display:inline-block;background:#302e2b;color:#9e9b98;padding:8px 14px;border-radius:6px;font-size:13px;margin:4px 0;">Uploading image...</span>`);
                            const reader = new FileReader();
                            reader.onload = async (ev) => {
                              const dataUrl = ev.target?.result as string;
                              try {
                                const res = await apiFetch('/api/admin/email/upload-image', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ dataUrl }),
                                });
                                const data = await res.json();
                                const placeholder = document.getElementById(placeholderId);
                                if (data.success && data.url && placeholder) {
                                  const img = document.createElement('img');
                                  img.src = data.url;
                                  img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;margin:8px 0;';
                                  placeholder.replaceWith(img);
                                } else if (placeholder) {
                                  placeholder.textContent = `Image upload failed: ${data.error || 'Unknown error'}`;
                                  placeholder.style.color = '#ff6b6b';
                                }
                              } catch {
                                const placeholder = document.getElementById(placeholderId);
                                if (placeholder) {
                                  placeholder.textContent = 'Image upload failed — check connection';
                                  placeholder.style.color = '#ff6b6b';
                                }
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                          return;
                        }
                      }
                      const clipHtml = e.clipboardData.getData('text/html');
                      if (clipHtml) {
                        e.preventDefault();
                        const tmp = document.createElement('div');
                        tmp.innerHTML = clipHtml;
                        tmp.querySelectorAll('script,style,link,meta,svg').forEach(el => el.remove());
                        tmp.querySelectorAll('img').forEach(img => {
                          const src = img.getAttribute('src') || '';
                          if (src.startsWith('data:')) {
                            const placeholderId = `img-upload-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                            const span = document.createElement('span');
                            span.id = placeholderId;
                            span.setAttribute('style', 'display:inline-block;background:#302e2b;color:#9e9b98;padding:8px 14px;border-radius:6px;font-size:13px;margin:4px 0;');
                            span.textContent = 'Uploading image...';
                            img.replaceWith(span);
                            (async () => {
                              try {
                                const res = await apiFetch('/api/admin/email/upload-image', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ dataUrl: src }),
                                });
                                const data = await res.json();
                                const el = document.getElementById(placeholderId);
                                if (data.success && data.url && el) {
                                  const newImg = document.createElement('img');
                                  newImg.src = data.url;
                                  newImg.style.cssText = 'max-width:100%;height:auto;border-radius:8px;margin:8px 0;';
                                  el.replaceWith(newImg);
                                } else if (el) {
                                  el.textContent = `Image upload failed`;
                                  el.style.color = '#ff6b6b';
                                }
                              } catch {
                                const el = document.getElementById(placeholderId);
                                if (el) {
                                  el.textContent = 'Image upload failed';
                                  el.style.color = '#ff6b6b';
                                }
                              }
                            })();
                          }
                        });
                        tmp.querySelectorAll('*').forEach(el => el.removeAttribute('class'));
                        document.execCommand('insertHTML', false, tmp.innerHTML);
                      }
                    }}
                    suppressContentEditableWarning
                  />
                </>
              ) : (
                <div className="bg-[#262421] border border-border/40 rounded-lg overflow-hidden">
                  <div className="bg-[#1a1917] px-3 py-2 border-b border-border/20">
                    <p className="text-[10px] text-muted-foreground">Email Preview (as recipient will see it)</p>
                  </div>
                  <div style={{ backgroundColor: '#262421', padding: '20px' }}>
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <h1 style={{ color: '#81b64c', fontSize: '24px', margin: 0 }}>♜ ChessScout.net</h1>
                      </div>
                      <div
                        style={{ backgroundColor: '#302e2b', borderRadius: '12px', padding: '24px', color: '#e8e6e3', fontSize: '15px', lineHeight: '1.7' }}
                        dangerouslySetInnerHTML={{ __html: (() => { const raw = getEditorHtml(); return raw.trim() ? sanitizeForEmail(raw, true) : '<p style="color:#9e9b98;">Your email content will appear here...</p>'; })() }}
                      />
                      <p style={{ color: '#666', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
                        ChessScout.net — Know your opponent's weaknesses.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-amber-500/15 bg-amber-500/5 shrink-0 space-y-3">
          {result && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${result.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {result.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              {result.message}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestEmail}
              disabled={sending}
              className="text-xs px-3 py-2.5 rounded-lg bg-[#262421] border border-border/40 text-muted-foreground hover:text-foreground hover:border-amber-500/30 disabled:opacity-50 transition-colors"
            >
              Send Test to Me
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : broadcastAll ? 'Send to All Users' : `Send to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function AdminTicker() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [showUsers, setShowUsers] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);

  useEffect(() => {
    const fetchStats = () => {
      apiFetch('/api/admin/stats', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setStats(d); })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleEmailUsers = (emails: string[]) => {
    setEmailRecipients(emails);
    setShowUsers(false);
    setShowEmailModal(true);
  };

  const openComposer = () => {
    setEmailRecipients([]);
    setShowEmailModal(true);
  };

  if (!stats) return null;

  return (
    <>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
        className="bg-card border border-amber-500/20 rounded-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-amber-500/15 bg-amber-500/5">
          <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Admin Dashboard
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={openComposer}
                className="text-[10px] font-semibold px-2 py-1 rounded transition-colors flex items-center gap-1 bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/15 hover:text-amber-400"
              >
                <Mail className="w-3 h-3" /> Compose
              </button>
              <span className="text-[10px] font-normal text-muted-foreground">auto-refreshes every 30s</span>
            </span>
          </h2>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/30">
          <div className="p-4 text-center">
            <div className="w-8 h-8 bg-blue-400/10 rounded-lg flex items-center justify-center mx-auto mb-2">
              <Eye className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-xl font-black text-foreground">{(stats.uniqueVisitors?.total ?? stats.pageViews.total).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground font-medium">Unique Visitors</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{(stats.uniqueVisitors?.today ?? stats.pageViews.today)} today</p>
          </div>
          <button
            onClick={() => setShowUsers(v => !v)}
            className="p-4 text-center hover:bg-emerald-400/5 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 bg-emerald-400/10 rounded-lg flex items-center justify-center mx-auto mb-2">
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-black text-foreground">{stats.users.total.toLocaleString()}</p>
            <p className="text-xs text-emerald-400 font-medium underline decoration-dotted underline-offset-2">Users</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stats.users.today} today</p>
          </button>
          <div className="p-4 text-center">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-2">
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xl font-black text-foreground">{stats.subscriptions.total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground font-medium">Subscriptions</p>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5 space-y-0.5">
              {stats.subscriptions.active > 0 && <p className="text-emerald-400">{stats.subscriptions.active} paid</p>}
              {stats.subscriptions.trialing > 0 && <p className="text-blue-400">{stats.subscriptions.trialing} trial</p>}
              {stats.subscriptions.canceled > 0 && <p className="text-red-400">{stats.subscriptions.canceled} expired</p>}
              {stats.subscriptions.pastDue > 0 && <p className="text-orange-400">{stats.subscriptions.pastDue} past due</p>}
            </div>
          </div>
        </div>
        <AnimatePresence>
          {showUsers && <UserListPanel onClose={() => setShowUsers(false)} onEmailUsers={handleEmailUsers} />}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showEmailModal && (
          <EmailComposerModal
            onClose={() => setShowEmailModal(false)}
            initialRecipients={emailRecipients}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export function Profile() {
  const { username, authUser, isPremium, subscription, authLogout, login, logout } = useUser();
  const { player } = useChessPlayer(username ?? undefined);
  const { data: summary } = useMyAnalysisSummary();
  const { data: gamesData } = useMyGames();
  const { data: coursesData } = useMyCourses();
  const [, setLocation] = useLocation();

  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(username ?? '');
  const [saving, setSaving] = useState(false);

  const totalGames = gamesData?.games?.length ?? 0;
  const winRate = summary ? ((summary.winRate || 0) * 100).toFixed(1) : null;
  const activeCourses = coursesData?.courses?.filter(c => c.completedLessons < c.totalLessons).length || 0;
  const completedCourses = coursesData?.courses?.filter(c => c.completedLessons >= c.totalLessons).length || 0;

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed === username) {
      setEditingUsername(false);
      return;
    }
    setSaving(true);
    try {
      login(trimmed);
      if (authUser) {
        await apiFetch('/api/auth/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chesscomUsername: trimmed }),
        });
      }
      setEditingUsername(false);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    if (authUser) {
      authLogout();
    } else {
      logout();
    }
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 p-4 md:p-0">

      <motion.div variants={item} className="relative overflow-hidden bg-gradient-to-br from-[hsl(89,44%,18%)] via-card to-card border border-primary/10 rounded-2xl p-5 md:p-6">
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{ backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)', backgroundSize: '36px 36px' }}
        />
        <div className="relative flex items-center gap-4">
          <div className="shrink-0">
            {player?.avatar
              ? <img src={player.avatar} alt={username ?? ''} className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/40 shadow-lg shadow-primary/20" />
              : <div className="w-20 h-20 rounded-2xl bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                  <User className="w-10 h-10 text-primary" />
                </div>
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {player?.title && (
                <span className="text-xs font-bold text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded">{player.title}</span>
              )}
              {authUser?.isAdmin && (
                <span className="text-xs font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Shield className="w-3 h-3" /> ADMIN
                </span>
              )}
              {isPremium && !authUser?.isAdmin && (
                <span className="text-xs font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Crown className="w-3 h-3" /> PRO
                </span>
              )}
            </div>
            {editingUsername ? (
              <div className="flex items-center gap-2">
                <input
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="bg-background/60 border border-border rounded-lg px-2 py-1 text-sm font-bold text-foreground w-full max-w-[200px]"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                />
                <button onClick={handleSaveUsername} disabled={saving} className="p-1 text-primary hover:bg-primary/10 rounded">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => { setEditingUsername(false); setNewUsername(username ?? ''); }} className="p-1 text-muted-foreground hover:bg-secondary rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-foreground truncate">{player?.name || username}</h1>
                <button onClick={() => setEditingUsername(true)} className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {username && <p className="text-sm text-muted-foreground">@{username}</p>}
            {authUser?.email && (
              <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3" /> {authUser.email}
              </p>
            )}
            {player?.rating && (
              <p className="text-sm font-bold text-primary mt-1">{player.rating} ELO</p>
            )}
          </div>
        </div>
      </motion.div>

      {authUser?.isAdmin && <AdminTicker />}

      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Games', value: totalGames, icon: Swords, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { label: 'Win Rate', value: winRate ? `${winRate}%` : '—', icon: Trophy, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
          { label: 'Rating', value: player?.rating ?? '—', icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Courses', value: `${completedCourses}/${(completedCourses + activeCourses) || 0}`, icon: GraduationCap, color: 'text-amber-400', bg: 'bg-amber-400/10' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border/50 rounded-xl p-4 text-center">
            <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center mx-auto mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-lg font-black text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </motion.div>

      <motion.div variants={item} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" /> Account
          </h2>
        </div>

        <Link href="/subscription" className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 transition-colors border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Crown className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Subscription</p>
              <p className="text-xs text-muted-foreground">
                {subscription.status === 'free_trial'
                  ? `Free Trial — ${subscription.trialDaysLeft} day${subscription.trialDaysLeft === 1 ? '' : 's'} left`
                  : isPremium
                    ? `Pro — ${subscription.status === 'trialing' ? 'Stripe Trial' : 'Active'}`
                    : 'Free Plan — Trial ended'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <Link href="/analysis" className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 transition-colors border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-400/10 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Analysis</p>
              <p className="text-xs text-muted-foreground">View your game analysis</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <Link href="/courses" className="flex items-center justify-between px-4 py-3.5 hover:bg-secondary/40 transition-colors border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-400/10 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Courses</p>
              <p className="text-xs text-muted-foreground">{activeCourses} active, {completedCourses} completed</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-500/5 transition-colors text-left"
        >
          <div className="w-8 h-8 bg-red-400/10 rounded-lg flex items-center justify-center">
            <LogOut className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-sm font-semibold text-red-400">Sign Out</p>
        </button>
      </motion.div>

    </motion.div>
  );
}
