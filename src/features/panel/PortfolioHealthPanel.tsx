/**
 * Panel içindeki Portföy Sağlık Skoru kartı — Dexie + risk profile + snapshot ile
 * PortfolioHealthCard'a ihtiyaç duyduğu propları besler.
 * Kullanıcı login değilse veya portfoyu boşsa hiçbir şey render etmez.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { readRiskProfile } from '@/lib/riskProfile';
import { useAuth } from '@/store/auth';
import { PortfolioHealthCard } from '@/components/domain/PortfolioHealthCard';
import type { Stock } from '@/data/types';
import { loadStocks } from '@/data/services';

interface Snapshot {
  price?: number;
  changePct30d?: number;
}

export function PortfolioHealthPanel() {
  const { user } = useAuth();
  const positions = useLiveQuery(() => db.portfolio.toArray(), []) ?? [];
  const [snapshotMap, setSnapshotMap] = useState<Map<string, Snapshot>>(new Map());

  const stockSymbols = useMemo(
    () => Array.from(new Set(positions.filter((p) => p.kind !== 'fund').map((p) => p.symbol))),
    [positions],
  );

  useEffect(() => {
    if (stockSymbols.length === 0) {
      setSnapshotMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await loadStocks(stockSymbols);
        if (cancelled) return;
        const map = new Map<string, Snapshot>();
        res.data.forEach((s: Stock) => {
          map.set(s.symbol, { price: s.price, changePct30d: s.periodReturns?.['1a'] });
        });
        setSnapshotMap(map);
      } catch {
        /* ignore — kart avgPrice ile hesaplar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockSymbols]);

  if (!user || positions.length === 0) return null;

  const riskProfile = readRiskProfile();
  const riskProfileTolerance =
    riskProfile?.type === 'conservative'
      ? 'low'
      : riskProfile?.type === 'moderate'
      ? 'medium'
      : riskProfile?.type === 'aggressive'
      ? 'high'
      : null;

  const mappedPositions = positions.map((p) => {
    const snap = snapshotMap.get(p.symbol);
    return {
      symbol: p.symbol,
      name: p.name,
      sector: (p as { sector?: string }).sector,
      kind: p.kind === 'fund' ? ('fund' as const) : ('stock' as const),
      lot: p.lot,
      avgPrice: p.avgPrice,
      currentPrice: snap?.price,
      changePct30d: snap?.changePct30d,
      tefasOpen: (p as { tefasOpen?: boolean }).tefasOpen,
    };
  });

  return (
    <PortfolioHealthCard
      positions={mappedPositions}
      riskProfileTolerance={riskProfileTolerance}
    />
  );
}
