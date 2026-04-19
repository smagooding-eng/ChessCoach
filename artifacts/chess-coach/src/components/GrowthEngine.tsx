import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import {
  Megaphone, Settings, Send, Loader2, Check, X, AlertCircle,
  ChevronDown, Sparkles, Copy, Trash2, Play, Pause, Clock,
  CheckCircle2, XCircle, History, Rocket, Key, Globe
} from 'lucide-react';

const THEMES = ["Free Trial", "Opponent Scouting", "Game Analysis", "New Feature", "General Promo", "ELO Improvement"];
const PLATFORMS = ["Twitter/X", "Reddit (r/chess)", "Reddit (r/chessbeginners)", "Discord"];
const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'every_3_days', label: 'Every 3 Days' },
  { value: 'weekly', label: 'Weekly' },
];

interface Credential { id: string; platform: string; isActive: boolean; isConfigured: boolean; updatedAt: string; }
interface Campaign { id: string; name: string; theme: string; platforms: string[]; frequency: string; customNote?: string; status: string; nextRunAt: string | null; lastRunAt: string | null; createdAt: string; }
interface PostLog { id: string; campaignId?: string; platform: string; content: string; title?: string; status: string; error?: string; externalId?: string; postedAt: string; }

function CredentialSettings() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState<{ platform: string; success: boolean; message: string } | null>(null);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [twitterKeys, setTwitterKeys] = useState({ apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '' });
  const [redditKeys, setRedditKeys] = useState({ clientId: '', clientSecret: '', username: '', password: '' });

  useEffect(() => {
    apiFetch('/api/admin/growth/credentials').then(r => r.json()).then(setCreds).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const saveCredential = async (platform: string, credentials: Record<string, string>) => {
    setSaving(platform);
    try {
      const res = await apiFetch('/api/admin/growth/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, credentials }),
      });
      if (res.ok) {
        const updated = await apiFetch('/api/admin/growth/credentials').then(r => r.json());
        setCreds(updated);
        setTestResult({ platform, success: true, message: 'Credentials saved!' });
      }
    } catch {}
    setSaving('');
  };

  const testCredential = async (platform: string) => {
    setTesting(platform);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/admin/growth/credentials/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      setTestResult({ platform, success: data.success, message: data.message || data.error });
    } catch { setTestResult({ platform, success: false, message: 'Test failed' }); }
    setTesting('');
  };

  const deleteCred = async (platform: string) => {
    await apiFetch(`/api/admin/growth/credentials/${platform}`, { method: 'DELETE' });
    setCreds(c => c.filter(x => x.platform !== platform));
  };

  const isConfigured = (p: string) => creds.some(c => c.platform === p);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-blue-500/5">
        <h3 className="text-sm font-bold text-blue-400 flex items-center gap-2"><Key className="w-4 h-4" /> Platform Credentials</h3>
      </div>
      <div className="p-4 space-y-4">
        {loading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
          <>
            <div className="rounded-xl border border-border/30 p-3 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">💬</span>
                <span className="text-xs font-bold text-foreground">Discord</span>
                {isConfigured('discord') && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">Connected</span>}
              </div>
              <input value={discordWebhook} onChange={e => setDiscordWebhook(e.target.value)} placeholder="Webhook URL (https://discord.com/api/webhooks/...)" className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
              <div className="flex gap-2">
                <button onClick={() => saveCredential('discord', { webhookUrl: discordWebhook })} disabled={!discordWebhook || saving === 'discord'} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 text-[10px] font-bold hover:bg-blue-500/25 disabled:opacity-40">
                  {saving === 'discord' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                </button>
                {isConfigured('discord') && <>
                  <button onClick={() => testCredential('discord')} disabled={testing === 'discord'} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-background border border-border/30 text-foreground text-[10px] font-bold hover:bg-muted/50 disabled:opacity-40">
                    {testing === 'discord' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Test
                  </button>
                  <button onClick={() => deleteCred('discord')} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-red-400 text-[10px] font-bold hover:bg-red-500/10"><Trash2 className="w-3 h-3" /></button>
                </>}
              </div>
            </div>

            <div className="rounded-xl border border-border/30 p-3 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">𝕏</span>
                <span className="text-xs font-bold text-foreground">Twitter/X</span>
                {isConfigured('twitter') && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">Connected</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={twitterKeys.apiKey} onChange={e => setTwitterKeys(p => ({...p, apiKey: e.target.value}))} placeholder="API Key" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
                <input value={twitterKeys.apiSecret} onChange={e => setTwitterKeys(p => ({...p, apiSecret: e.target.value}))} placeholder="API Secret" type="password" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
                <input value={twitterKeys.accessToken} onChange={e => setTwitterKeys(p => ({...p, accessToken: e.target.value}))} placeholder="Access Token" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
                <input value={twitterKeys.accessTokenSecret} onChange={e => setTwitterKeys(p => ({...p, accessTokenSecret: e.target.value}))} placeholder="Access Token Secret" type="password" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveCredential('twitter', twitterKeys)} disabled={!twitterKeys.apiKey || saving === 'twitter'} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 text-[10px] font-bold hover:bg-blue-500/25 disabled:opacity-40">
                  {saving === 'twitter' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                </button>
                {isConfigured('twitter') && <>
                  <button onClick={() => testCredential('twitter')} disabled={testing === 'twitter'} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-background border border-border/30 text-foreground text-[10px] font-bold hover:bg-muted/50 disabled:opacity-40">
                    {testing === 'twitter' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Test
                  </button>
                  <button onClick={() => deleteCred('twitter')} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-red-400 text-[10px] font-bold hover:bg-red-500/10"><Trash2 className="w-3 h-3" /></button>
                </>}
              </div>
            </div>

            <div className="rounded-xl border border-border/30 p-3 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🟠</span>
                <span className="text-xs font-bold text-foreground">Reddit</span>
                {isConfigured('reddit') && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">Connected</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={redditKeys.clientId} onChange={e => setRedditKeys(p => ({...p, clientId: e.target.value}))} placeholder="Client ID" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
                <input value={redditKeys.clientSecret} onChange={e => setRedditKeys(p => ({...p, clientSecret: e.target.value}))} placeholder="Client Secret" type="password" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
                <input value={redditKeys.username} onChange={e => setRedditKeys(p => ({...p, username: e.target.value}))} placeholder="Reddit Username" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
                <input value={redditKeys.password} onChange={e => setRedditKeys(p => ({...p, password: e.target.value}))} placeholder="Reddit Password" type="password" className="bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/30" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveCredential('reddit', redditKeys)} disabled={!redditKeys.clientId || saving === 'reddit'} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 text-[10px] font-bold hover:bg-blue-500/25 disabled:opacity-40">
                  {saving === 'reddit' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                </button>
                {isConfigured('reddit') && <>
                  <button onClick={() => testCredential('reddit')} disabled={testing === 'reddit'} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-background border border-border/30 text-foreground text-[10px] font-bold hover:bg-muted/50 disabled:opacity-40">
                    {testing === 'reddit' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Test
                  </button>
                  <button onClick={() => deleteCred('reddit')} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-red-400 text-[10px] font-bold hover:bg-red-500/10"><Trash2 className="w-3 h-3" /></button>
                </>}
              </div>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${testResult.success ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {testResult.platform}: {testResult.message}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function CampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [theme, setTheme] = useState(THEMES[0]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('daily');
  const [customNote, setCustomNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionId, setActionId] = useState('');

  const load = () => {
    apiFetch('/api/admin/growth/campaigns').then(r => r.json()).then(setCampaigns).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const createCampaign = async () => {
    if (!name || !selectedPlatforms.length) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/growth/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, theme, platforms: selectedPlatforms, frequency, customNote: customNote || undefined }),
      });
      if (res.ok) {
        setShowCreate(false);
        setName(''); setSelectedPlatforms([]); setCustomNote('');
        load();
      }
    } catch {}
    setCreating(false);
  };

  const toggleStatus = async (id: string, current: string) => {
    setActionId(id);
    const newStatus = current === 'active' ? 'paused' : 'active';
    await apiFetch(`/api/admin/growth/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
    setActionId('');
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;
    await apiFetch(`/api/admin/growth/campaigns/${id}`, { method: 'DELETE' });
    load();
  };

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-emerald-500/5 flex items-center justify-between">
        <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2"><Rocket className="w-4 h-4" /> Campaigns</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25">
          {showCreate ? 'Cancel' : '+ New'}
        </button>
      </div>
      <div className="p-4 space-y-3">
        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 pb-3 border-b border-border/20">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name..." className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/30" />
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={theme} onChange={e => setTheme(e.target.value)} className="w-full appearance-none bg-background border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground pr-8 focus:outline-none">
                    {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative flex-1">
                  <select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full appearance-none bg-background border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground pr-8 focus:outline-none">
                    {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map(p => (
                  <button key={p} onClick={() => togglePlatform(p)} className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-colors ${selectedPlatforms.includes(p) ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-background border-border/30 text-muted-foreground hover:border-emerald-500/20'}`}>
                    {p}
                  </button>
                ))}
              </div>
              <input value={customNote} onChange={e => setCustomNote(e.target.value)} placeholder="Optional custom note..." className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
              <button onClick={createCampaign} disabled={!name || !selectedPlatforms.length || creating} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 disabled:opacity-40">
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                Launch Campaign
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : campaigns.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No campaigns yet. Create one to start automated posting.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => (
              <div key={c.id} className="rounded-xl border border-border/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${c.status === 'active' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                    <span className="text-xs font-bold text-foreground">{c.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">{c.theme}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleStatus(c.id, c.status)} disabled={actionId === c.id} className="p-1 rounded hover:bg-muted/50">
                      {actionId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : c.status === 'active' ? <Pause className="w-3.5 h-3.5 text-yellow-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>
                    <button onClick={() => deleteCampaign(c.id)} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(c.platforms as string[]).map(p => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{p}</span>)}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {FREQUENCIES.find(f => f.value === c.frequency)?.label || c.frequency}</span>
                  {c.nextRunAt && c.status === 'active' && <span>Next: {new Date(c.nextRunAt).toLocaleDateString()} {new Date(c.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  {c.lastRunAt && <span>Last: {new Date(c.lastRunAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PostNow() {
  const [theme, setTheme] = useState(THEMES[0]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<Array<{ platform: string; success: boolean; error?: string }>>([]);

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const postNow = async () => {
    if (!selectedPlatforms.length) return;
    setPosting(true);
    setResults([]);
    try {
      const res = await apiFetch('/api/admin/growth/post-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: selectedPlatforms, theme, customNote: customNote || undefined }),
      });
      const data = await res.json();
      if (data.results) setResults(data.results);
    } catch { setResults([{ platform: 'All', success: false, error: 'Network error' }]); }
    setPosting(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-amber-500/5">
        <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2"><Send className="w-4 h-4" /> Post Now</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select value={theme} onChange={e => setTheme(e.target.value)} className="w-full appearance-none bg-background border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground pr-8 focus:outline-none">
              {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map(p => (
            <button key={p} onClick={() => togglePlatform(p)} className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-colors ${selectedPlatforms.includes(p) ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-background border-border/30 text-muted-foreground hover:border-amber-500/20'}`}>
              {p}
            </button>
          ))}
        </div>
        <input value={customNote} onChange={e => setCustomNote(e.target.value)} placeholder="Optional custom angle..." className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
        <button onClick={postNow} disabled={!selectedPlatforms.length || posting} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-bold hover:bg-amber-500/25 disabled:opacity-40 w-full justify-center">
          {posting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating & Posting...</> : <><Sparkles className="w-3.5 h-3.5" /> Generate & Post Now</>}
        </button>

        {results.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${r.success ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {r.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                <span className="font-bold">{r.platform}</span> — {r.success ? 'Posted!' : r.error}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PostHistory() {
  const [logs, setLogs] = useState<PostLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ limit: '30' });
    if (filter) params.set('platform', filter);
    if (fromDate) params.set('from', new Date(fromDate).toISOString());
    if (toDate) params.set('to', new Date(toDate + 'T23:59:59').toISOString());
    apiFetch(`/api/admin/growth/post-log?${params}`).then(r => r.json()).then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, [filter, fromDate, toDate]);

  const statusIcon = (s: string) => s === 'sent' ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-indigo-500/5 flex items-center justify-between">
        <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2"><History className="w-4 h-4" /> Post History</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setLoading(true); }} className="bg-background border border-border/40 rounded-xl px-2 py-1 text-[10px] text-foreground focus:outline-none" placeholder="From" />
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setLoading(true); }} className="bg-background border border-border/40 rounded-xl px-2 py-1 text-[10px] text-foreground focus:outline-none" placeholder="To" />
          <div className="relative">
            <select value={filter} onChange={e => { setFilter(e.target.value); setLoading(true); }} className="appearance-none bg-background border border-border/40 rounded-xl px-2 py-1 text-[10px] text-foreground pr-6 focus:outline-none">
              <option value="">All Platforms</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>
      <div className="p-4">
        {loading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No posts yet. Use "Post Now" or create a campaign.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="rounded-xl border border-border/30 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {statusIcon(log.status)}
                    <span className="text-xs font-bold text-foreground">{log.platform}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(log.postedAt).toLocaleDateString()} {new Date(log.postedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                {log.title && <p className="text-[11px] font-bold text-foreground mb-0.5">{log.title}</p>}
                <p className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-wrap">{log.content}</p>
                {log.error && <p className="text-[10px] text-red-400 mt-1">{log.error}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function GrowthEngine() {
  const [tab, setTab] = useState<'post' | 'campaigns' | 'history' | 'settings'>('post');

  const tabs = [
    { key: 'post' as const, label: 'Post Now', icon: Send },
    { key: 'campaigns' as const, label: 'Campaigns', icon: Rocket },
    { key: 'history' as const, label: 'History', icon: History },
    { key: 'settings' as const, label: 'Settings', icon: Key },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-gradient-to-r from-purple-500/5 to-emerald-500/5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-400" /> Growth Engine
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Automated posting to Discord, Twitter/X, and Reddit</p>
        </div>
        <div className="flex border-b border-border/20">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-bold transition-colors ${tab === t.key ? 'text-purple-400 border-b-2 border-purple-400 -mb-px' : 'text-muted-foreground hover:text-foreground'}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'post' && <PostNow />}
      {tab === 'campaigns' && <CampaignManager />}
      {tab === 'history' && <PostHistory />}
      {tab === 'settings' && <CredentialSettings />}
    </motion.div>
  );
}
