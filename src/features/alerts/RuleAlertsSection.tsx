/**
 * Kural alarmları bölümü — /alarmlar sayfası (Hafta 4b, 22 Eki 2026).
 *
 * Fiyat eşiği yerine gösterge koşulu: RSI eşiği, SMA50/200 kesişimi, sinyal
 * motoru kuralı, 52h zirveye yakınlık, tarayıcı şablonu. Günde bir kez
 * (kapanış barı yazıldıktan sonra) değerlendirilir; koşul sağlandığında push.
 *
 * SPK dili: "koşul sağlandı" — al/sat yok. Yatırım tavsiyesi değildir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { EvidenceLink } from '@/components/ui/EvidenceLink';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  createRuleAlert,
  deleteRuleAlert,
  listRuleAlerts,
  setRuleAlertActive,
  type RuleAlertItem,
} from '@/data/api/ruleAlertsClient';
import { describeRule, parseRule, RULE_KIND_LABELS, type RuleKind, type CrossDirection } from '@/lib/ruleAlerts';
import { SIGNAL_LABELS, type SignalKind } from '@/lib/signals';
import { SCREEN_PRESETS } from '@/lib/metrics';

const KIND_ORDER: RuleKind[] = ['rsi_below', 'rsi_above', 'cross_sma50', 'cross_sma200', 'signal', 'near_52w_high', 'screen'];

function formatAge(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts * 1000;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} dk önce`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} sa önce`;
  return `${Math.floor(diff / 86_400_000)} gün önce`;
}

export function RuleAlertsSection() {
  const [items, setItems] = useState<RuleAlertItem[]>([]);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [symbol, setSymbol] = useState('');
  const [kind, setKind] = useState<RuleKind>('rsi_below');
  const [threshold, setThreshold] = useState('30');
  const [direction, setDirection] = useState<CrossDirection>('any');
  const [signalKind, setSignalKind] = useState<SignalKind>('momentum');
  const [maxPct, setMaxPct] = useState('3');
  const [presetId, setPresetId] = useState(SCREEN_PRESETS[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await listRuleAlerts();
    setItems(r.rules);
    setLimit(r.limit);
    setLoadError(r.ok ? null : (r.hint ? `${r.error} (${r.hint})` : r.error ?? 'Yüklenemedi'));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const activeCount = useMemo(() => items.filter((i) => i.active === 1).length, [items]);

  const buildParams = (): unknown => {
    switch (kind) {
      case 'rsi_below':
      case 'rsi_above': return { threshold: Number(threshold) };
      case 'cross_sma50':
      case 'cross_sma200': return { direction };
      case 'signal': return { kind: signalKind };
      case 'near_52w_high': return { maxPct: Number(maxPct) };
      case 'screen': return SCREEN_PRESETS.find((p) => p.id === presetId)?.filter ?? {};
    }
  };

  const handleCreate = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(sym)) { toast.error('Sembol geçersiz', 'BIST kodu gir, ör. THYAO'); return; }
    const parsed = parseRule(kind, buildParams());
    if (!parsed) { toast.error('Kural geçersiz', 'Eşik değerini kontrol et'); return; }
    setSaving(true);
    try {
      const r = await createRuleAlert({ symbol: sym, ruleKind: parsed.kind, rule: parsed.params });
      if (r.ok) {
        toast.success('Kural alarmı kuruldu', `${sym} · ${describeRule(parsed)}`);
        setSymbol('');
        setShowForm(false);
        await reload();
      } else {
        toast.error('Kurulamadı', r.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: RuleAlertItem) => {
    setBusyId(item.id);
    try {
      const r = await setRuleAlertActive(item.id, item.active !== 1);
      if (r.ok && r.active != null) {
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, active: r.active! } : x)));
        toast.success(r.active === 1 ? 'Kural aktif' : 'Kural duraklatıldı');
      } else toast.error('İşlem başarısız', r.error);
    } finally { setBusyId(null); }
  };

  const handleDelete = async (id: number) => {
    setBusyId(id);
    try {
      const r = await deleteRuleAlert(id);
      if (r.ok) { setItems((prev) => prev.filter((x) => x.id !== id)); toast.success('Kural alarmı silindi'); }
      else toast.error('Silinemedi', r.error);
    } finally { setBusyId(null); }
  };

  return (
    <section className="mt-6" aria-labelledby="rule-alerts-heading">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="rule-alerts-heading" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-fg-2">
          <Activity size={12} className="text-accent" /> Kural alarmları ({activeCount} aktif / {limit})
        </h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-xs text-fg-2 transition hover:border-accent/40 hover:text-accent"
        >
          <Plus size={12} /> {showForm ? 'Kapat' : 'Yeni kural'}
        </button>
      </div>
      <p className="mb-3 text-[11px] text-fg-3">
        Gösterge koşulu izler (RSI, SMA kesişimi, sinyal, tarayıcı filtresi). Günde bir kez, kapanış barı yazıldıktan sonra değerlendirilir;
        koşul sağlandığında push bildirimi gelir. Yatırım tavsiyesi değildir.
      </p>

      {showForm && (
        <div className="mb-3 rounded-xl border border-border bg-bg-soft p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rule-symbol">Sembol (BIST)</label>
              <input id="rule-symbol" className="input font-mono uppercase" placeholder="THYAO" maxLength={6} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="rule-kind">Kural türü</label>
              <select id="rule-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
                {KIND_ORDER.map((k) => <option key={k} value={k}>{RULE_KIND_LABELS[k]}</option>)}
              </select>
            </div>

            {(kind === 'rsi_below' || kind === 'rsi_above') && (
              <div>
                <label className="label" htmlFor="rule-threshold">RSI(14) eşiği (1–99)</label>
                <input id="rule-threshold" type="number" min={1} max={99} step={1} className="input" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
              </div>
            )}
            {(kind === 'cross_sma50' || kind === 'cross_sma200') && (
              <div>
                <label className="label" htmlFor="rule-direction">Kesişim yönü</label>
                <select id="rule-direction" className="input" value={direction} onChange={(e) => setDirection(e.target.value as CrossDirection)}>
                  <option value="any">İki yön</option>
                  <option value="up">Yukarı (alttan üste)</option>
                  <option value="down">Aşağı (üstten alta)</option>
                </select>
              </div>
            )}
            {kind === 'signal' && (
              <div>
                <label className="label" htmlFor="rule-signal">Sinyal kuralı</label>
                <select id="rule-signal" className="input" value={signalKind} onChange={(e) => setSignalKind(e.target.value as SignalKind)}>
                  {(Object.keys(SIGNAL_LABELS) as SignalKind[]).map((k) => <option key={k} value={k}>{SIGNAL_LABELS[k]}</option>)}
                </select>
              </div>
            )}
            {kind === 'near_52w_high' && (
              <div>
                <label className="label" htmlFor="rule-maxpct">Zirveye en fazla uzaklık (%)</label>
                <input id="rule-maxpct" type="number" min={0.5} max={50} step={0.5} className="input" value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
              </div>
            )}
            {kind === 'screen' && (
              <div>
                <label className="label" htmlFor="rule-preset">Tarayıcı şablonu</label>
                <select id="rule-preset" className="input" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                  {SCREEN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-fg-3">{SCREEN_PRESETS.find((p) => p.id === presetId)?.desc}</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] text-fg-3">
              Veri: bars_daily günlük kapanış · yalnız BIST hisseleri · eşikler sabit ve görünür.
            </span>
            <button type="button" onClick={handleCreate} disabled={saving} className="btn-primary text-xs disabled:opacity-50">
              {saving ? 'Kaydediliyor…' : 'Kural alarmı kur'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-bg-soft p-4 text-center text-sm text-fg-3">Yükleniyor…</div>
      ) : loadError ? (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-fg-2">
          Kural alarmları yüklenemedi: <span className="font-mono">{loadError}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-soft p-4 text-center text-xs text-fg-3">
          Henüz kural alarmı yok. "Yeni kural" ile RSI eşiği, SMA kesişimi veya sinyal kuralı için bildirim kur.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => <RuleAlertCard key={item.id} item={item} busy={busyId === item.id} onToggle={() => handleToggle(item)} onDelete={() => handleDelete(item.id)} />)}
        </div>
      )}
    </section>
  );
}

function RuleAlertCard({ item, busy, onToggle, onDelete }: { item: RuleAlertItem; busy: boolean; onToggle: () => void; onDelete: () => void }) {
  const isActive = item.active === 1;
  const rule = parseRule(item.rule_kind, item.rule);
  const label = rule ? describeRule(rule) : `${RULE_KIND_LABELS[item.rule_kind] ?? item.rule_kind} (parametre okunamadı)`;
  const triggered = item.trigger_count > 0;

  return (
    <PremiumCard accent={isActive ? 'cyan' : 'slate'} hover={isActive ? 'lift' : 'none'} density="compact" className={!isActive ? 'opacity-70' : undefined}>
      <div className="flex items-start gap-3">
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', isActive ? 'bg-accent/15 text-accent' : 'bg-slate-700/40 text-fg-3')}>
          {isActive ? <Activity size={18} /> : <Pause size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/stock/${item.symbol}`} className="font-mono text-sm font-bold text-accent hover:underline">{item.symbol}</Link>
            <span className="rounded-full bg-bg-card px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-fg-3">Kural</span>
            {!isActive && <span className="rounded-full bg-slate-700/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-fg-3">Duraklatıldı</span>}
            {triggered && <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">{item.trigger_count}× koşul sağlandı</span>}
          </div>
          <div className="mt-1 text-xs text-fg">
            {label}
            <EvidenceLink
              title="Kural tanımı"
              rows={[
                { label: 'Tür', value: RULE_KIND_LABELS[item.rule_kind] ?? item.rule_kind },
                { label: 'Parametre', value: JSON.stringify(item.rule ?? {}).slice(0, 120), source: 'rule_alerts' },
                { label: 'Son değerlendirme', value: item.last_eval_date ?? '—', source: 'bars_daily' },
              ]}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-fg-3">
            <span>Son değerlendirme: {item.last_eval_date ?? 'henüz yok'}</span>
            <span>·</span>
            <span>Son tetiklenme: {item.last_triggered_at ? formatAge(item.last_triggered_at) : '—'}</span>
            <span>·</span>
            <span>Sayaç: {item.trigger_count}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onToggle} disabled={busy} className="rounded-md border border-border bg-bg-card p-1.5 text-fg-3 transition hover:border-accent/40 hover:text-accent disabled:opacity-50" title={isActive ? 'Duraklat' : 'Devam ettir'} aria-label={isActive ? 'Duraklat' : 'Devam ettir'}>
            {isActive ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button type="button" onClick={onDelete} disabled={busy} className="rounded-md border border-border bg-bg-card p-1.5 text-fg-3 transition hover:border-danger/40 hover:text-danger disabled:opacity-50" title="Sil" aria-label="Sil">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </PremiumCard>
  );
}
