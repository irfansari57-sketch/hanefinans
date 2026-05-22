import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Info, RotateCcw, Cpu, Activity, Newspaper, MessageSquare, Globe, KeyRound,
  Check, X, ExternalLink, Database, Send, Percent, Crown, Shield, Bell, Megaphone,
} from 'lucide-react';
import { getTelegramChatId, setTelegramChatId, sendTelegram } from '@/lib/telegram';
import { checkSupport, askPermission, getPermission, showSwNotification } from '@/lib/pushNotifications';
import { getPushPref, setPushPref } from '@/lib/notificationPrefs';
import { resetOnboarding } from '@/components/domain/OnboardingTour';
import { toast } from '@/components/ui/Toast';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAgents } from '@/store/agents';
import { useWatchlist } from '@/store/watchlist';
import { useAuth, isAdmin } from '@/store/auth';
import { usePricing } from '@/store/pricing';
import { useSiteSettings } from '@/store/siteSettings';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import type { AgentStatus } from '@/data/types';
import { API_STATUS, type ApiKeyStatus, API_KEYS } from '@/data/api/keys';
import { db } from '@/data/db';
import { clearServiceCaches } from '@/data/services';
import { sendTelegramMessage } from '@/data/api/telegram';

const agentIcon: Record<AgentStatus['key'], typeof Cpu> = {
  news: Newspaper,
  sentiment: MessageSquare,
  indicator: Activity,
  macro: Globe,
};

const stateTone: Record<AgentStatus['state'], string> = {
  mock: 'border-warning/30 bg-warning/10 text-warning',
  connecting: 'border-accent/30 bg-accent/10 text-accent',
  live: 'border-success/30 bg-success/10 text-success',
  error: 'border-danger/30 bg-danger/10 text-danger',
};

const stateLabel: Record<AgentStatus['state'], string> = {
  mock: 'mock',
  connecting: 'bağlanıyor',
  live: 'canlı',
  error: 'hata',
};

export function SettingsPage() {
  const agents = useAgents((s) => s.agents);
  const symbols = useWatchlist((s) => s.symbols);
  const user = useAuth((s) => s.user);
  const admin = isAdmin(user);
  const pricing = usePricing();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDbReset, setConfirmDbReset] = useState(false);
  const [counts, setCounts] = useState({ activity: 0, notes: 0, alerts: 0, bookmarks: 0 });
  const [tgTesting, setTgTesting] = useState(false);
  const [tgResult, setTgResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [policyRate, setPolicyRate] = useState(() => localStorage.getItem('fa.macro.policyRate') ?? '');
  const [policySaved, setPolicySaved] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      db.activity.count(),
      db.notes.count(),
      db.alerts.count(),
      db.bookmarks.count(),
    ]).then(([a, n, al, b]) => setCounts({ activity: a, notes: n, alerts: al, bookmarks: b }));
  }, []);

  const resetLocal = () => {
    try {
      localStorage.removeItem('fa.watchlist.v1');
      localStorage.removeItem('fa.macro.cache.v1');
      clearServiceCaches();
    } catch { /* ignore */ }
    setConfirmReset(false);
    window.location.reload();
  };

  const resetDb = async () => {
    await Promise.all([
      db.activity.clear(),
      db.notes.clear(),
      db.alerts.clear(),
      db.bookmarks.clear(),
    ]);
    setConfirmDbReset(false);
    setCounts({ activity: 0, notes: 0, alerts: 0, bookmarks: 0 });
  };

  const savePolicyRate = () => {
    const v = parseFloat(policyRate.replace(',', '.'));
    if (Number.isFinite(v) && v > 0) {
      localStorage.setItem('fa.macro.policyRate', String(v));
    } else {
      localStorage.removeItem('fa.macro.policyRate');
    }
    clearServiceCaches();
    setPolicySaved(true);
    setTimeout(() => setPolicySaved(false), 2500);
  };

  // Eski admin-only telegram test (VITE_TELEGRAM_CHAT_ID env-based, dev proxy üzerinden)
  // Yeni kullanıcı-bazlı sistem TelegramSection içinde — lib/telegram.ts kullanır
  const testTelegram = async () => {
    setTgTesting(true);
    setTgResult(null);
    const r = await sendTelegramMessage(
      `*Hane Finans test* — admin bağlantı kontrolü 🎯\n_Zaman:_ ${new Date().toLocaleString('tr-TR')}`,
      { parseMode: 'Markdown' },
    );
    setTgResult({ ok: r.ok, msg: r.ok ? 'Telegram\'a mesaj gönderildi!' : r.error ?? 'Bilinmeyen hata' });
    setTgTesting(false);
    setTimeout(() => setTgResult(null), 5000);
  };
  void testTelegram; // legacy — kullanılmayabilir; lint için

  return (
    <>
      <PageHeader title="Ayarlar" subtitle="API anahtarları, agent durumu, veritabanı ve uygulama bilgileri." />

      <div className="grid gap-3 lg:grid-cols-2">
        {/* API connections — admin only */}
        {admin && (
        <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <KeyRound size={14} /> API Bağlantıları
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">Admin</span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {API_STATUS.filter((s) => !s.optional).map((s) => (
              <ApiCard key={s.service} s={s} />
            ))}
          </div>
          {API_STATUS.some((s) => s.optional) && (
            <details className="mt-3 rounded-lg border border-border bg-bg-card p-3 text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-300">Opsiyonel (Hafta 2)</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {API_STATUS.filter((s) => s.optional).map((s) => (
                  <ApiCard key={s.service} s={s} />
                ))}
              </div>
            </details>
          )}
        </div>
        )}

        {/* Telegram bildirimleri */}
        <TelegramSection />

        {/* Push bildirimleri (SW tabanlı, sekme arka plandayken de çalışır) */}
        <PushNotificationSection />

        {/* Onboarding turunu tekrar göster */}
        <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Info size={14} className="text-accent" /> Tanıtım Turu
          </h2>
          <p className="text-xs leading-relaxed text-slate-400">
            5 adımlık tanıtım turunu (Panel, Takip Listem, Alarmlar, BES Hesaplayıcı) tekrar görmek için aşağıdaki butona bas.
          </p>
          <button onClick={resetOnboarding} className="btn-secondary mt-3 text-xs">
            <RotateCcw size={12} /> Tanıtım turunu tekrar başlat
          </button>
        </div>

        {/* Hesap silme — admin olmayan kullanıcılar için (kendi hesabını sil) */}
        {user && !admin && <DeleteAccountSection />}

        {/* Admin: Üye Yönetimi */}
        {admin && <UserAdminSection />}

        {/* Admin: Site Görünümü (reklam alanı toggle) */}
        {admin && <SiteVisibilitySection />}

        {/* Admin: Üyelik Ücretleri */}
        {admin && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 lg:col-span-2">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-warning">
              <Crown size={14} /> Üyelik Ücretleri <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">Admin</span>
            </h2>
            <p className="text-xs text-slate-400">
              MembershipPage'deki fiyatlar burada yönetilir. Değer girdiğin an MembershipPage anında günceller (Zustand persist).
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PriceField
                label="PRO Aylık"
                icon={Crown}
                value={pricing.proMonthly}
                onChange={(v) => { pricing.setProMonthly(v); setPricingSaved(true); setTimeout(() => setPricingSaved(false), 1500); }}
              />
              <PriceField
                label="PRO Yıllık"
                icon={Crown}
                value={pricing.proYearly}
                onChange={(v) => { pricing.setProYearly(v); setPricingSaved(true); setTimeout(() => setPricingSaved(false), 1500); }}
              />
              <PriceField
                label="ELITE Aylık"
                icon={Shield}
                value={pricing.eliteMonthly}
                onChange={(v) => { pricing.setEliteMonthly(v); setPricingSaved(true); setTimeout(() => setPricingSaved(false), 1500); }}
              />
              <PriceField
                label="ELITE Yıllık"
                icon={Shield}
                value={pricing.eliteYearly}
                onChange={(v) => { pricing.setEliteYearly(v); setPricingSaved(true); setTimeout(() => setPricingSaved(false), 1500); }}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={() => { pricing.resetToDefaults(); setPricingSaved(true); setTimeout(() => setPricingSaved(false), 1500); }}
              >
                <RotateCcw size={12} /> Varsayılana sıfırla (99/999/299/2999₺)
              </button>
              {pricingSaved && <span className="text-xs text-success">✓ Kaydedildi</span>}
            </div>
          </div>
        )}

        {/* Politika Faizi manuel override — admin only */}
        {admin && (
        <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Percent size={14} /> Politika Faizi (Manuel)
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">Admin</span>
          </h2>
          <p className="text-xs text-slate-500">
            TCMB EVDS canlı çekemediğimiz için bu değeri elle giriyorsun. Politika faizi nadiren değişir,
            karar olunca güncelle. Boş bırakırsan mock değer gösterilir.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="input max-w-[160px]"
              placeholder="ör. 50.00"
              value={policyRate}
              onChange={(e) => setPolicyRate(e.target.value)}
            />
            <span className="text-sm text-slate-400">%</span>
            <button className="btn-primary" onClick={savePolicyRate}>
              Kaydet
            </button>
            {policySaved && (
              <span className="text-xs text-success">✓ Kaydedildi (Makro'yu yenile)</span>
            )}
          </div>
        </div>
        )}

        {/* Admin: Telegram Test (admin-bound, env chat_id) */}
        {admin && (
        <div className="rounded-xl border border-border bg-bg-soft p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Send size={14} /> Telegram Test (Admin Botu)
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">Admin</span>
          </h2>
          <p className="text-xs text-slate-500">
            Admin bot bağlantısı doğru mu? Aşağıya bas, sana mesaj atsın.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              className="btn-primary"
              onClick={testTelegram}
              disabled={tgTesting || !API_KEYS.telegramChatId}
            >
              <Send size={14} /> {tgTesting ? 'Gönderiliyor…' : 'Test mesajı yolla'}
            </button>
            {tgResult && (
              <span
                className={cn(
                  'rounded-md px-2 py-1 text-xs',
                  tgResult.ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
                )}
              >
                {tgResult.msg}
              </span>
            )}
          </div>
          {!API_KEYS.telegramChatId && (
            <p className="mt-2 text-[11px] text-warning">VITE_TELEGRAM_CHAT_ID eksik.</p>
          )}
        </div>
        )}

        {/* Agents — admin only */}
        {admin && (
        <div className="rounded-xl border border-border bg-bg-soft p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Cpu size={14} /> Agent Durumu
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">Admin</span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {agents.map((a) => {
              const Icon = agentIcon[a.key];
              return (
                <div key={a.key} className="rounded-lg border border-border bg-bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-accent" />
                      <span className="text-sm font-medium text-slate-100">{a.label}</span>
                    </div>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider', stateTone[a.state])}>
                      {stateLabel[a.state]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Database stats */}
        <div className="rounded-xl border border-border bg-bg-soft p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Database size={14} /> Yerel Veritabanı (IndexedDB)
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Aktivite kaydı" value={counts.activity} />
            <Stat label="Not" value={counts.notes} />
            <Stat label="Alarm" value={counts.alerts} />
            <Stat label="Kayıtlı haber" value={counts.bookmarks} />
          </dl>
          <p className="mt-2 text-[11px] text-slate-500">
            Veri yalnızca bu cihazda. Bulut sync (Supabase) ileride opsiyonel.
          </p>
          <button className="btn-danger mt-3" onClick={() => setConfirmDbReset(true)}>
            <RotateCcw size={14} /> Veritabanını sıfırla
          </button>
        </div>

        {/* Watchlist + LocalStorage reset */}
        <div className="rounded-xl border border-border bg-bg-soft p-4">
          <h2 className="text-sm font-semibold text-slate-200">Takip Listem</h2>
          <p className="text-xs text-slate-500">{symbols.length} hisse takipte. LocalStorage'da saklanır.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {symbols.map((s) => (
              <span key={s} className="rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] text-accent">
                {s}
              </span>
            ))}
            {symbols.length === 0 && <span className="text-xs text-slate-500">Liste boş.</span>}
          </div>
          <button className="btn-danger mt-3" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} /> Önbellek + watchlist sıfırla
          </button>
        </div>

        {/* Admin: sistem versiyonu + altyapı bilgisi (kullanıcı için gereksiz) */}
        {admin && (
        <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-bg-card text-accent">
              <Info size={14} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Hane Finans <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">Admin</span></h3>
              <p className="mt-1 text-xs text-slate-500">
                Sürüm 0.1 • Cloud auth (Cloudflare D1) + GitHub Actions TEFAS feed + Pages Functions backend.
              </p>
            </div>
          </div>
        </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Önbellek + watchlist'i sıfırla?"
        message="Takip listen varsayılana dönecek, makro ve API önbellekleri temizlenecek. Veritabanı (notlar, alarmlar) etkilenmez."
        destructive
        confirmText="Sıfırla"
        onCancel={() => setConfirmReset(false)}
        onConfirm={resetLocal}
      />

      <ConfirmDialog
        open={confirmDbReset}
        title="Veritabanını sıfırla?"
        message="Tüm aktivite kayıtları, notlar, alarmlar ve kaydedilmiş haberler silinecek. Bu işlem geri alınamaz."
        destructive
        confirmText="Veritabanını sil"
        onCancel={() => setConfirmDbReset(false)}
        onConfirm={resetDb}
      />
    </>
  );
}

function ApiCard({ s }: { s: ApiKeyStatus }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-100">{s.label}</span>
        {s.configured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
            <Check size={10} /> bağlı
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger">
            <X size={10} /> yok
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-slate-500">{s.provides}</div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <code className="truncate font-mono text-slate-400">{s.envVar}</code>
        <a
          href={s.signUpUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-accent hover:underline"
        >
          kayıt <ExternalLink size={10} />
        </a>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">Ücretsiz: {s.freeTier}</div>
      {s.note && <div className="mt-1 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">{s.note}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function DeleteAccountSection() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!password) {
      setError('Şifreni gir');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/delete-account', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? 'Silinemedi');
        return;
      }
      // Logout state'ini temizle ve panele yönlendir
      toast.success('Hesabın silindi');
      await logout();
      setTimeout(() => { window.location.href = '/'; }, 500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 lg:col-span-2">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-danger">
        <X size={14} /> Hesabımı Sil
      </h2>
      <p className="text-xs leading-relaxed text-slate-400">
        Hesabını kalıcı olarak silmek istiyorsan aşağıdan onaylayabilirsin. Hesap silindikten sonra geri alınamaz; oturumun
        kapanır ve <strong className="text-slate-200">{user?.email}</strong> ile bağlı tüm veriler (üyelik, ödeme geçmişi)
        silinir. Tarayıcıdaki yerel veriler (watchlist, portföy, alarmlar) etkilenmez.
      </p>

      {!confirmOpen ? (
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/20"
        >
          <X size={12} /> Hesabımı silmek istiyorum
        </button>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-danger/30 bg-bg-card p-3">
          <p className="text-xs text-slate-300">Devam etmek için şifreni gir:</p>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Şifren"
            autoFocus
            showLockIcon={false}
          />
          {error && <div className="text-xs text-danger">⚠ {error}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleDelete}
              disabled={busy || !password}
              className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/25 disabled:opacity-50"
            >
              {busy ? 'Siliniyor…' : 'Kalıcı olarak sil'}
            </button>
            <button
              onClick={() => { setConfirmOpen(false); setPassword(''); setError(null); }}
              disabled={busy}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface AdminUser {
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
function UserAdminSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const adminEmailsLc = ['irfansari57@gmail.com', 'haneassistance@gmail.com'];

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

  const updateUser = async (userId: number, patch: { tier?: string; tierExpiresAt?: number | null; emailVerified?: boolean }, successMsg: string) => {
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

function StatChip({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'warning' | 'accent' | 'danger' }) {
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

function TelegramSection() {
  const [chatId, setChatIdState] = useState<string>(() => getTelegramChatId() ?? '');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const save = () => {
    setTelegramChatId(chatId.trim() || null);
    toast.success('Telegram chat_id kaydedildi');
  };

  const test = async () => {
    if (!chatId.trim()) {
      setResult({ ok: false, msg: 'Önce chat_id girip kaydet' });
      return;
    }
    setTelegramChatId(chatId.trim());
    setTesting(true);
    setResult(null);
    const r = await sendTelegram(
      `🎯 <b>Hane Finans test</b>\nBildirimler çalışıyor!\n<i>${new Date().toLocaleString('tr-TR')}</i>`,
    );
    setResult({ ok: r.ok, msg: r.ok ? 'Test mesajı Telegram\'a gönderildi! ✓' : r.error ?? 'Bilinmeyen hata' });
    setTesting(false);
  };

  return (
    <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Bell size={14} className="text-accent" /> Telegram Bildirimleri
      </h2>
      <p className="text-xs leading-relaxed text-slate-400">
        Fiyat alarmı tetiklendiğinde, AI analizi hazır olduğunda Telegram'a bildirim al.
        Önce Telegram'da <code className="rounded bg-bg-card px-1 text-accent">@HaneFinansBot</code> botuyla
        sohbet başlat, sonra <code className="rounded bg-bg-card px-1 text-accent">@userinfobot</code>'tan
        kendi <strong>chat_id</strong>'ni al ve buraya yapıştır.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          inputMode="numeric"
          placeholder="örn: 123456789"
          value={chatId}
          onChange={(e) => setChatIdState(e.target.value)}
          className="input"
        />
        <button onClick={save} className="btn-secondary">Kaydet</button>
        <button onClick={test} disabled={testing} className="btn-primary">
          {testing ? 'Gönderiliyor…' : 'Test mesajı'}
        </button>
      </div>

      {result && (
        <div
          className={cn(
            'mt-2 rounded-md border px-3 py-2 text-xs',
            result.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger',
          )}
        >
          {result.ok ? <Check size={12} className="inline mr-1" /> : <X size={12} className="inline mr-1" />}
          {result.msg}
        </div>
      )}
    </div>
  );
}

function PriceField({
  label, value, icon: Icon, onChange,
}: {
  label: string;
  value: number;
  icon: typeof Crown;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
        <Icon size={10} /> {label}
      </span>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2.5 py-1.5">
        <span className="text-sm text-slate-400">₺</span>
        <input
          type="number"
          min={0}
          step={10}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent text-sm font-bold tabular-nums text-slate-100 focus:outline-none"
        />
      </div>
    </label>
  );
}


function PushNotificationSection() {
  const user = useAuth((s) => s.user);
  const userId = user?.id ?? 'anon';
  const [support, setSupport] = useState(checkSupport());
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(getPermission());
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [prefAlerts, setPrefAlerts] = useState<boolean>(true);
  const [prefNews, setPrefNews] = useState<boolean>(false);

  // Sayfa açıldığında izin durumunu + tercihleri yükle
  useEffect(() => {
    setSupport(checkSupport());
    setPerm(getPermission());
    setPrefAlerts(getPushPref('alerts', userId));
    setPrefNews(getPushPref('news', userId));
  }, [userId]);

  const toggleAlerts = () => {
    const next = !prefAlerts;
    setPrefAlerts(next);
    setPushPref('alerts', userId, next);
  };
  const toggleNews = () => {
    const next = !prefNews;
    setPrefNews(next);
    setPushPref('news', userId, next);
  };

  const supported = support === 'supported';
  const granted = perm === 'granted';

  const enable = async () => {
    setBusy(true);
    try {
      const next = await askPermission();
      setPerm(next);
    } finally {
      setBusy(false);
    }
  };

  const testNotification = async () => {
    setTesting(true);
    try {
      const ok = await showSwNotification({
        title: 'Hane Finans bildirimi',
        body: 'Bildirimler çalışıyor! Alarmların burada görünecek.',
        url: '/panel',
        tag: 'test-' + Date.now(),
      });
      if (!ok) {
        toast.error('Bildirim gösterilemedi', 'Service worker hazır değil olabilir, sayfayı yenile ve tekrar dene.');
      }
    } finally {
      setTesting(false);
    }
  };

  let statusBadge: ReactNode;
  if (!supported) {
    statusBadge = (
      <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300">
        desteklenmiyor
      </span>
    );
  } else if (granted) {
    statusBadge = (
      <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
        aktif
      </span>
    );
  } else if (perm === 'denied') {
    statusBadge = (
      <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger">
        engellendi
      </span>
    );
  } else {
    statusBadge = (
      <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
        kapalı
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-soft p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Bell size={14} className="text-accent" /> Push Bildirimleri
        {statusBadge}
      </h2>
      <p className="text-xs leading-relaxed text-slate-400">
        Tarayıcı bildirim sisteminin üstünde Service Worker tabanlı push.
        Sekme arka plandayken bile fiyat alarmlarının görünür.
        İzin verirsen alarm tetiklendiğinde bildirim alırsın.
      </p>

      {!supported && (
        <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-[11px] text-warning">
          Tarayıcın push bildirimini desteklemiyor. iOS Safari'de bunun çalışması için
          siteyi "Ana Ekrana Ekle" ile yüklemen gerekir.
        </p>
      )}

      {supported && perm === 'denied' && (
        <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-[11px] text-danger">
          Bildirim iznini reddetmişsin. Tarayıcı ayarlarından izni elle açman gerek
          (adres çubuğundaki kilit ikonu → site izinleri).
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {supported && !granted && perm !== 'denied' && (
          <button
            onClick={enable}
            disabled={busy}
            className="btn-primary text-xs"
          >
            <Bell size={12} /> Bildirimleri Aç
          </button>
        )}
        {supported && granted && (
          <button
            onClick={testNotification}
            disabled={testing}
            className="btn-secondary text-xs"
          >
            <Bell size={12} /> Test Bildirimi Gönder
          </button>
        )}
      </div>

      {/* Tercihler — sadece izin verildiyse aktif */}
      {supported && granted && (
        <div className="mt-4 space-y-2 border-t border-border/50 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Hangi olaylar için bildirim?
          </p>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-bg-card/40 px-3 py-2 transition hover:bg-bg-card/70">
            <div>
              <div className="text-xs font-medium text-slate-200">Fiyat alarmları</div>
              <div className="text-[10px] text-slate-500">Eklediğin hisse/fon alarmı tetiklendiğinde</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefAlerts}
              onClick={toggleAlerts}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full transition',
                prefAlerts ? 'bg-success/70' : 'bg-slate-600',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                  prefAlerts ? 'left-4' : 'left-0.5',
                )}
              />
            </button>
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-bg-card/40 px-3 py-2 transition hover:bg-bg-card/70">
            <div>
              <div className="text-xs font-medium text-slate-200">Son dakika haberleri</div>
              <div className="text-[10px] text-slate-500">Önemi yüksek (≥7) breaking news geldikçe</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefNews}
              onClick={toggleNews}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full transition',
                prefNews ? 'bg-success/70' : 'bg-slate-600',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                  prefNews ? 'left-4' : 'left-0.5',
                )}
              />
            </button>
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * Admin: Site Görünümü — şu an sadece reklam (AdBanner) toggle.
 *
 * Not: Zustand+localStorage persist → store her tarayıcıda bağımsız tutulur.
 * Yani admin kendi tarayıcısında "açık" yaparsa kendi tarayıcısında banner'ı
 * görür. Diğer kullanıcılar varsayılan (kapalı) görür. Sunucu-taraflı global
 * site ayarı için ileride D1 site_settings tablosu eklenebilir.
 */
function SiteVisibilitySection() {
  const adBannerEnabled = useSiteSettings((s) => s.adBannerEnabled);
  const setAdBannerEnabled = useSiteSettings((s) => s.setAdBannerEnabled);

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 lg:col-span-2">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-warning">
        <Megaphone size={14} /> Site Görünümü
        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">Admin</span>
      </h2>
      <p className="text-xs leading-relaxed text-slate-400">
        Panel ve Günlük Analiz üstünde + sidebar/mobil altta görünen "Sponsor"
        reklam alanını ücretsiz üyeler için açıp kapatabilirsin. PRO/ELITE
        üyeler her durumda görmez. YouTube sponsoru ve diğer içerikler bu
        anahtardan etkilenmez.
      </p>

      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-md bg-bg-card/40 px-3 py-2 transition hover:bg-bg-card/70">
        <div>
          <div className="text-xs font-medium text-slate-200">Reklam banner'ı (Sponsor)</div>
          <div className="text-[10px] text-slate-500">
            {adBannerEnabled ? 'Şu an açık — ücretsiz üyeler görüyor' : 'Şu an kapalı — kimseye gösterilmiyor'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={adBannerEnabled}
          onClick={() => setAdBannerEnabled(!adBannerEnabled)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full transition',
            adBannerEnabled ? 'bg-success/70' : 'bg-slate-600',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
              adBannerEnabled ? 'left-4' : 'left-0.5',
            )}
          />
        </button>
      </label>
    </div>
  );
}
