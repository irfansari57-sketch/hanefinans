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
  sector?: string;
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
          map.set(s.symbol, { price: s.price, sector: s.sector });
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

  const savedRisk = readRiskProfile();
  const level = savedRisk?.profile?.level;
  const riskProfileTolerance: 'low' | 'medium' | 'high' | null =
    level === 'veryConservative' || level === 'conservative'
      ? 'low'
      : level === 'balanced'
      ? 'medium'
      : level === 'growth' || level === 'aggressive'
      ? 'high'
      : null;

  const mappedPositions = positions.map((p) => {
    const snap = snapshotMap.get(p.symbol);
    return {
      symbol: p.symbol,
      name: p.symbol,
      sector: snap?.sector,
      kind: p.kind === 'fund' ? ('fund' as const) : ('stock' as const),
      lot: p.lot,
      avgPrice: p.avgPrice,
      currentPrice: snap?.price,
    };
  });

  return (
    <div className="mb-5">
      <PortfolioHealthCard
        positions={mappedPositions}
        riskProfileTolerance={riskProfileTolerance}
      />
    </div>
  );
}
