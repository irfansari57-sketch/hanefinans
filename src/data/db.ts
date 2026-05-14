import Dexie, { Table } from 'dexie';

export type ActivityType =
  | 'watchlist-add'
  | 'watchlist-remove'
  | 'news-viewed'
  | 'news-bookmarked'
  | 'news-unbookmarked'
  | 'note-added'
  | 'note-edited'
  | 'note-deleted'
  | 'alert-created'
  | 'alert-toggled'
  | 'alert-deleted'
  | 'alert-triggered'
  | 'search'
  | 'page-view'
  | 'data-refresh';

export interface ActivityEntry {
  id?: number;
  timestamp: number; // unix ms
  type: ActivityType;
  symbol?: string;
  newsId?: string;
  detail?: string; // arama sorgusu, sayfa yolu, vb.
}

export interface Note {
  id?: number;
  createdAt: number;
  updatedAt: number;
  symbol?: string;
  newsId?: string;
  body: string;
  pinned: 0 | 1;
}

export interface PriceAlert {
  id?: number;
  createdAt: number;
  symbol: string;
  direction: 'above' | 'below';
  threshold: number;
  enabled: 0 | 1;
  triggeredAt?: number | null;
  note?: string;
}

export interface NewsBookmark {
  id?: number;
  newsId: string;
  bookmarkedAt: number;
  snapshot?: {
    title: string;
    source: string;
    symbols: string[];
    publishedAt: string;
  };
}

export interface FundEntry {
  id?: number;
  code: string;       // ör. 'TLY'
  name?: string;      // ör. 'Türkiye Garanti Yatırım'
  category?: string;  // ör. 'Hisse Senedi Yoğun Fon'
  addedAt: number;
  archived: 0 | 1;
}

export type UserTier = 'free' | 'pro' | 'elite';

export interface UserAccount {
  id?: number;
  email: string;        // unique
  name?: string;
  /**
   * MOCK auth: passwordHash burada sadece basit string hash'i (production değil).
   * Gerçek auth için Supabase Auth / Firebase'e geçilmelidir.
   */
  passwordHash: string;
  tier: UserTier;
  createdAt: number;
  lastLoginAt?: number;
  avatarColor?: string;  // kişisel renk
  /** Pro/Elite üyeliğin bittiği zaman (ms). undefined = sınırsız (free) */
  tierExpiresAt?: number;
}

class FinansAsistanDB extends Dexie {
  activity!: Table<ActivityEntry, number>;
  notes!: Table<Note, number>;
  alerts!: Table<PriceAlert, number>;
  bookmarks!: Table<NewsBookmark, number>;
  funds!: Table<FundEntry, number>;
  users!: Table<UserAccount, number>;

  constructor() {
    super('finansasistan');
    this.version(1).stores({
      activity: '++id, timestamp, type, symbol, newsId',
      notes: '++id, createdAt, updatedAt, symbol, newsId, pinned',
      alerts: '++id, createdAt, symbol, enabled, triggeredAt',
      bookmarks: '++id, &newsId, bookmarkedAt',
    });
    this.version(2).stores({
      activity: '++id, timestamp, type, symbol, newsId',
      notes: '++id, createdAt, updatedAt, symbol, newsId, pinned',
      alerts: '++id, createdAt, symbol, enabled, triggeredAt',
      bookmarks: '++id, &newsId, bookmarkedAt',
      funds: '++id, &code, addedAt, archived',
    });
    this.version(3).stores({
      activity: '++id, timestamp, type, symbol, newsId',
      notes: '++id, createdAt, updatedAt, symbol, newsId, pinned',
      alerts: '++id, createdAt, symbol, enabled, triggeredAt',
      bookmarks: '++id, &newsId, bookmarkedAt',
      funds: '++id, &code, addedAt, archived',
      users: '++id, &email, tier, createdAt',
    });
  }
}

export const db = new FinansAsistanDB();

export async function initDb() {
  await db.open();
}
