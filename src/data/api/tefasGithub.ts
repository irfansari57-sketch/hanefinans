// TEFAS verisi — GitHub Actions tarafından üretilen JSON'dan okunur.
// URL .env.local'a VITE_TEFAS_GITHUB_URL olarak yazılır.
// Örnek: https://cdn.jsdelivr.net/gh/kullanici/repo@main/data/funds.json

import type { FundPerformance, FundCategory } from '../types';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const FEED_URL = (env.VITE_TEFAS_GITHUB_URL ?? '').trim();

export interface TefasFundData {
  code: string;
  name: string;
  category: string;
  /**
   * TEFAS uzerinden alinip alinamayacagi.
   * Backend `is_tefas_open()` heuristic'i ile hesaplanir; false = Serbest Fon vs.
   */
  tefasOpen?: boolean;
  nav: number;
  date: string;
  marketCap?: number;
  investorCount?: number;
  shareCount?: number;
  returns: {
    '1d'?: number | null;
    '1w': number | null;
    '1m': number | null;
    '3m': number | null;
    '6m': number | null;
    ytd: number | null;
    '1y': number | null;
  };
  history: Array<{ date: string; price: number }>;
}

export interface TefasFeed {
  updatedAt: string;
  count: number;
  funds: TefasFundData[];
  failed?: string[];
}

export const isTefasGithubConfigured = () => !!FEED_URL;
export const getTefasFeedUrl = () => FEED_URL;

export interface TefasFeedFetchResult {
  ok: boolean;
  feed?: TefasFeed;
  /** Hata tanılaması için detay — UI'da debug paneline gösterilir */
  error?: string;
  status?: number;
  url?: string;
  preview?: string;
}

let cache: { fetchedAt: number; data: TefasFeed } | null = null;
let lastError: TefasFeedFetchResult | null = null;
const CACHE_TTL_MS = 5 * 60_000;

// Takasbank otorite "TEFAS Acik Fonlar" cache - tefas-open-codes.json'dan yuklenir.
// Kod listede ise TEFAS acik, yoksa kapali. Backend cron'a bagimli degil.
let openCodesCache: Set<string> | null = null;
let openCodesFetchPromise: Promise<void> | null = null;

async function ensureOpenCodes(): Promise<void> {
  if (openCodesCache !== null) return;
  if (openCodesFetchPromise) return openCodesFetchPromise;
  openCodesFetchPromise = (async () => {
    try {
      // FEED_URL pattern'ine gore tefas-open-codes.json URL'i turet.
      const url = FEED_URL.replace(/tefas\.json(\?.*)?$/, 'tefas-open-codes.json$1');
      if (!url || url === FEED_URL) {
        openCodesCache = new Set();
        return;
      }
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) {
        openCodesCache = new Set();
        return;
      }
      const data = await r.json() as { codes?: string[] };
      const codes = Array.isArray(data.codes) ? data.codes : [];
      openCodesCache = new Set(codes.map((c) => String(c).trim().toUpperCase()));
    } catch {
      openCodesCache = new Set();
    }
  })();
  return openCodesFetchPromise;
}

// LastGood snapshot: hafta sonu / network hatasında son başarılı feed'i tutar.
// TEFAS hafta sonu NAV yayınlamaz; Cuma 23:59 (TR) feed'i Pazartesi açılışa kadar
// "kilit" gibi davranır. Bu sayede Cumartesi/Pazar fonlarda "Gün %", "1 Hafta %"
// vs. boş veya 0 görünmez — son işlem gününün gerçek kapanış değerleri görünür.
const LAST_GOOD_LS_KEY = 'fa.tefas.lastGood.v1';
// TTL 7 gün: en uzun durumda 1 Cuma → 1 Pazartesi açılışa kadar (~80 sa) yeter.
// Bunun üstünde feed gerçekten gelmiyor demektir; kullanıcıya "—" göstermek daha doğru.
const LAST_GOOD_TTL_MS = 7 * 24 * 60 * 60_000;

interface LastGoodSnapshot {
  fetchedAt: number;
  data: TefasFeed;
}

function readLastGood(): TefasFeed | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_GOOD_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastGoodSnapshot;
    if (!parsed?.data?.funds || !Array.isArray(parsed.data.funds)) return null;
    if (Date.now() - parsed.fetchedAt > LAST_GOOD_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeLastGood(data: TefasFeed) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!data?.funds || data.funds.length === 0) return;
    const payload: LastGoodSnapshot = { fetchedAt: Date.now(), data };
    localStorage.setItem(LAST_GOOD_LS_KEY, JSON.stringify(payload));
  } catch {
    /* quota — yoksay */
  }
}

export function getLastFeedError(): TefasFeedFetchResult | null {
  return lastError;
}

export async function fetchTefasFeed(): Promise<TefasFeed | null> {
  const r = await fetchTefasFeedDetailed();
  return r.ok ? r.feed ?? null : null;
}

/**
 * lastGood fallback yardımcısı: hata durumunda son başarılı snapshot varsa onu döndür.
 * UI'da "Veri yok / 0.00%" yerine son işlem gününün gerçek değerlerini gösterir.
 */
function fallbackToLastGood(error: TefasFeedFetchResult): TefasFeedFetchResult {
  const last = readLastGood();
  if (last) {
    // In-memory cache'i de doldur ki bir sonraki çağrı 5dk içinde tekrar fetch denemesin
    cache = { fetchedAt: Date.now(), data: last };
    // lastError'u sakla ama dış dünyaya "ok" döndür — UI veri görüyor
    lastError = error;
    return { ok: true, feed: last, url: FEED_URL };
  }
  lastError = error;
  return error;
}

export async function fetchTefasFeedDetailed(): Promise<TefasFeedFetchResult> {
  if (!FEED_URL) {
    return { ok: false, error: 'VITE_TEFAS_GITHUB_URL ayarlanmamış' };
  }
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, feed: cache.data, url: FEED_URL };
  }
  try {
    const r = await fetch(FEED_URL, { cache: 'no-store' });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const result: TefasFeedFetchResult = {
        ok: false,
        status: r.status,
        url: FEED_URL,
        error: `HTTP ${r.status} ${r.statusText}`,
        preview: text.slice(0, 200),
      };
      return fallbackToLastGood(result);
    }
    const text = await r.text();
    let data: TefasFeed;
    try {
      data = JSON.parse(text) as TefasFeed;
    } catch (parseErr) {
      const result: TefasFeedFetchResult = {
        ok: false,
        status: r.status,
        url: FEED_URL,
        error: `JSON parse hatası: ${(parseErr as Error).message}`,
        preview: text.slice(0, 200),
      };
      return fallbackToLastGood(result);
    }
    if (!data.funds || !Array.isArray(data.funds) || data.funds.length === 0) {
      const result: TefasFeedFetchResult = {
        ok: false,
        status: r.status,
        url: FEED_URL,
        error: `Feed çağrısı başarılı ama 'funds' alanı boş/yok (count: ${data.count ?? 0})`,
        preview: text.slice(0, 200),
      };
      return fallbackToLastGood(result);
    }
    // Başarılı: in-memory + localStorage'a yaz
    cache = { fetchedAt: Date.now(), data };
    writeLastGood(data);
    lastError = null;
    return { ok: true, feed: data, url: FEED_URL };
  } catch (err) {
    const result: TefasFeedFetchResult = {
      ok: false,
      url: FEED_URL,
      error: `Ağ hatası: ${(err as Error).message}`,
    };
    return fallbackToLastGood(result);
  }
}

export async function fetchTefasFundByCode(code: string): Promise<TefasFundData | null> {
  const feed = await fetchTefasFeed();
  if (!feed) return null;
  return feed.funds.find((f) => f.code === code.toUpperCase()) ?? null;
}

/**
 * TEFAS scraper'ı bazı fonları yanlış kategorize ediyor — adında "ALTINCI",
 * "ONALTINCI", "YİRMİALTINCI" (sıra sayıları) geçen Serbest fonları
 * "Altın" kategorisine alıyor. Benzer şekilde "Gümüş" için de "GÜMÜŞ"
 * tam kelime olarak olmalı. Bu fonksiyon kategoriyi adın doğrulanmasıyla düzeltir.
 */
function normalizeFundCategory(rawCategory: string, name: string): FundCategory {
  const cat = (rawCategory || '').trim();
  const nameUpper = (name || '').toUpperCase();

  if (cat === 'Altın') {
    // "ALTIN" kelime sınırlı geçiyor mu? ALTINCI / ONALTINCI / YİRMİALTINCI
    // (sıra sayıları) "ALTIN" prefix'i içerdiği için \b ile filtrele.
    // "ALTIN FONU", "PORTFÖY ALTIN", "ALTIN KATILIM" hepsi \bALTIN\b ile eşleşir.
    const hasRealGold = /\bALTIN\b/.test(nameUpper);
    if (!hasRealGold) {
      // Gerçek altın değil — adındaki diğer ipuçlarına göre yeniden kategorize et
      if (/KATILIM/.test(nameUpper)) return 'Katılım';
      if (/HİSSE SENEDİ/.test(nameUpper)) return 'Hisse Senedi';
      return 'Serbest';
    }
    return 'Altın';
  }
  if (cat === 'Gümüş') {
    if (!/\bGÜMÜŞ\b/.test(nameUpper)) {
      return 'Serbest';
    }
    return 'Gümüş';
  }
  return (cat || 'Serbest') as FundCategory;
}

/**
 * Backend feed'de `tefasOpen` yoksa (eski cron'lar) client-side ayni heuristic.
 * Backend `is_tefas_open()` ile bire bir ayni kural seti — guncel kosul:
 * SPK 2026 Ocak nitelikli yatirimci 10M TL+ net varlik kosulu.
 */
export function computeTefasOpenClient(category: string, name: string): boolean {
  // MINIMAL heuristic - sadece backend `tefasOpen` undefined ise fallback.
  // KALDIRILAN kalıplar: SERBEST, SEPET HESAP, PAYLASIM HESAP, OZEL FON,
  // YABANCI MENKUL, NITELIKLI YATIRIMCI, GARANTILI, KORUMA AMACLI.
  // Takasbank otorite listesinde bu kelimeleri iceren onlarca gercek TEFAS
  // acik fon var (TLY, CAH, AUV, BS1, P1A, DA1 vs.).
  // KALAN kalıplar (gercekten TEFAS sistemi disi):
  //   - EMEKLILIK (BES) - BEFAS'tan alinir
  //   - GIRISIM SERMAYESI YF + GAYRIMENKUL YF - nitelikli yatirimci
  const n = (name || '').toLocaleUpperCase('tr-TR');
  const c = (category || '').toLocaleUpperCase('tr-TR');

  if (n.includes('EMEKLİLİK') || n.includes('EMEKLILIK')) return false;
  if (c.includes('EMEKLİLİK') || c.includes('EMEKLILIK')) return false;
  if (n.includes('GİRİŞİM SERMAYESİ') || n.includes('GIRISIM SERMAYESI')) return false;
  if (n.includes('GAYRİMENKUL YATIRIM') || n.includes('GAYRIMENKUL YATIRIM')) return false;
  if (c.includes('GAYRİMENKUL') || c.includes('GAYRIMENKUL')) return false;

  return true;
}

function computeDayChangeFromHistory(history: Array<{ date: string; price: number }>): number | null {
  if (!Array.isArray(history) || history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const last = sorted[n - 1];
  const prev = sorted[n - 2];
  if (!last || !prev || !(prev.price > 0)) return null;
  return ((last.price - prev.price) / prev.price) * 100;
}

/**
 * History array'inden N takvim gunu onceki fiyatla yuzde fark.
 * Hafta = 7 gun, Ay = 30, vb. Yakin gunu bulamazsa null doner.
 */
function computeChangeFromHistoryNDays(
  history: Array<{ date: string; price: number }>,
  daysAgo: number,
): number | null {
  if (!Array.isArray(history) || history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last || !(last.price > 0)) return null;
  // Target date = last.date - daysAgo gun
  const lastDate = new Date(last.date);
  const targetMs = lastDate.getTime() - daysAgo * 24 * 60 * 60 * 1000;
  // Sorted icinde en yakin (target'a >= olan) ilk eleman
  let best: typeof sorted[number] | null = null;
  for (const h of sorted) {
    if (new Date(h.date).getTime() <= targetMs) best = h;
    else break;
  }
  if (!best || !(best.price > 0)) return null;
  return ((last.price - best.price) / best.price) * 100;
}

/** Feed verisini FundPerformance şemasına maple. 1d/1w/1m eksikse history'den hesaplanir. */
export function mapTefasToPerformance(funds: TefasFundData[]): FundPerformance[] {
  return funds.map((f) => {
    const hist = f.history ?? [];

    // 1d — feed'de yoksa son 2 history noktasi
    let day = f.returns['1d'];
    if (day == null || day === 0) {
      const fromHistory = computeDayChangeFromHistory(hist);
      if (fromHistory != null) day = fromHistory;
    }

    // 1w (haftalik) — 7 takvim gunu
    let week = f.returns['1w'];
    if (week == null || week === 0) {
      const fromHistory = computeChangeFromHistoryNDays(hist, 7);
      if (fromHistory != null) week = fromHistory;
    }

    // 1m (aylik) — 30 takvim gunu
    let month = f.returns['1m'];
    if (month == null || month === 0) {
      const fromHistory = computeChangeFromHistoryNDays(hist, 30);
      if (fromHistory != null) month = fromHistory;
    }

    // Feed'de bazi fonlar icin 1d/1w `null` ve `history: []` doner — scraper bu
    // alanlari yazmiyor. UI'da +0.00% yerine "—" gosterelim ki kullanici "veri yok"
    // ile "gercek 0" karistirma. Bunun icin NaN doneriz (UI Number.isFinite check yapiyor).

    // tefasOpen override mantigi (client wins for closed):
    //   - Client heuristic FALSE derse -> daima FALSE (cunku frontend kodu backend
    //     cron'undan daha guncel guncellenebilir; yeni eklenen kosullar (SEPET HESAP,
    //     EMEKLILIK vs.) backend feed'inde henuz olmayabilir)
    //   - Client TRUE derse -> backend ne derse desin onu kullan
    // tefasOpen kararı - 3 katmanlı (en kesin -> en zayif):
    //   1. Cache JSON (Takasbank otorite 1012 fon): kod listede ise true, yoksa false
    //   2. Backend feed tefasOpen (cron yazdiysa)
    //   3. Client heuristic (BES/Girisim/Gayrimenkul)
    const codeUp = (f.code || '').trim().toUpperCase();
    let finalOpen: boolean;
    if (openCodesCache && openCodesCache.size > 0) {
      finalOpen = openCodesCache.has(codeUp);
    } else if (f.tefasOpen !== undefined) {
      finalOpen = f.tefasOpen;
    } else {
      finalOpen = computeTefasOpenClient(f.category, f.name);
    }

    return {
      code: f.code,
      name: f.name,
      category: normalizeFundCategory(f.category, f.name),
      tefas: true,
      tefasOpen: finalOpen,
      nav: typeof f.nav === 'number' && f.nav > 0 ? f.nav : undefined,
      navDate: f.date || undefined,
      day: day == null ? NaN : day,
      week: week == null ? NaN : week,
      month: month == null ? NaN : month,
      threeMonth: f.returns['3m'] ?? NaN,
      sixMonth: f.returns['6m'] ?? NaN,
      ytd: f.returns.ytd ?? NaN,
      year: f.returns['1y'] ?? NaN,
    };
  });
}

/** Tüm fonları FundPerformance dizisi olarak döner. Feed yapılandırılmadıysa null. */
export async function loadFundsAsPerformance(): Promise<{
  funds: FundPerformance[];
  updatedAt: string;
} | null> {
  // Cache JSON ile feed'i paralel yukle (cache otorite TEFAS Acik karari icin)
  const [feed] = await Promise.all([fetchTefasFeed(), ensureOpenCodes()]);
  if (!feed) return null;
  return { funds: mapTefasToPerformance(feed.funds), updatedAt: feed.updatedAt };
}

/** Detaylı sonuç + perf map'i — FundsPage debug panel için. */
export async function loadFundsAsPerformanceDetailed(): Promise<TefasFeedFetchResult & {
  funds?: FundPerformance[];
}> {
  const [result] = await Promise.all([fetchTefasFeedDetailed(), ensureOpenCodes()]);
  if (!result.feed) return result;
  return { ...result, funds: mapTefasToPerformance(result.feed.funds) };
}
