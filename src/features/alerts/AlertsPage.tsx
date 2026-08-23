/**
 * /alarmlar — Kullanıcının server-side alarmlarını yönetir.
 *
 * Listede:
 *  - Aktif alarmlar (active=1)
 *  - Tetiklenmiş alarmlar (active=0, triggered_at != null) — geçmiş
 *  - Tetiklenenler "Tekrar etkinleştir" butonuyla geri açılabilir
 *  - Silme butonuyla kalıcı silinir
 *
 * Anonim kullanıcı için: "Giriş yap" yönlendirmesi (server-side alarm için gerek).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Trash2, RotateCcw, ChevronRight, Pause, Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/store/auth';
import {
  listAlerts,
  deleteAlert,
  toggleAlert,
  type AlertItem,
} from '@/data/api/alertsClient';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

function formatAge(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts * 1000;
  if (diff < 60_000) return 'az önce';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} sa önce`;
  return `${Math.floor(diff / 86_400_000)} gün önce`;
}

function formatPrice(v: number | null, assetType: AlertItem['asset_type']): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (assetType === 'crypto' || assetType === 'fx') {
    return `$${v.toFixed(v < 10 ? 4 : 2)}`;
  }
  return `${v.toFixed(v < 100 ? 2 : v < 1000 ? 2 : 0)} ₺`;
}

function routeFor(item: AlertItem): string {
  if (item.asset_type === 'fund') return `/fund/${item.symbol}`;
  if (item.asset_type === 'crypto') return `/kripto/${item.symbol}`;
  return `/stock/${item.symbol}`;
}

export function AlertsPage() {
  const user = useAuth((s) => s.user);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    listAlerts().then((arr) => {
      if (alive) {
        setItems(arr);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [user]);

  const active = useMemo(() => items.filter((a) => a.active === 1), [items]);
  const history = useMemo(() => items.filter((a) => a.active === 0).slice(0, 50), [items]);

  const handleDelete = async (id: number) => {
    setBusyId(id);
    try {
      const r = await deleteAlert(id);
      if (r.ok) {
        setItems((prev) => prev.filter((a) => a.id !== id));
        toast.success('Alarm silindi');
      } else {
        toast.error('Silinemedi', r.error);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = async (id: number, currentActive: 0 | 1) => {
    setBusyId(id);
    try {
      const action = currentActive === 1 ? 'disable' : 'enable';
      const r = await toggleAlert(id, action);
      if (r.ok && r.active != null) {
        setItems((prev) => prev.map((a) => a.id === id
          ? { ...a, active: r.active!, triggered_at: r.active === 1 ? null : a.triggered_at }
          : a));
        toast.success(r.active === 1 ? 'Alarm tekrar aktif' : 'Alarm duraklatıldı');
      } else {
        toast.error('İşlem başarısız', r.error);
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!user) {
    return (
      <>
        <SeoHead title="Alarmlarım" description="Server-side fiyat alarmları + push bildirim" path="/alarmlar" />
        <PageHeader title="Alarmlarım" subtitle="Fiyat alarmları + anında push bildirim" />
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6 text-center">
          <Bell size={32} className="mx-auto text-warning" />
          <h3 className="mt-2 text-base font-semibold text-slate-100">Giriş yapman gerek</h3>
          <p className="mt-1 text-sm text-slate-400">
            Server-side fiyat alarmları için hesap gerekli. Tarayıcı kapalıyken bile push bildirim alırsın.
          </p>
          <Link to="/uyelik" className="btn-primary mt-4 inline-flex">
            Giriş yap / Üye ol <ChevronRight size={14} />
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <SeoHead title="Alarmlarım" description="Server-side fiyat alarmları + push bildirim" path="/alarmlar" />
      <PageHeader title="Alarmlarım" subtitle={`${active.length} aktif • ${history.length} tetiklenmiş`} />

      {loading ? (
        <div className="rounded-xl border border-border bg-bg-soft p-6 text-center text-sm text-slate-500">
          Yükleniyor…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={32} />}
          title="Henüz alarm yok"
          description="Hisse veya fon detay sayfasındaki 'Alarm' butonuyla fiyat alarmı kurabilirsin. Tetiklendiğinde tarayıcın kapalı olsa bile push bildirim alırsın."
          action={
            <Link
              to="/stocks"
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg transition hover:bg-accent/90"
            >
              Hisselere göz at
            </Link>
          }
        />
      ) : (
        <>
          {/* Aktif alarmlar */}
          {active.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                <Bell size={12} className="text-accent" /> Aktif ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map((a) => (
                  <AlertCard
                    key={a.id}
                    item={a}
                    busy={busyId === a.id}
                    onToggle={() => handleToggle(a.id, a.active)}
                    onDelete={() => handleDelete(a.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Geçmiş — tetiklenmişler */}
          {history.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                <CheckCircle2 size={12} className="text-success" /> Tetiklenmiş ({history.length})
              </h2>
              <div className="space-y-2">
                {history.map((a) => (
                  <AlertCard
                    key={a.id}
                    item={a}
                    busy={busyId === a.id}
                    onToggle={() => handleToggle(a.id, a.active)}
                    onDelete={() => handleDelete(a.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <p className="mt-4 text-[10px] text-slate-500">
        ⚠️ Alarm sistemi cron tabanlıdır — yaklaşık 5 dk gecikme ile tetiklenir. Saniye-bazlı tetikleme garanti edilemez.
      </p>
    </>
  );
}

function AlertCard({ item, busy, onToggle, onDelete }: {
  item: AlertItem;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isActive = item.active === 1;
  const isTriggered = !isActive && item.triggered_at != null;
  const isAbove = item.direction === 'above';
  const url = routeFor(item);

  return (
    <PremiumCard
      accent={isTriggered ? 'success' : isActive ? 'cyan' : 'slate'}
      hover={isActive ? 'lift' : 'none'}
      density="compact"
      className={!isActive && !isTriggered ? 'opacity-70' : undefined}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
          isTriggered ? 'bg-success/15 text-success' : isActive ? 'bg-accent/15 text-accent' : 'bg-slate-700/40 text-slate-400',
        )}>
          {isTriggered ? <CheckCircle2 size={18} /> : isActive ? <Bell size={18} /> : <Pause size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={url} className="font-mono text-sm font-bold text-accent hover:underline">
              {item.symbol}
            </Link>
            <span className="rounded-full bg-bg-card px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
              {item.asset_type === 'stock' ? 'Hisse' : item.asset_type === 'fund' ? 'Fon' : item.asset_type === 'crypto' ? 'Kripto' : 'Döviz'}
            </span>
            {isTriggered && (
              <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                Tetiklendi
              </span>
            )}
            {!isActive && !isTriggered && (
              <span className="rounded-full bg-slate-700/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
                Duraklatıldı
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={cn('font-semibold', isAbove ? 'text-success' : 'text-danger')}>
              {isAbove ? '≥' : '≤'} {formatPrice(item.threshold, item.asset_type)}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">
              Son fiyat: {formatPrice(item.last_price ?? item.trigger_price, item.asset_type)}
            </span>
            {item.last_checked_at && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-[10px] text-slate-500">
                  Kontrol: {formatAge(item.last_checked_at)}
                </span>
              </>
            )}
          </div>
          {item.note && (
            <p className="mt-1 text-[11px] text-slate-500 italic">"{item.note}"</p>
          )}
          {isTriggered && (
            <p className="mt-1 text-[11px] text-success">
              {formatAge(item.triggered_at)} tetiklendi · {formatPrice(item.trigger_price, item.asset_type)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onToggle}
            disabled={busy}
            className="rounded-md border border-border bg-bg-card p-1.5 text-slate-400 transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
            title={isActive ? 'Duraklat' : 'Tekrar aktive et'}
            aria-label={isActive ? 'Duraklat' : 'Tekrar aktive et'}
          >
            {isActive ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="rounded-md border border-border bg-bg-card p-1.5 text-slate-400 transition hover:border-danger/40 hover:text-danger disabled:opacity-50"
            title="Sil"
            aria-label="Sil"
          >
            {isTriggered ? <Trash2 size={12} /> : <Trash2 size={12} />}
          </button>
        </div>
      </div>
    </PremiumCard>
  );
}

// Silinmemiş işaretler için RotateCcw + AlertTriangle import garbage çıkartmamak için referans:
void RotateCcw;
void AlertTriangle;
