// Build-time keys via Vite env. .env.local'a yaz.
//
// İki kategori:
//   - direct: VITE_* önekli, frontend doğrudan kullanır
//   - proxy: VITE_ öneki YOK, Vite dev proxy header/URL injekte eder (frontend bundle'a girmez)

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

/**
 * 13 Eki 2026 (P0 güvenlik): TwelveData/GNews/GoldAPI/Metals-API anahtarları
 * ARTIK bundle'a girmez. Çağrılar /api/proxy/<provider> üzerinden gider; anahtar
 * yalnızca Cloudflare Pages env'de (GNEWS_API_KEY, GOLDAPI_KEY, TWELVEDATA_KEY,
 * METALSAPI_KEY). Buradaki `true`, "proxy üzerinden denenebilir" demektir —
 * anahtar sunucuda yoksa proxy 503 döner ve istemci null'a düşer.
 */
const PROXY = true;

export const API_KEYS = {
  twelveData: PROXY,
  gnews: PROXY,
  goldApi: PROXY,
  metalsApi: PROXY,
  telegramChatId: (env.VITE_TELEGRAM_CHAT_ID ?? '').trim(),
  // Supabase opsiyonel — Hafta 2 için
  supabaseUrl: (env.VITE_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  // TEFAS Cloudflare Worker
  tefasWorkerUrl: (env.VITE_TEFAS_WORKER_URL ?? '').trim(),
  // TEFAS GitHub Actions feed
  tefasGithubUrl: (env.VITE_TEFAS_GITHUB_URL ?? '').trim(),
};

export type ServiceKey =
  | 'twelveData'
  | 'gnews'
  | 'goldApi'
  | 'metalsApi'
  | 'tcmb'
  | 'telegram'
  | 'supabase'
  | 'tefasWorker'
  | 'tefasGithub';

export interface ApiKeyStatus {
  service: ServiceKey;
  label: string;
  configured: boolean;
  envVar: string;
  signUpUrl: string;
  freeTier: string;
  provides: string;
  note?: string;
  optional?: boolean;
}

// TCMB & Telegram bağlı mı kontrolü: VITE_ önekisiz değişkenleri burada okuyamayız;
// Vite proxy'nin hazır olduğunu varsayıyoruz ve UI'da "test" butonu ile doğrularız.
// Bu yüzden "configured" alanı: Telegram için chat_id varlığı, TCMB için her zaman true.

export const API_STATUS: ApiKeyStatus[] = [
  {
    service: 'twelveData',
    label: 'Twelve Data',
    configured: true, // sunucu tarafı — gerçek durum /api/proxy/twelvedata yanıtında
    envVar: 'TWELVEDATA_KEY (Pages env, server-only)',
    signUpUrl: 'https://twelvedata.com/register',
    freeTier: '800/gün',
    provides: 'BIST hisse, forex (free tier kısıtlı)',
  },
  {
    service: 'gnews',
    label: 'GNews',
    configured: true,
    envVar: 'GNEWS_API_KEY (Pages env, server-only)',
    signUpUrl: 'https://gnews.io/register',
    freeTier: '100/gün',
    provides: 'Türkçe finans haberleri',
    note: 'Email doğrulaması gerekli.',
  },
  {
    service: 'goldApi',
    label: 'GoldAPI',
    configured: true,
    envVar: 'GOLDAPI_KEY (Pages env, server-only)',
    signUpUrl: 'https://www.goldapi.io/dashboard',
    freeTier: '100/ay',
    provides: 'Ons + Gram altın spot (USD)',
  },
  {
    service: 'metalsApi',
    label: 'Metals-API',
    configured: true,
    envVar: 'METALSAPI_KEY (Pages env, server-only)',
    signUpUrl: 'https://metals-api.com/',
    freeTier: '50/gün',
    provides: 'Ons altın/gümüş/platin spot (USD) — hafta sonu Cuma kapanış değeri',
  },
  {
    service: 'tcmb',
    label: 'TCMB EVDS',
    configured: true, // proxy'de kuruldu, gerçek durum runtime'da
    envVar: 'TCMB_API_KEY (server-only, dev proxy)',
    signUpUrl: 'https://evds2.tcmb.gov.tr',
    freeTier: 'Ücretsiz',
    provides: 'Politika faizi, TÜFE (seri kodları doğrulanmalı)',
    note: 'TCMB seri kodları zaman zaman değişir; boş yanıtta dashboardda kodu güncelleyin.',
  },
  {
    service: 'telegram',
    label: 'Telegram Bot',
    configured: !!API_KEYS.telegramChatId,
    envVar: 'TELEGRAM_BOT_TOKEN + VITE_TELEGRAM_CHAT_ID',
    signUpUrl: 'https://t.me/BotFather',
    freeTier: 'Ücretsiz',
    provides: 'Alarm tetiklendiğinde Telegram push',
  },
  {
    service: 'tefasGithub',
    label: 'TEFAS GitHub Feed',
    configured: !!API_KEYS.tefasGithubUrl,
    envVar: 'VITE_TEFAS_GITHUB_URL',
    signUpUrl: 'https://github.com/new',
    freeTier: 'Ücretsiz (GitHub Actions)',
    provides: 'Gerçek TEFAS fon NAV + performans (saatlik güncellenir)',
    note: 'Kurulum: SETUP_GITHUB_TEFAS.md (10 dk)',
  },
  {
    service: 'tefasWorker',
    label: 'TEFAS Worker (CF)',
    configured: !!API_KEYS.tefasWorkerUrl,
    envVar: 'VITE_TEFAS_WORKER_URL',
    signUpUrl: 'https://dash.cloudflare.com',
    freeTier: '10dk tarayıcı/gün',
    provides: 'Alternatif: anlık TEFAS verisi (Cloudflare Worker)',
    optional: true,
    note: 'GitHub Actions yetiyorsa buna gerek yok.',
  },
  {
    service: 'supabase',
    label: 'Supabase',
    configured: !!API_KEYS.supabaseUrl && !!API_KEYS.supabaseAnonKey,
    envVar: 'VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY',
    signUpUrl: 'https://supabase.com',
    freeTier: 'Free plan',
    provides: 'Cloud DB + Edge Functions (semantic arama)',
    optional: true,
    note: 'Şu an gerek yok. Hafta 2\'de cloud sync isteyince aktive edilebilir.',
  },
];
