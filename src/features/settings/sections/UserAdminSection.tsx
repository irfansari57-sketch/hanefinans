import { useEffect, useState } from 'react';
import { Crown, X } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export interface AdminUser {
  id: number;
  email: string;
  name?: string;
  tier: 'free' | 'pro' | 'elite';
  tierExpiresAt?: number;
  emailVerified: boolean;
  emailVerifiedAt?: number;
  avatarColor: string;
  createdAt: number;
  lastLoginAt?: number;
}

/**
 * Cloudflare D1 üzerinden tüm kullanıcıları listeler — tier güncelleme,
 * süre uzatma, manuel email doğrulama ve hesap silme aksiyonlarını içerir.
 * SADECE admin kullanıcılara render edilir (sayfa düzeyinde gate'lenir).
 */
export function UserAdminSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const r = await fetch('/api/auth/users', { credentials: 'same-origin' });
      const j = await r.json() as { ok: boolean; users?: AdminUser[]; error?: string };
      if (!j.ok || !j.users) {
        setFetchError(j.error ?? 'Kullanıcılar alınamadı (D1 binding yapılandırıldı mı?)');
        return;
      }
      setUsers(j.users);
    } catch (e) {
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const stats = {
    total: users.length,
    free: users.filter((u) => u.tier === 'free').length,
    pro: users.filter((u) => u.tier === 'pro' && (!u.tierExpiresAt || u.tierExpiresAt > Date.now())).length,
    elite: users.filter((u) => u.tier === 'elite' && (!u.tierExpiresAt || u.tierExpiresAt > Date.now())).length,
    expired: users.filter((u) => u.tier !== 'free' && u.tierExpiresAt != null && u.tierExpiresAt < Date.now()).length,
    unverified: users.filter((u) => !u.emailVerified).length,
  };

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || (u.name?.toLowerCase() ?? '').includes(q);
  });

  const updateUser = async (
    userId: number,
    patch: { tier?: string; tierExpiresAt?: number | null; emailVerified?: boolean },
    successMsg: string,
  ) => {
    setBusy(userId);
    try {
      const r = await fetch('/api/auth/update-user', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...patch }),
      });
      const j = await r.json() as { ok: boolean; user?: AdminUser; error?: string };
      if (!j.ok) {
        toast.error('Güncelleme hatası', j.error);
        return;
      }
      setUsers((prev) => prev.map((u) => u.id === userId && j.user ? j.user : u));
      toast.success(successMsg);
    } finally {
      setBusy(null);
    }
  };

  const setTier = (userId: number, tier: 'free' | 'pro' | 'elite', durationMonths = 1) => {
    const expires = tier === 'free' ? null : Date.now() + durationMonths * 30 * 24 * 3600 * 1000;
    return updateUser(userId, { tier, tierExpiresAt: expires }, `Tier güncellendi → ${tier.toUpperCase()}`);
  };

  const extend = (userId: number, currentExpiresAt: number | undefined, months: number) => {
    const base = currentExpiresAt && currentExpiresAt > Date.now() ? currentExpiresAt : Date.now();
    const newExpires = base + months * 30 * 24 * 3600 * 1000;
    return updateUser(userId, { tierExpiresAt: newExpires }, `Süre ${months} ay uzatıldı`);
  };

  const manualVerify = (userId: number) =>
    updateUser(userId, { emailVerified: true }, 'Hesap manuel doğrulandı');

  const remove = async (userId: number, email: string) => {
    if (!window.confirm(`${email} hesabını silmek istediğinden emin misin? Geri alınamaz.`)) return;
    setBusy(userId);
    try {
      const r = await fetch('/api/auth/delete-user', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const j = await r.json() as { ok: boolean; error?: string };
      if (!j.ok) {
        toast.error('Silme hatası', j.error);
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success('Hesap silindi');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 lg:col-span-2">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-warning">
        <Crown size={14} /> Üye Yönetimi
        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">Admin</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> CLOUD
        </span>
      </h2>
      <p className="text-xs text-slate-400">
        Cloudflare D1 üzerinden tüm kullanıcılar — tüm cihazlardan kayıt olanlar burada görünür.
      </p>
      {fetchError && (
        <div className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          ⚠ {fetchError}
          <button onClick={fetchUsers} className="ml-2 underline">Tekrar dene</button>
        </div>
      )}
      {loading && !fetchError && (
        <div className="mt-2 text-xs text-slate-500">Yükleniyor…</div>
      )}

      {/* Stats */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <StatChip label="Toplam" value={stats.total} tone="slate" />
        <StatChip label="Doğrulanmamış" value={stats.unverified} tone="danger" />
        <StatChip label="Free" value={stats.free} tone="slate" />
        <StatChip label="PRO Aktif" value={stats.pro} tone="warning" />
        <StatChip label="ELITE Aktif" value={stats.elite} tone="accent" />
        <StatChip label="Süresi Geçmiş" value={stats.expired} tone="danger" />
      </div>

      {/* Charts: tier dağılımı + son 30 gün kayıt/aktivite */}
      <AdminCharts users={users} />

      {/* Search */}
      <div className="mt-3">
        <input
          type="text"
          placeholder="E-posta veya isimle ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full text-xs sm:max-w-sm"
        />
      </div>

      {/* User list */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="min-w-full text-xs">
          <thead className="bg-bg-soft text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Kullanıcı</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left hidden md:table-cell">Kayıt</th>
              <th className="px-3 py-2 text-left hidden md:table-cell">Son Giriş</th>
              <th className="px-3 py-2 text-left">Bitiş</th>
              <th className="px-3 py-2 text-center w-72">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Kayıt bulunamadı</td></tr>
            ) : filtered.map((u) => {
              const isAdminUser = ['irfansari57@gmail.com', 'haneassistance@gmail.com'].includes(u.email);
              const expired = u.tierExpiresAt != null && u.tierExpiresAt < Date.now();
              const effectiveTier = expired ? 'free' : u.tier;
              return (
                <tr key={u.id} className="hover:bg-bg-soft/50">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-200">{u.name || u.email.split('@')[0]}</div>
                    <div className="text-[10px] text-slate-500">{u.email}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {isAdminUser && (
                        <span className="inline-block rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">Admin</span>
                      )}
                      {u.emailVerified ? (
                        <span className="inline-block rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success" title={u.emailVerifiedAt ? new Date(u.emailVerifiedAt).toLocaleString('tr-TR') : 'Admin otomatik'}>
                          ✓ Doğrulandı
                        </span>
                      ) : (
                        <span className="inline-block rounded bg-danger/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-danger">
                          ⚠ Doğrulanmadı
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      effectiveTier === 'free' ? 'bg-slate-500/15 text-slate-400' :
                      effectiveTier === 'pro' ? 'bg-warning/15 text-warning' :
                      'bg-accent/15 text-accent',
                    )}>
                      {effectiveTier}
                    </span>
                    {expired && (
                      <span className="ml-1 text-[10px] text-danger">⚠ süresi doldu</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 hidden md:table-cell">
                    {new Date(u.createdAt).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 hidden md:table-cell">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('tr-TR') : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {u.tierExpiresAt ? new Date(u.tierExpiresAt).toLocaleDateString('tr-TR') : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <select
                        value={u.tier}
                        onChange={(e) => u.id != null && setTier(u.id, e.target.value as 'free' | 'pro' | 'elite', 1)}
                        disabled={busy === u.id}
                        className="rounded-md border border-border bg-bg-soft px-1.5 py-1 text-[10px]"
                      >
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                        <option value="elite">elite</option>
                      </select>
                      <button
                        onClick={() => u.id != null && extend(u.id, u.tierExpiresAt, 1)}
                        disabled={busy === u.id || u.tier === 'free'}
                        className="rounded-md border border-success/30 bg-success/10 px-1.5 py-1 text-[10px] text-success hover:bg-success/20 disabled:opacity-40"
                        title="1 ay uzat"
                      >
                        +1ay
                      </button>
                      <button
                        onClick={() => u.id != null && extend(u.id, u.tierExpiresAt, 12)}
                        disabled={busy === u.id || u.tier === 'free'}
                        className="rounded-md border border-success/30 bg-success/10 px-1.5 py-1 text-[10px] text-success hover:bg-success/20 disabled:opacity-40"
                        title="1 yıl uzat"
                      >
                        +1y
                      </button>
                      {!u.emailVerified && (
                        <button
                          onClick={() => u.id != null && manualVerify(u.id)}
                          disabled={busy === u.id}
                          className="rounded-md border border-success/30 bg-success/10 px-1.5 py-1 text-[10px] text-success hover:bg-success/20 disabled:opacity-40"
                          title="Email'i manuel doğrula"
                        >
                          ✓
                        </button>
                      )}
                      {!isAdminUser && (
                        <button
                          onClick={() => u.id != null && remove(u.id, u.email)}
                          disabled={busy === u.id}
                          className="rounded-md border border-danger/30 bg-danger/10 px-1.5 py-1 text-[10px] text-danger hover:bg-danger/20 disabled:opacity-40"
                          title="Hesabı sil"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        ℹ️ Veriler tarayıcı yerel veritabanında (IndexedDB). Server-side hesap senkronizasyonu için Supabase Auth / Firebase entegrasyonu gerekir.
      </p>
    </div>
  );
}

/**
 * Admin paneli için 3 mini görsel: tier dağılımı (donut) +
 * son 30 gün kayıt + son 30 gün aktivite (bar chart). Yeni
 * bağımlılık yok, saf SVG. Tailwind renk token'larını kullanır.
 */
function AdminCharts({ users }: { users: AdminUser[] }) {
  const total = users.length;
  if (total === 0) return null;

  const now = Date.now();
  const expired = (u: AdminUser) =>
    u.tier !== 'free' && u.tierExpiresAt != null && u.tierExpiresAt < now;
  const tierCounts = {
    free: users.filter((u) => u.tier === 'free' || expired(u)).length,
    pro: users.filter((u) => u.tier === 'pro' && !expired(u)).length,
    elite: users.filter((u) => u.tier === 'elite' && !expired(u)).length,
  };

  const DAY = 86_400_000;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const buckets = Array.from({ length: 30 }, (_, i) => {
    const start = todayMs - (29 - i) * DAY;
    const d = new Date(start);
    return {
      start,
      end: start + DAY,
      label: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
      signups: 0,
      logins: 0,
    };
  });
  for (const u of users) {
    if (u.createdAt) {
      const b = buckets.find((x) => u.createdAt >= x.start && u.createdAt < x.end);
      if (b) b.signups += 1;
    }
    if (u.lastLoginAt) {
      const b = buckets.find((x) => u.lastLoginAt! >= x.start && u.lastLoginAt! < x.end);
      if (b) b.logins += 1;
    }
  }
  const maxSignup = Math.max(1, ...buckets.map((b) => b.signups));
  const maxLogin = Math.max(1, ...buckets.map((b) => b.logins));
  const totalSignup30 = buckets.reduce((a, b) => a + b.signups, 0);
  const totalLogin30 = buckets.reduce((a, b) => a + b.logins, 0);

  const r = 38;
  const C = 2 * Math.PI * r;
  const freePct = tierCounts.free / total;
  const proPct = tierCounts.pro / total;
  const elitePct = tierCounts.elite / total;

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="rounded-lg border border-border bg-bg-card p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Tier Dağılımı
        </div>
        <div className="mt-2 flex items-center gap-3">
          <svg width="100" height="100" viewBox="0 0 100 100" className="flex-shrink-0">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#1f2a44" strokeWidth="14" />
            <circle cx="50" cy="50" r={r} fill="none" stroke="#64748b" strokeWidth="14"
              strokeDasharray={`${freePct * C} ${C}`} transform="rotate(-90 50 50)" />
            <circle cx="50" cy="50" r={r} fill="none" stroke="#f59e0b" strokeWidth="14"
              strokeDasharray={`${proPct * C} ${C}`} strokeDashoffset={-freePct * C}
              transform="rotate(-90 50 50)" />
            <circle cx="50" cy="50" r={r} fill="none" stroke="#22d3ee" strokeWidth="14"
              strokeDasharray={`${elitePct * C} ${C}`}
              strokeDashoffset={-(freePct + proPct) * C} transform="rotate(-90 50 50)" />
            <text x="50" y="50" textAnchor="middle" dominantBaseline="middle"
              className="fill-slate-100" fontSize="20" fontWeight="700">{total}</text>
            <text x="50" y="66" textAnchor="middle" className="fill-slate-500"
              fontSize="8" letterSpacing="1">ÜYE</text>
          </svg>
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#64748b' }} />
              <span className="text-slate-300">Free</span>
              <span className="ml-auto font-mono text-slate-400">{tierCounts.free}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-warning" />
              <span className="text-slate-300">Pro</span>
              <span className="ml-auto font-mono text-slate-400">{tierCounts.pro}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent" />
              <span className="text-slate-300">Elite</span>
              <span className="ml-auto font-mono text-slate-400">{tierCounts.elite}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Son 30 gün — Kayıt
          </div>
          <div className="text-[10px] font-mono text-accent">+{totalSignup30}</div>
        </div>
        <svg viewBox="0 0 300 64" className="mt-2 h-16 w-full" preserveAspectRatio="none">
          {buckets.map((b, i) => {
            const h = (b.signups / maxSignup) * 56;
            return (
              <rect key={i} x={i * 10 + 1} y={60 - h} width="8"
                height={Math.max(2, h)} rx="1" fill="#22d3ee"
                opacity={b.signups > 0 ? 0.9 : 0.12}>
                <title>{b.label}: {b.signups} kayıt</title>
              </rect>
            );
          })}
          <line x1="0" y1="60" x2="300" y2="60" stroke="#1f2a44" strokeWidth="0.5" />
        </svg>
        <div className="mt-1 flex justify-between text-[9px] text-slate-500">
          <span>{buckets[0].label}</span>
          <span>{buckets[buckets.length - 1].label}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Son 30 gün — Aktivite
          </div>
          <div className="text-[10px] font-mono text-success">+{totalLogin30}</div>
        </div>
        <svg viewBox="0 0 300 64" className="mt-2 h-16 w-full" preserveAspectRatio="none">
          {buckets.map((b, i) => {
            const h = (b.logins / maxLogin) * 56;
            return (
              <rect key={i} x={i * 10 + 1} y={60 - h} width="8"
                height={Math.max(2, h)} rx="1" fill="#22c55e"
                opacity={b.logins > 0 ? 0.9 : 0.12}>
                <title>{b.label}: {b.logins} giriş</title>
              </rect>
            );
          })}
          <line x1="0" y1="60" x2="300" y2="60" stroke="#1f2a44" strokeWidth="0.5" />
        </svg>
        <div className="mt-1 flex justify-between text-[9px] text-slate-500">
          <span>{buckets[0].label}</span>
          <span>{buckets[buckets.length - 1].label}</span>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, tone }: {
  label: string;
  value: number;
  tone: 'slate' | 'warning' | 'accent' | 'danger';
}) {
  const toneClass = {
    slate: 'border-border bg-bg-card text-slate-300',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    accent: 'border-accent/30 bg-accent/10 text-accent',
    danger: 'border-danger/30 bg-danger/10 text-danger',
  }[tone];
  return (
    <div className={cn('rounded-lg border px-2 py-1.5 text-center', toneClass)}>
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}
