/**
 * /tahmin — Günlük BIST tahmin oyunu.
 *
 * Bölümler:
 *  - Bugünkü tahmin slotları (BIST 100 + BIST 30) — 5 kategori butonu
 *  - Kullanıcı istatistikleri (toplam puan, isabet sayısı, doğruluk %)
 *  - Streak Badge (full variant)
 *  - Geçmiş tahminler (son 30 gün, sonuçlarıyla)
 *  - Liderlik tablosu (hafta / ay / tüm zamanlar)
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Target, TrendingUp, ChevronRight, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SeoHead } from '@/components/seo/SeoHead';
import { useAuth } from '@/store/auth';
import { StreakBadge } from '@/components/domain/StreakBadge';
import {
  fetchPredictionsToday,
  submitPrediction,
  fetchLeaderboard,
  BUCKET_LABELS,
  type PredictionAsset,
  type PredictionBucket,
  type UserPrediction,
  type LeaderboardEntry,
  type PredictionsTodayResponse,
} from '@/data/api/predictionsClient';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { LeaderGameCard } from './sections/LeaderGameCard';
import { SymbolPuzzleCard } from './sections/SymbolPuzzleCard';
import { FinancialQuizCard } from './sections/FinancialQuizCard';

const BUCKETS: PredictionBucket[] = ['strongUp', 'up', 'flat', 'down', 'strongDown'];

export function PredictionsPage() {
  const user = useAuth((s) => s.user);
  const [data, setData] = useState<PredictionsTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<PredictionAsset | null>(null);
  const [leaderPeriod, setLeaderPeriod] = useState<'week' | 'month' | 'all'>('all');
  const [leader, setLeader] = useState<LeaderboardEntry[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPredictionsToday().then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    setLeaderLoading(true);
    fetchLeaderboard(leaderPeriod).then((r) => {
      if (alive) {
        setLeader(r?.list ?? []);
        setLeaderLoading(false);
      }
    });
    return () => { alive = false; };
  }, [leaderPeriod]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const handlePick = async (asset: PredictionAsset, prediction: PredictionBucket) => {
    if (!user) {
      toast.error('Tahmin için giriş yap');
      return;
    }
    setSubmitting(asset);
    try {
      const r = await submitPrediction(asset, prediction);
      if (r.ok) {
        // Optimistic state update
        setData((prev) => {
          if (!prev) return prev;
          const existing = prev.userPredictions.find((p) => p.asset === asset && p.date === today);
          const updated: UserPrediction = existing
            ? { ...existing, prediction }
            : {
                id: -Date.now(),
                asset,
                date: today,
                prediction,
                base_value: null,
                actual_change_pct: null,
                actual_bucket: null,
                points_earned: null,
                resolved_at: null,
              };
          return {
            ...prev,
            userPredictions: [updated, ...prev.userPredictions.filter((p) => !(p.asset === asset && p.date === today))],
          };
        });
        toast.success('Tahminin kaydedildi', `${asset} için ${BUCKET_LABELS[prediction].label}`);
      } else {
        toast.error('Tahmin kaydedilemedi', r.error);
      }
    } finally {
      setSubmitting(null);
    }
  };

  const todayPicks = useMemo(() => {
    if (!data) return new Map<PredictionAsset, PredictionBucket>();
    const m = new Map<PredictionAsset, PredictionBucket>();
    for (const p of data.userPredictions) {
      if (p.date === today) m.set(p.asset, p.prediction);
    }
    return m;
  }, [data, today]);

  const history = useMemo(() => {
    if (!data) return [];
    return data.userPredictions.filter((p) => p.date !== today && p.resolved_at != null).slice(0, 30);
  }, [data, today]);

  return (
    <>
      <SeoHead title="Oyunlarım" description="Borsa oyunları — tahmin et, puan kazan, leaderboard'a gir" path="/tahmin" />
      <PageHeader title="Oyunlarım" subtitle="Borsa bilgini test et, tahmin yap, puan topla, leaderboard'a yüksel" />

      {/* Oyun secim grid'i — diger oyunlar yakinda */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
          <Sparkles size={14} /> Tum Oyunlar
        </h2>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <a href="#gunluk-tahmin" className="rounded-xl border-2 border-success/40 bg-success/10 p-3 transition hover:scale-[1.02] hover:bg-success/15">
            <div className="text-2xl mb-1">🎯</div>
            <div className="text-xs font-bold text-success">Günlük Tahmin</div>
            <div className="text-[10px] text-slate-400">Aktif</div>
          </a>
          <a href="#bugunun-lideri" className="rounded-xl border-2 border-info/40 bg-info/10 p-3 transition hover:scale-[1.02] hover:bg-info/15">
            <div className="text-2xl mb-1">📈</div>
            <div className="text-xs font-bold text-info">Bugünün Lideri</div>
            <div className="text-[10px] text-slate-400">Aktif</div>
          </a>
          <div className="rounded-xl border border-border bg-bg-soft p-3 opacity-60">
            <div className="text-2xl mb-1">🏭</div>
            <div className="text-xs font-bold text-slate-300">Sektör Şampiyonu</div>
            <div className="text-[10px] text-warning">Yakında</div>
          </div>
          <a href="#finansal-quiz" className="rounded-xl border-2 border-warning/40 bg-warning/10 p-3 transition hover:scale-[1.02] hover:bg-warning/15">
            <div className="text-2xl mb-1">🧠</div>
            <div className="text-xs font-bold text-warning">Finansal Quiz</div>
            <div className="text-[10px] text-slate-400">Aktif</div>
          </a>
          <a href="#sembol-bulmaca" className="rounded-xl border-2 border-purple-500/40 bg-purple-500/10 p-3 transition hover:scale-[1.02] hover:bg-purple-500/15">
            <div className="text-2xl mb-1">🔤</div>
            <div className="text-xs font-bold text-purple-400">Sembol Bulmaca</div>
            <div className="text-[10px] text-slate-400">Aktif</div>
          </a>
          <div className="rounded-xl border border-border bg-bg-soft p-3 opacity-60">
            <div className="text-2xl mb-1">💰</div>
            <div className="text-xs font-bold text-slate-300">Sanal Portföy</div>
            <div className="text-[10px] text-warning">Yakında</div>
          </div>
        </div>
      </section>

      <div className="mb-8"><LeaderGameCard /></div>
      <div className="mb-8"><SymbolPuzzleCard /></div>
      <div className="mb-8"><FinancialQuizCard /></div>

            <h2 id="gunluk-tahmin" className="mb-3 text-sm font-semibold uppercase tracking-wider text-success flex items-center gap-1.5">
        <Target size={14} /> Günlük Tahmin Oyunu
      </h2>

      {/* Stats + Streak */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <StreakBadge variant="full" />
        {data && user && (
          <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-warning/5 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent">
                <Trophy size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-accent">{data.userStats.totalPoints}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">toplam puan</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {data.userStats.correctCount}/{data.userStats.totalCount} isabet
                  {data.userStats.totalCount > 0 && (
                    <> • <strong className="text-slate-200">%{Math.round((data.userStats.correctCount / data.userStats.totalCount) * 100)}</strong> doğruluk</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bugünkü slotlar */}
      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          <Target size={12} className="text-accent" /> Bugün ({today})
        </h2>
        {!user && (
          <div className="mb-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
            <p className="text-slate-300">
              Tahmin oynamak için <Link to="/uyelik" className="font-bold text-accent underline">giriş yap</Link> →
              ücretsiz hesap, anlık puanlama.
            </p>
          </div>
        )}
        {loading ? (
          <div className="rounded-xl border border-border bg-bg-soft p-6 text-center text-sm text-slate-500">
            Yükleniyor…
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data?.slots.map((slot) => {
              const pick = todayPicks.get(slot.asset);
              return (
                <div key={slot.asset} className="rounded-xl border border-border bg-bg-soft p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-100">{slot.label}</h3>
                    {pick && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                        Tahminin: {BUCKET_LABELS[pick].emoji} {BUCKET_LABELS[pick].label}
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-[11px] text-slate-500">
                    Yarın BIST kapanışı bugünden hangi yöne hareket eder?
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {BUCKETS.map((b) => {
                      const meta = BUCKET_LABELS[b];
                      const selected = pick === b;
                      return (
                        <button
                          key={b}
                          onClick={() => handlePick(slot.asset, b)}
                          disabled={!user || submitting === slot.asset}
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-[10px] font-semibold transition disabled:opacity-50',
                            selected
                              ? 'border-accent bg-accent/20 text-accent shadow-md'
                              : 'border-border bg-bg-card text-slate-400 hover:border-accent/50 hover:text-accent',
                          )}
                          title={`${meta.label} (${meta.range})`}
                        >
                          <span className="text-lg leading-none">{meta.emoji}</span>
                          <span className="text-[9px]">{meta.range}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    18:00 TR sonrası kilitlenir. Fikir değiştirebilirsin.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Liderlik tablosu */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            <Trophy size={12} className="text-warning" /> Liderlik
          </h2>
          <div className="flex gap-1">
            {(['week', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setLeaderPeriod(p)}
                className={cn(
                  'rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition',
                  leaderPeriod === p
                    ? 'bg-accent text-bg-card'
                    : 'border border-border bg-bg-card text-slate-400 hover:border-accent/50 hover:text-accent',
                )}
              >
                {p === 'week' ? 'Hafta' : p === 'month' ? 'Ay' : 'Tümü'}
              </button>
            ))}
          </div>
        </div>
        {leaderLoading ? (
          <div className="rounded-xl border border-border bg-bg-soft p-6 text-center text-sm text-slate-500">
            Yükleniyor…
          </div>
        ) : leader.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-soft p-6 text-center text-sm text-slate-500">
            Henüz sıralama yok. İlk tahmini sen ver!
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-bg-soft">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Kullanıcı</th>
                  <th className="px-3 py-2 text-right">Puan</th>
                  <th className="px-3 py-2 text-right">İsabet</th>
                  <th className="px-3 py-2 text-right">Doğruluk</th>
                </tr>
              </thead>
              <tbody>
                {leader.map((e) => (
                  <tr key={e.rank} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-left">
                      {e.rank <= 3 ? (
                        <span className="text-base">{e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉'}</span>
                      ) : (
                        <span className="text-slate-500 tabular-nums">{e.rank}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-100">{e.name}</span>
                        {e.tier === 'elite' && <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-warning">Elite</span>}
                        {e.tier === 'pro' && <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-accent">Pro</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-accent">{e.totalPoints}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{e.correctCount}/{e.totalCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">%{e.accuracy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Geçmiş tahminler */}
      {user && history.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            <TrendingUp size={12} className="text-slate-500" /> Geçmiş Tahminlerin
          </h2>
          <div className="space-y-1.5">
            {history.map((p) => {
              const correct = (p.points_earned ?? 0) >= 10;
              const close = (p.points_earned ?? 0) === 5;
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg-soft px-3 py-2">
                  <span className="text-[10px] tabular-nums text-slate-500 w-20">{p.date}</span>
                  <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 w-20 text-center">
                    {p.asset}
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    {BUCKET_LABELS[p.prediction].emoji} <span className="text-slate-400">{BUCKET_LABELS[p.prediction].label}</span>
                  </span>
                  <ChevronRight size={10} className="text-slate-600" />
                  <span className="flex items-center gap-1 text-xs">
                    {p.actual_bucket && BUCKET_LABELS[p.actual_bucket].emoji}
                    <span className={cn(
                      'tabular-nums',
                      (p.actual_change_pct ?? 0) >= 0 ? 'text-success' : 'text-danger',
                    )}>
                      {p.actual_change_pct != null ? `${p.actual_change_pct >= 0 ? '+' : ''}${p.actual_change_pct.toFixed(2)}%` : '—'}
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {correct ? (
                      <CheckCircle2 size={12} className="text-success" />
                    ) : close ? (
                      <Sparkles size={12} className="text-warning" />
                    ) : (
                      <XCircle size={12} className="text-slate-500" />
                    )}
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                      (p.points_earned ?? 0) > 0 ? 'bg-success/15 text-success'
                        : (p.points_earned ?? 0) === 0 ? 'bg-slate-600/20 text-slate-400'
                        : 'bg-danger/15 text-danger',
                    )}>
                      {p.points_earned != null ? (p.points_earned >= 0 ? `+${p.points_earned}` : `${p.points_earned}`) : '—'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="mt-4 text-[10px] text-slate-500">
        🎯 Tam isabet: +10 puan • Komşu kategori: +5 puan • 2 uzak: 0 puan • 3+ uzak: -2 puan.
        Her gün 18:00 TR'de kapanır, ertesi gün sonuçlanır.
      </p>
    </>
  );
}
