/**
 * D1-backed sliding-window rate limiter.
 *
 * Cloudflare Pages Functions için ortak helper. Her endpoint için ayrı bucket
 * tanımlanır (auth / ai / default). Counter D1'de tutulur — KV gerekmez.
 *
 * Strateji: fixed window per minute (veya bucket için tanımlanan windowSec).
 * Anahtar: `{bucket}:{identifier}:{windowEnd}`. Aynı pencerede istek geldikçe
 * count++ ile artar; limit aşılırsa allowed=false döner.
 *
 * Schema (functions/auth-schema.sql içindedir):
 *   CREATE TABLE rate_limits (
 *     key TEXT PRIMARY KEY,
 *     count INTEGER NOT NULL,
 *     expires_at INTEGER NOT NULL  -- unix seconds
 *   );
 */

export interface RateLimitResult {
  /** İstek limiti aşmadıysa true. */
  allowed: boolean;
  /** Bu pencere içindeki şu anki istek sayısı (en güncel artış sonrası). */
  count: number;
  /** Limit aşıldıysa, kaç saniye sonra denenebilir (Retry-After header'ı için). */
  retryAfter: number;
  /** Bu pencerenin biteceği unix saniye. */
  resetAt: number;
}

/**
 * Rate limit kontrolü + sayaç artırımı. Atomic: tek INSERT … ON CONFLICT
 * statement'ı ile yapar, race condition yok.
 *
 * @param db D1 binding
 * @param bucket   Endpoint sınıfı — log/key kolaylığı için, ör: "auth", "ai"
 * @param identifier IP veya user id — bucket içinde unique tutulur
 * @param limit  windowSec içinde izin verilen max istek
 * @param windowSec  Pencere genişliği (saniye)
 */
export async function rateLimitCheck(
  db: D1Database,
  bucket: string,
  identifier: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  // Pencereyi sabit boundary'ye hizala — örn. dakikalık (windowSec=60) ise
  // her dakika başında reset olur. Tüm istekler aynı bucket'a düşer.
  const windowEnd = Math.floor(nowSec / windowSec) * windowSec + windowSec;
  const key = `${bucket}:${identifier}:${windowEnd}`;

  try {
    const result = await db
      .prepare(
        `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(key, windowEnd)
      .first<{ count: number }>();

    const count = result?.count ?? 1;
    const allowed = count <= limit;
    const retryAfter = allowed ? 0 : Math.max(1, windowEnd - nowSec);

    // Opportunistic cleanup — %1 ihtimalle eski (expire olmuş) satırları sil.
    // Cron task olmadığı için bu yetiyor; tablo şişmez.
    if (Math.random() < 0.01) {
      await db
        .prepare('DELETE FROM rate_limits WHERE expires_at < ?')
        .bind(nowSec - 60)
        .run()
        .catch(() => null);
    }

    return { allowed, count, retryAfter, resetAt: windowEnd };
  } catch (e) {
    // rate_limits tablosu yoksa (migration uygulanmadıysa) veya D1 hata verirse
    // request'i geçir — fail-open. Üretimde log'lan, dev'de console'a yaz.
    if (typeof console !== 'undefined') {
      console.error('[rate-limit] D1 error, failing open:', e);
    }
    return { allowed: true, count: 0, retryAfter: 0, resetAt: nowSec + windowSec };
  }
}

/**
 * Tier-aware quota check + increment. rateLimitCheck ile aynı table'ı kullanır
 * ama farklı bucket prefix'i ile — IP-level rate limit'ten ayrı sayaç tutar.
 *
 * Tipik kullanım: /api/ai/screener gibi premium-tier'a göre farklı limit isteyen
 * endpoint'ler için. Anonymous ise IP, login ise userId identifier olur.
 *
 * @param db        D1 binding
 * @param feature   Özellik adı, ör: "screener", "portfolio"
 * @param tier      "anon" | "free" | "pro" | "elite"
 * @param identifier  IP veya user id — tier içinde unique
 * @param limit     windowSec içinde izin verilen max istek (tier'a göre)
 * @param windowSec Pencere genişliği (saniye). Genelde günlük: 86400.
 */
export async function quotaCheck(
  db: D1Database,
  feature: string,
  tier: string,
  identifier: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  return rateLimitCheck(db, `q:${feature}:${tier}`, identifier, limit, windowSec);
}

/**
 * Bir Request'ten istemci kimliğini (IP) çıkar. Cloudflare CDN'i
 * `CF-Connecting-IP` header'ını set eder; fallback olarak XFF kullan.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Path'ten endpoint sınıfını (bucket) ve limit'i çıkar.
 *
 * - auth   (login/signup/send-code/verify-code/delete-account) — 10 req/dk
 * - ai     (/api/ai/* + /api/agents/*) — 60 req/saat (pahalı AI çağrıları için IP cap'i)
 *          NOT: /api/ai/screener tier-aware quota'ya tabi (handler içinde) — burada
 *          sadece dakika başına IP burst protection için default'a düşürüyoruz.
 * - session (auth/me, portfolio, watchlist, alerts, streak, predictions, telemetry) — 240 req/dk
 * - default — 60 req/dk (geri kalan)
 *
 * Sayıları artırmak/azaltmak için sadece bu tabloyu değiştir.
 */
export function classifyRoute(path: string): { bucket: string; limit: number; windowSec: number } {
  if (path.startsWith('/api/auth/')) {
    // Strict bucket'a düşen alt-path'ler — brute-force risk taşıyanlar
    if (/\/(login|signup|send-code|verify-code|delete-account)$/.test(path)) {
      return { bucket: 'auth', limit: 10, windowSec: 60 };
    }
    // /api/auth/me her sayfa yüklenmesinde + portföy senkronunda çağrılır.
    // 15 Eki 2026: default (60/dk) telemetry/portfolio/watchlist ile paylaşılınca
    // oturum kontrolü 429 yiyip kullanıcıyı "çıkış yapmış" gösteriyordu → session kovası.
    if (/\/(me|logout)$/.test(path) || path.startsWith('/api/auth/oauth/')) {
      return { bucket: 'session', limit: 240, windowSec: 60 };
    }
    return { bucket: 'default', limit: 60, windowSec: 60 };
  }
  // Oturumlu kullanıcı verisi — sayfa başına birden çok okuma/yazma (portföy senkronu,
  // takip listesi, alarmlar, seri, telemetri). Hepsi cookie-auth'lu; brute-force yüzeyi yok.
  if (
    path.startsWith('/api/portfolio') ||
    path.startsWith('/api/watchlist') ||
    path.startsWith('/api/alerts') ||
    path.startsWith('/api/streak') ||
    path.startsWith('/api/predictions') ||
    path.startsWith('/api/telemetry') ||
    path.startsWith('/api/push') ||
    path.startsWith('/api/config') ||
    path.startsWith('/api/health')
  ) {
    return { bucket: 'session', limit: 240, windowSec: 60 };
  }
  // /api/ai/screener — tier-aware quota handler içinde uygulanır.
  // Burada sadece IP burst protection: dakikada 20 (yanlışlıkla butona spam atan kullanıcı).
  if (path === '/api/ai/screener' || path === '/api/ai/screener/') {
    return { bucket: 'screener-burst', limit: 20, windowSec: 60 };
  }
  // /api/agents/* — Panel açılışında 4 agent (sentiment/news/macro/indicator) paralel
  // çağrılır. Aynı içerik tüm kullanıcılara servis edilir → cache'lenir.
  // Burst protection olarak dakikada 20, saatte 240 IP-level limit.
  if (path.startsWith('/api/agents/')) {
    return { bucket: 'agents', limit: 60, windowSec: 60 };
  }
  if (path.startsWith('/api/ai/')) {
    return { bucket: 'ai', limit: 60, windowSec: 60 * 60 };
  }
  // Public data proxy'leri — Yahoo, TCMB, news, twelvedata, goldapi, vb.
  // Tek sayfa açılışında 100+ paralel istek olabiliyor (örn. /stocks 270 sembol).
  // Bunlar read-only ve upstream rate limit kendi tarafında zaten var.
  // Yüksek limit ver (600/dk) — yoksa default 60/dk anında doluyor ve
  // aynı IP'den admin panel + auth/me gibi gerçek auth istekleri 429 yiyor.
  // 13 Eki 2026: panel/stocks/funds/befas/byf/isyatirim/proxy/spot-metals/tr-* de
  // read-only + edge cache'li — default 60/dk'ya düşüyordu; panel + hisse detay
  // gezintisi 429 üretip hisse sayfasını skeleton'da kilitliyordu.
  if (
    path.startsWith('/api/yahoo/') ||
    path.startsWith('/api/tcmb/') ||
    path.startsWith('/api/news') ||
    path.startsWith('/api/twelvedata/') ||
    path.startsWith('/api/goldapi/') ||
    path.startsWith('/api/gnews/') ||
    path.startsWith('/api/proxy/') ||
    path.startsWith('/api/tefas') ||
    path.startsWith('/api/panel/') ||
    path.startsWith('/api/stocks/') ||
    path.startsWith('/api/bars/') ||
    path.startsWith('/api/bist/') ||
    path.startsWith('/api/signals/') ||
    path.startsWith('/api/funds/') ||
    path.startsWith('/api/befas/') ||
    path.startsWith('/api/byf/') ||
    path.startsWith('/api/isyatirim/') ||
    path.startsWith('/api/spot-metals') ||
    path.startsWith('/api/tr-cds') ||
    path.startsWith('/api/tr-10y') ||
    path.startsWith('/api/csp-report')
  ) {
    return { bucket: 'public', limit: 600, windowSec: 60 };
  }
  return { bucket: 'default', limit: 60, windowSec: 60 };
}
