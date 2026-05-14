import { useEffect, useState } from 'react';
import {
  Info, RotateCcw, Cpu, Activity, Newspaper, MessageSquare, Globe, KeyRound,
  Check, X, ExternalLink, Database, Send, Percent,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAgents } from '@/store/agents';
import { useWatchlist } from '@/store/watchlist';
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
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDbReset, setConfirmDbReset] = useState(false);
  const [counts, setCounts] = useState({ activity: 0, notes: 0, alerts: 0, bookmarks: 0 });
  const [tgTesting, setTgTesting] = useState(false);
  const [tgResult, setTgResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [policyRate, setPolicyRate] = useState(() => localStorage.getItem('fa.macro.policyRate') ?? '');
  const [policySaved, setPolicySaved] = useState(false);

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

  const testTelegram = async () => {
    setTgTesting(true);
    setTgResult(null);
    const r = await sendTelegramMessage(
      `*Hane Finans test* — bağlantı çalışıyor 🎯\n_Zaman:_ ${new Date().toLocaleString('tr-TR')}`,
      { parseMode: 'Markdown' },
    );
    setTgResult({ ok: r.ok, msg: r.ok ? 'Telegram\'a mesaj gönderildi!' : r.error ?? 'Bilinmeyen hata' });
    setTgTesting(false);
    setTimeout(() => setTgResult(null), 5000);
  };

  return (
    <>
      <PageHeader title="Ayarlar" subtitle="API anahtarları, agent durumu, veritabanı ve uygulama bilgileri." />

      <div className="grid gap-3 lg:grid-cols-2">
        {/* API connections */}
        <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <KeyRound size={14} /> API Bağlantıları
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

        {/* Politika Faizi manuel override */}
        <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Percent size={14} /> Politika Faizi (Manuel)
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

        {/* Telegram test */}
        <div className="rounded-xl border border-border bg-bg-soft p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Send size={14} /> Telegram Test
          </h2>
          <p className="text-xs text-slate-500">
            Bot ile yapılandırma doğru mu? Aşağıya bas, sana mesaj atsın.
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

        {/* Agents */}
        <div className="rounded-xl border border-border bg-bg-soft p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Cpu size={14} /> Agent Durumu
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

        <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-bg-card text-accent">
              <Info size={14} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Hane Finans</h3>
              <p className="mt-1 text-xs text-slate-500">
                Sürüm 0.1 • Veriler yerel (IndexedDB). Dev proxy ile TCMB ve Telegram backendi olmadan çalışıyor.
                Hafta 2'de gerçek backend (Supabase Edge Functions veya başka) takılınca, frontend kodu değişmeden
                canlıya geçecek.
              </p>
            </div>
          </div>
        </div>
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
