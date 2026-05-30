import { Link } from 'react-router-dom';
import { findCrypto } from '@/data/cryptoSymbols';
import { findForex } from '@/data/forexSymbols';
import { findUsStock } from '@/data/usStocks';
import { findBistStock } from '@/data/bistAll';
import { cn } from '@/lib/utils';

/**
 * Sembol etiketi — otomatik olarak doğru detay sayfasına yönlendirir.
 * Algılama sırası:
 *   1. Kripto (findCrypto: BTC, ETH, SOL…)
 *   2. Döviz (findForex: USDTRY, EURTRY…)
 *   3. ABD hissesi (findUsStock: NVDA, AAPL…)
 *   4. BIST hissesi (findBistStock veya default fallback)
 *   5. /stock/SYM (varsayılan — BIST formatı varsayım)
 *
 * Bilinmeyen formatlar için hisse detayına gönderir (orada da yoksa empty state).
 */

interface Props {
  symbol: string;
  /** Görünüm — kompakt rounded pill mi yoksa düz monospace mi */
  variant?: 'badge' | 'inline';
  /** Override: forex/kripto vs. otomatik algılama yerine zorla */
  type?: 'stock' | 'fund' | 'crypto' | 'forex';
  className?: string;
}

function resolveRoute(symbol: string, type?: Props['type']): string {
  const s = symbol.toUpperCase();
  if (type === 'fund') return `/fund/${s}`;
  if (type === 'crypto') return `/crypto/${s}`;
  if (type === 'forex') return `/doviz/${s}`;
  if (type === 'stock') return `/stock/${s}`;
  // Auto-detect
  if (findCrypto(s)) return `/crypto/${s}`;
  if (findForex(s)) return `/doviz/${s}`;
  if (findUsStock(s)) return `/stock/${s}`;
  if (findBistStock(s)) return `/stock/${s}`;
  // Varsayılan: hisse detayına gönder (orada bulunmazsa empty state)
  return `/stock/${s}`;
}

export function SymbolBadge({ symbol, variant = 'badge', type, className }: Props) {
  const route = resolveRoute(symbol, type);

  if (variant === 'inline') {
    return (
      <Link
        to={route}
        className={cn('font-mono text-accent hover:underline', className)}
      >
        {symbol}
      </Link>
    );
  }

  return (
    <Link
      to={route}
      className={cn(
        'inline-flex items-center rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] text-accent transition hover:border-accent/40 hover:bg-accent/10',
        className,
      )}
    >
      {symbol}
    </Link>
  );
}
