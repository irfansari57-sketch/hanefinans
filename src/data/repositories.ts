import { db } from './db';
import type { ActivityEntry, ActivityType, Note, PriceAlert, NewsBookmark, FundEntry } from './db';

// ---------- Activity log ----------
export const activityRepo = {
  async log(entry: Omit<ActivityEntry, 'id' | 'timestamp'> & { timestamp?: number }) {
    return db.activity.add({ ...entry, timestamp: entry.timestamp ?? Date.now() });
  },
  list(opts: { limit?: number; type?: ActivityType; symbol?: string } = {}) {
    let coll = db.activity.orderBy('timestamp').reverse();
    return coll.toArray().then((all) => {
      const filtered = all.filter(
        (a) => (!opts.type || a.type === opts.type) && (!opts.symbol || a.symbol === opts.symbol),
      );
      return opts.limit ? filtered.slice(0, opts.limit) : filtered;
    });
  },
  clear() {
    return db.activity.clear();
  },
};

// ---------- Notes ----------
export const notesRepo = {
  list: () => db.notes.orderBy('updatedAt').reverse().toArray(),
  bySymbol: (symbol: string) =>
    db.notes.where('symbol').equals(symbol).reverse().sortBy('updatedAt'),
  byNews: (newsId: string) =>
    db.notes.where('newsId').equals(newsId).reverse().sortBy('updatedAt'),
  async add(input: { body: string; symbol?: string; newsId?: string }) {
    const now = Date.now();
    const id = await db.notes.add({
      body: input.body.trim(),
      symbol: input.symbol,
      newsId: input.newsId,
      pinned: 0,
      createdAt: now,
      updatedAt: now,
    });
    await activityRepo.log({
      type: 'note-added',
      symbol: input.symbol,
      newsId: input.newsId,
      detail: input.body.slice(0, 80),
    });
    return id;
  },
  async update(id: number, body: string) {
    await db.notes.update(id, { body: body.trim(), updatedAt: Date.now() });
    await activityRepo.log({ type: 'note-edited', detail: body.slice(0, 80) });
  },
  async remove(id: number) {
    await db.notes.delete(id);
    await activityRepo.log({ type: 'note-deleted' });
  },
  togglePin(id: number, pinned: boolean) {
    return db.notes.update(id, { pinned: pinned ? 1 : 0, updatedAt: Date.now() });
  },
};

// ---------- Alerts ----------
export const alertsRepo = {
  list: () => db.alerts.orderBy('createdAt').reverse().toArray(),
  bySymbol: (symbol: string) =>
    db.alerts.where('symbol').equals(symbol).reverse().sortBy('createdAt'),
  async add(input: { symbol: string; direction: 'above' | 'below'; threshold: number; note?: string; assetType?: 'stock' | 'fund' }) {
    const id = await db.alerts.add({
      symbol: input.symbol.toUpperCase(),
      assetType: input.assetType ?? 'stock',
      direction: input.direction,
      threshold: input.threshold,
      note: input.note,
      enabled: 1,
      createdAt: Date.now(),
      triggeredAt: null,
    });
    await activityRepo.log({
      type: 'alert-created',
      symbol: input.symbol.toUpperCase(),
      detail: `${input.assetType === 'fund' ? 'Fon ' : ''}${input.direction === 'above' ? '≥' : '≤'} ${input.threshold}`,
    });
    return id;
  },
  async toggle(id: number, enabled: boolean) {
    await db.alerts.update(id, { enabled: enabled ? 1 : 0 });
    await activityRepo.log({ type: 'alert-toggled', detail: enabled ? 'aktif' : 'pasif' });
  },
  async remove(id: number) {
    const alert = await db.alerts.get(id);
    await db.alerts.delete(id);
    await activityRepo.log({ type: 'alert-deleted', symbol: alert?.symbol });
  },
  markTriggered(id: number) {
    return db.alerts.update(id, { triggeredAt: Date.now(), enabled: 0 });
  },
};

// ---------- Funds ----------
export const fundsRepo = {
  list: () => db.funds.orderBy('addedAt').reverse().toArray(),
  active: async () => (await db.funds.toArray()).filter((f) => f.archived === 0),
  async add(input: { code: string; name?: string; category?: string }) {
    const code = input.code.trim().toUpperCase();
    if (!code) return null;
    const existing = await db.funds.where('code').equals(code).first();
    if (existing) return existing.id;
    return db.funds.add({
      code,
      name: input.name?.trim(),
      category: input.category?.trim(),
      addedAt: Date.now(),
      archived: 0,
    });
  },
  async update(id: number, patch: Partial<FundEntry>) {
    return db.funds.update(id, patch);
  },
  async remove(id: number) {
    return db.funds.delete(id);
  },
  async has(code: string) {
    return !!(await db.funds.where('code').equals(code.trim().toUpperCase()).first());
  },
};

// ---------- Bookmarks ----------
export const bookmarksRepo = {
  list: () => db.bookmarks.orderBy('bookmarkedAt').reverse().toArray(),
  async isBookmarked(newsId: string) {
    return !!(await db.bookmarks.where('newsId').equals(newsId).first());
  },
  async toggle(input: { newsId: string; snapshot?: NewsBookmark['snapshot'] }) {
    const existing = await db.bookmarks.where('newsId').equals(input.newsId).first();
    if (existing?.id) {
      await db.bookmarks.delete(existing.id);
      await activityRepo.log({ type: 'news-unbookmarked', newsId: input.newsId });
      return false;
    }
    await db.bookmarks.add({
      newsId: input.newsId,
      snapshot: input.snapshot,
      bookmarkedAt: Date.now(),
    });
    await activityRepo.log({
      type: 'news-bookmarked',
      newsId: input.newsId,
      detail: input.snapshot?.title?.slice(0, 80),
    });
    return true;
  },
  async remove(newsId: string) {
    const existing = await db.bookmarks.where('newsId').equals(newsId).first();
    if (existing?.id) await db.bookmarks.delete(existing.id);
  },
};
