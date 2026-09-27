import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ShoppingBag, ChevronLeft, Loader2, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { setPageMeta } from '@/lib/pageMeta';

const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const ACCENT = '#81b64c';

interface ShopItem {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  amazonUrl: string;
  priceLabel: string | null;
}

export function ShopPage() {
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPageMeta('Shop | ChessScout.net', 'Chess boards, books, and gear recommended by ChessScout.', '/shop');
  }, []);

  useEffect(() => {
    apiFetch('/api/shop')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems(d.items))
      .catch(() => setError('Could not load the shop right now.'));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm mb-4" style={{ color: MUTED }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <ShoppingBag className="w-5 h-5" style={{ color: ACCENT }} />
          <h1 className="text-xl font-bold">Shop</h1>
        </div>
        <p className="text-xs leading-relaxed mb-6" style={{ color: MUTED }}>
          As an Amazon Associate, ChessScout.net earns from qualifying purchases made through the links below. Prices and availability are set by Amazon and can change at any time.
        </p>

        {error && <p className="text-sm" style={{ color: '#e57373' }}>{error}</p>}

        {!items && !error && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: MUTED }} />
          </div>
        )}

        {items && items.length === 0 && (
          <p className="text-sm text-center py-16" style={{ color: MUTED }}>Nothing in the shop yet -- check back soon.</p>
        )}

        {items && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl overflow-hidden flex flex-col"
                style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {item.imageUrl && (
                  <div className="w-full aspect-square flex items-center justify-center" style={{ background: '#0d0d0c' }}>
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain" loading="lazy" />
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-sm mb-1" style={{ color: TEXT }}>{item.title}</h3>
                  {item.description && (
                    <p className="text-xs leading-relaxed mb-3 flex-1" style={{ color: MUTED }}>{item.description}</p>
                  )}
                  <div className="flex items-center justify-between gap-3 mt-auto pt-2">
                    {item.priceLabel && (
                      <span className="text-sm font-bold" style={{ color: ACCENT }}>{item.priceLabel}</span>
                    )}
                    <a
                      href={item.amazonUrl}
                      target="_blank"
                      rel="nofollow sponsored noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg ml-auto"
                      style={{ background: ACCENT, color: '#0d0d0c' }}
                    >
                      View on Amazon <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
