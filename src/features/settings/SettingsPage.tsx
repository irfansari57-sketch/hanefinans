import { useEffect, useState } from 'react';
import {
  Info, RotateCcw, Cpu, Activity, Newspaper, MessageSquare, Globe, KeyRound,
  Database, Send, Percent, Crown, Shield,
} from 'lucide-react';
import { resetOnboarding } from '@/components/domain/OnboardingTour';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAgents } from '@/store/agents';
import { useWatchlist } from '@/store/watchlist';
import { useAuth, isAdmin } from '@/store/auth';
import { usePricing } from '@/store/pricing';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import type { AgentStatus } from '@/data/types';
import { API_STATUS, API_KEYS } from '@/data/api/keys';
import { db } from '@/data/db';
import { clearServiceCaches } from '@/data/services';
import { sendTelegramMessage } from '@/data/api/telegram';

// Modüler section'lar — `./sections/` altında her biri kendi dosyasında
import { ApiCard, Stat } from './sections/ApiCard';
import { TelegramSection } from './sections/TelegramSection';
import { PushNotificationSection } from './sections/PushNotificationSection';
import { SiteVisibilitySection } from './sections/SiteVisibilitySection';
import { PwaInstallSection } from './sections/PwaInstallSection';
import { PriceField } from './sections/PriceField';
import { DeleteAccountSection } from './sections/DeleteAccountSection';
import { ChangePasswordSection } from './sections/ChangePasswordSection';
import { UserAdminSection } from './sections/UserAdminSection';

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

        {/* PWA — uygulamayı ana ekrana yükle (manuel tetikleyici) */}
        <PwaInstallSection />

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

        {/* Şifre değiştir — login olmuş tüm kullanıcılar için (#Ö1) */}
        {user && <ChangePasswordSection />}

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
