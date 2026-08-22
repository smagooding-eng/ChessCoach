import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import { PageHero, CHESSCOM_GREEN, TEXT_LIGHT, TEXT_MUTED } from '@/components/DesignSystem';
import { apiFetch } from '@/lib/api';
import { setPageMeta } from '@/lib/pageMeta';
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react';

interface ArticleSummary {
  slug: string;
  title: string;
  metaDescription: string;
  createdAt: string;
}

interface Article extends ArticleSummary {
  content: string;
  targetKeyword: string;
}

function renderMarkdown(md: string): React.ReactNode[] {
  const blocks = md.split(/\n\n+/).filter((b) => b.trim());
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (trimmed.startsWith('## ')) {
      return (
        <h2 key={i} className="font-display text-xl font-semibold mt-6 mb-2" style={{ color: TEXT_LIGHT }}>
          {trimmed.slice(3)}
        </h2>
      );
    }
    if (trimmed.startsWith('# ')) {
      return (
        <h1 key={i} className="font-display text-2xl font-semibold mt-6 mb-2" style={{ color: TEXT_LIGHT }}>
          {trimmed.slice(2)}
        </h1>
      );
    }
    if (/^[-*]\s/.test(trimmed)) {
      const items = trimmed.split('\n').map((l) => l.replace(/^[-*]\s*/, ''));
      return (
        <ul key={i} className="list-disc pl-5 space-y-1 my-2">
          {items.map((item, j) => (
            <li key={j} className="text-sm leading-relaxed" style={{ color: '#c8c5c1' }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="text-sm leading-relaxed my-3" style={{ color: '#c8c5c1' }}>
        {renderInline(trimmed)}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: TEXT_LIGHT }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    apiFetch(`/api/articles/${params.slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setArticle(d.article))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.slug]);

  useEffect(() => {
    if (article) {
      setPageMeta(
        `${article.title} | ChessScout.net`,
        article.metaDescription,
        `/learn/${article.slug}`,
      );
    }
  }, [article]);

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: CHESSCOM_GREEN }} /></div>;
  }

  if (notFound || !article) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-sm" style={{ color: TEXT_MUTED }}>Couldn't find that article.</p>
        <Link href="/learn" className="inline-block mt-4 text-sm font-semibold" style={{ color: CHESSCOM_GREEN }}>← Back to all articles</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/learn" className="inline-flex items-center gap-1.5 text-xs font-semibold mb-4" style={{ color: TEXT_MUTED }}>
        <ArrowLeft className="w-3.5 h-3.5" /> All articles
      </Link>
      <h1 className="font-display text-2xl md:text-3xl font-semibold" style={{ color: TEXT_LIGHT, letterSpacing: '-0.01em' }}>
        {article.title}
      </h1>
      <p className="text-xs mt-2" style={{ color: CHESSCOM_GREEN }}>
        Published {new Date(article.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
      <div className="mt-6">{renderMarkdown(article.content)}</div>

      <div className="mt-10 p-5 rounded-2xl text-center" style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm mb-3" style={{ color: TEXT_MUTED }}>See these patterns show up in your own games.</p>
        <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black"
          style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}>
          Try the free scouting demo <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

export function ArticlesIndex() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageMeta(
      'Chess Improvement Articles — ChessScout.net',
      'Practical chess improvement articles on blunders, time trouble, and opening mistakes.',
      '/learn',
    );
  }, []);

  useEffect(() => {
    apiFetch('/api/articles')
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => setArticles(d.articles ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHero piece="♟" eyebrow="ChessScout.net" title="Chess improvement articles" subtitle="Real, specific answers to the questions frustrated players actually search for." />

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: CHESSCOM_GREEN }} /></div>
        ) : articles.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: TEXT_MUTED }}>No articles published yet — check back soon.</p>
        ) : (
          articles.map((a) => (
            <Link key={a.slug} href={`/learn/${a.slug}`}
              className="block p-4 rounded-2xl transition-colors"
              style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="font-display text-base font-semibold" style={{ color: TEXT_LIGHT }}>{a.title}</h2>
              <p className="text-[11px] mt-0.5" style={{ color: CHESSCOM_GREEN }}>
                Published {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>{a.metaDescription}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
