import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  History, Star, Eye, StickyNote, Bell, Bookmark, Search as SearchIcon, ArrowRight,
  Trash2, Pin, PinOff, ToggleLeft, ToggleRight, RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { activityRepo, alertsRepo, bookmarksRepo, notesRepo } from '@/data/repositories';
import type { ActivityEntry, ActivityType, PriceAlert } from '@/data/db';
import { formatRelative, formatDateTR } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { db } from '@/data/db';
import { SymbolBadge } from '@/components/domain/SymbolBadge';

type Tab = 'timeline' | 'notes' | 'alerts' | 'bookmarks';

const tabs: { key: Tab; label: string; icon: typeof History }[] = [
  { key: 'timeline', label: 'Zaman Tüneli', icon: History },
  { key: 'notes', label: 'Notlarım', icon: StickyNote },
  { key: 'alerts', label: 'Alarmlarım', icon: Bell },
  { key: 'bookmarks', label: 'Kaydedilenler', icon: Bookmark },
];

const activityIcon: Record<ActivityType, typeof History> = {
  'watchlist-add': Star,
  'watchlist-remove': Star,
  'news-viewed': Eye,
  'news-bookmarked': Bookmark,
  'news-unbookmarked': Bookmark,
  'note-added': StickyNote,
  'note-edited': StickyNote,
  'note-deleted': StickyNote,
  'alert-created': Bell,
  'alert-toggled': Bell,
  'alert-deleted': Bell,
  'alert-triggered': Bell,
  'search': SearchIcon,
  'page-view': ArrowRight,
  'data-refresh': RefreshCw,
};

const activityLabel: Record<ActivityType, string> = {
  'watchlist-add': 'Takibe alındı',
  'watchlist-remove': 'Takipten çıkarıldı',
  'news-viewed': 'Haber okundu',
  'news-bookmarked': 'Haber kaydedildi',
  'news-unbookmarked': 'Haber kaldırıldı',
  'note-added': 'Not eklendi',
  'note-edited': 'Not düzenlendi',
  'note-deleted': 'Not silindi',
  'alert-created': 'Alarm kuruldu',
  'alert-toggled': 'Alarm durumu değişti',
  'alert-deleted': 'Alarm silindi',
  'alert-triggered': 'Alarm tetiklendi',
  'search': 'Arama yapıldı',
  'page-view': 'Sayfa görüntülendi',
  'data-refresh': 'Veriler yenilendi',
};

const activityTone: Record<ActivityType, string> = {
  'watchlist-add': 'text-warning',
  'watchlist-remove': 'text-slate-400',
  'news-viewed': 'text-accent',
  'news-bookmarked': 'text-accent',
  'news-unbookmarked': 'text-slate-400',
  'note-added': 'text-success',
  'note-edited': 'text-accent',
  'note-deleted': 'text-slate-400',
  'alert-created': 'text-warning',
  'alert-toggled': 'text-accent',
  'alert-deleted': 'text-slate-400',
  'alert-triggered': 'text-danger',
  'search': 'text-slate-400',
  'page-view': 'text-slate-500',
  'data-refresh': 'text-slate-400',
};

export function HistoryPage() {
  const [tab, setTab] = useState<Tab>('timeline');
  const [clearOpen, setClearOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Geçmiş"
        subtitle="Uygulamadaki tüm etkileşimlerin, notların, alarmların ve kaydettiklerin."
        actions={
          tab === 'timeline' && (
            <button className="btn-secondary" onClick={() => setClearOpen(true)}>
              <Trash2 size={14} /> Zaman tünelini temizle
            </button>
          )
        }
      />

      <div className="mb-4 inline-flex flex-wrap rounded-lg border border-border bg-bg-soft p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
              tab === t.key
                ? 'bg-bg-card text-slate-100'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <Timeline />}
      {tab === 'notes' && <NotesList />}
      {tab === 'alerts' && <AlertsList />}
      {tab === 'bookmarks' && <BookmarksList />}

      <ConfirmDialog
        open={clearOpen}
        title="Zaman tünelini temizle?"
        message="Tüm aktivite kayıtları silinecek. Notlar, alarmlar ve kayıtlı haberler etkilenmeyecek."
        destructive
        confirmText="Temizle"
        onCancel={() => setClearOpen(false)}
        onConfirm={async () => {
          await activityRepo.clear();
          setClearOpen(false);
        }}
      />
    </>
  );
}

function Timeline() {
  const items = useLiveQuery(() => activityRepo.list({ limit: 200 }), []) ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<History size={28} />}
        title="Henüz aktivite yok"
        description="Watchlist'e hisse ekle, haber kaydet veya alarm kur — burada kronolojik akışı göreceksin."
      />
    );
  }

  const grouped = groupByDay(items);

  return (
    <div className="space-y-4">
      {grouped.map(([day, list]) => (
        <div key={day}>
          <div className="mb-1.5 px-1 text-xs uppercase tracking-wider text-slate-500">{day}</div>
          <div className="rounded-xl border border-border bg-bg-soft">
            <div className="divide-y divide-border">
              {list.map((a) => {
                const Icon = activityIcon[a.type];
                return (
                  <div key={a.id} className="flex items-start gap-3 p-3 text-sm">
                    <span className={cn('mt-0.5', activityTone[a.type])}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-200">{activityLabel[a.type]}</span>
                        {a.symbol && <SymbolBadge symbol={a.symbol} />}
                      </div>
                      {a.detail && (
                        <div className="mt-0.5 truncate text-xs text-slate-500">{a.detail}</div>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatRelative(new Date(a.timestamp).toISOString())}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesList() {
  const notes = useLiveQuery(() => notesRepo.list(), []) ?? [];

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={<StickyNote size={28} />}
        title="Henüz notun yok"
        description="Bir hisse satırında veya haber kartında 'Not' simgesine basarak ekle."
      />
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {notes
        .slice()
        .sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0) || b.updatedAt - a.updatedAt)
        .map((n) => (
          <div key={n.id} className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                {n.symbol && <SymbolBadge symbol={n.symbol} />}
                {n.newsId && <span className="text-slate-500">haber notu</span>}
                <span>{formatDateTR(new Date(n.updatedAt).toISOString())}</span>
              </div>
              <div className="flex gap-1">
                <button
                  className="rounded p-1 text-slate-400 hover:bg-bg-card"
                  onClick={() => n.id && notesRepo.togglePin(n.id, !n.pinned)}
                  aria-label="Sabitle"
                  title={n.pinned ? 'Sabitten çıkar' : 'Sabitle'}
                >
                  {n.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                </button>
                <button
                  className="rounded p-1 text-danger/70 hover:bg-bg-card hover:text-danger"
                  onClick={() => n.id && notesRepo.remove(n.id)}
                  aria-label="Sil"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{n.body}</p>
          </div>
        ))}
    </div>
  );
}

function AlertsList() {
  const alerts = useLiveQuery(() => alertsRepo.list(), []) ?? [];

  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={<Bell size={28} />}
        title="Henüz alarm yok"
        description="Hisse satırlarındaki çan simgesine basarak fiyat alarmı kurabilirsin."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-soft">
      <div className="divide-y divide-border">
        {alerts.map((a) => (
          <AlertRow key={a.id} alert={a} />
        ))}
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: PriceAlert }) {
  const triggered = !!alert.triggeredAt;
  return (
    <div className="flex items-center gap-3 p-3">
      <div
        className={cn(
          'grid h-8 w-8 place-items-center rounded-lg',
          triggered ? 'bg-danger/15 text-danger' : alert.enabled ? 'bg-warning/15 text-warning' : 'bg-slate-700/40 text-slate-500',
        )}
      >
        <Bell size={14} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm">
          <SymbolBadge symbol={alert.symbol} variant="inline" />
          <span className="text-slate-300">
            {alert.direction === 'above' ? '≥' : '≤'} {formatMoney(alert.threshold)}
          </span>
          {triggered && (
            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger">
              tetiklendi
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          Kurulduğu tarih: {formatDateTR(new Date(alert.createdAt).toISOString())}
          {alert.note && <> • {alert.note}</>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => alert.id && alertsRepo.toggle(alert.id, !alert.enabled)}
        disabled={triggered}
        className="rounded p-1.5 text-slate-300 hover:bg-bg-card disabled:opacity-50"
        title={alert.enabled ? 'Pasifleştir' : 'Aktifleştir'}
      >
        {alert.enabled ? <ToggleRight size={18} className="text-success" /> : <ToggleLeft size={18} />}
      </button>
      <button
        type="button"
        onClick={() => alert.id && alertsRepo.remove(alert.id)}
        className="rounded p-1.5 text-danger/70 hover:bg-bg-card hover:text-danger"
        aria-label="Sil"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function BookmarksList() {
  const bookmarks = useLiveQuery(() => bookmarksRepo.list(), []) ?? [];

  if (bookmarks.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark size={28} />}
        title="Kaydedilen haber yok"
        description="Haber kartlarındaki yer imi simgesine basarak haberleri buraya kaydedebilirsin."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {bookmarks.map((b) => (
        <div key={b.id} className="rounded-xl border border-border bg-bg-soft p-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              {b.snapshot?.symbols?.map((s) => (
                <SymbolBadge key={s} symbol={s} />
              ))}
              {b.snapshot?.source && <span>{b.snapshot.source}</span>}
            </div>
            <button
              className="rounded p-1 text-danger/70 hover:bg-bg-card hover:text-danger"
              onClick={() => bookmarksRepo.remove(b.newsId)}
              aria-label="Sil"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <h3 className="mt-1.5 text-sm font-medium text-slate-100">
            {b.snapshot?.title ?? '(başlık yok)'}
          </h3>
          <div className="mt-1 text-xs text-slate-500">
            {b.snapshot?.publishedAt && formatRelative(b.snapshot.publishedAt)} •
            kaydedildi {formatRelative(new Date(b.bookmarkedAt).toISOString())}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByDay(items: ActivityEntry[]): [string, ActivityEntry[]][] {
  const map = new Map<string, ActivityEntry[]>();
  for (const item of items) {
    const d = new Date(item.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const key = sameDay(d, today)
      ? 'Bugün'
      : sameDay(d, yesterday)
      ? 'Dün'
      : formatDateTR(d.toISOString());
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

// Suppress unused — db imported solely to ensure module side effects load
void db;
