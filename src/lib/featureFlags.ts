/**
 * Feature flag'leri — runtime switch için tek satırlık merkez.
 *
 * Yeni feature'ı aktive etmek için: ilgili flag'i true yap + commit.
 * Bazı feature'lar harici servis (Resend, Iyzico vs.) gerektirir;
 * altyapı hazır olmadan açılırsa kullanıcı hatası gösterir.
 */

export const FEATURES = {
  /**
   * Email doğrulama akışı (signup sonrası 6-haneli kod, EmailVerifyBanner).
   *
   * KAPALI iken:
   * - Signup'tan sonra direkt panele yönlendirir, verify step atlanır
   * - Üst sticky banner gösterilmez
   * - Admin paneli "Doğrulanmış/Değil" badge'lerini gösterir (gelecekte aktif)
   *
   * AÇMAK İÇİN:
   * 1. Resend.com'a kayıt ol + API key al
   * 2. Cloudflare Pages Settings → Environment variables:
   *    - RESEND_API_KEY = re_xxx...
   *    - AUTH_TOKEN_SECRET = 32+ karakter random (openssl rand -hex 32)
   *    - RESEND_FROM_EMAIL = noreply@investliq.com (Resend domain verify gerekir)
   * 3. Bu flag'i true yap + redeploy
   */
  emailVerification: false,

  /**
   * Akilli Sorgu (/sorgu) sayfasi — Anthropic API ile dogal dil sorgu.
   *
   * KAPALI iken:
   * - Sol menude "Akilli Sorgu" link gorunmez
   * - Route direkt /panel'e redirect eder
   * - Backend endpoint (/api/ai/screener) canlida kalir (test icin)
   *
   * ACMAK ICIN:
   * 1. Anthropic Console'a git: https://console.anthropic.com/settings/billing
   * 2. Kredi ekle (min $5, model basina ~$0.0003)
   * 3. Bu flag'i true yap + redeploy
   */
  smartQuery: false,

  /**
   * Google + Apple ile sosyal giris (AuthPage butonlari).
   *
   * KAPALI iken:
   * - AuthPage'de "veya" ayraci ve Google/Apple butonlari gorunmez
   * - Backend OAuth endpoint'leri (/api/auth/oauth/*) canlida kalir
   *
   * ACMAK ICIN:
   * 1. Google: console.cloud.google.com'da OAuth 2.0 Client ID olustur
   * 2. Apple: developer.apple.com Sign In with Apple + .p8 key (opsiyonel)
   * 3. CF Pages env vars: GOOGLE_OAUTH_CLIENT_ID + SECRET (+ Apple set)
   * 4. Bu flag'i true yap + redeploy
   * NEXT_SESSION.md'de tam kurulum adimlari var.
   */
  oauthSocialLogin: false,

  /**
   * Paywall (PRO/Elite tier gating).
   *
   * KAPALI iken:
   * - isPro() ve isElite() giris yapmis TUM kullanicilar icin true doner
   * - PremiumCard/AgentCards/MultiTimeframeCard/Heat Map/ABD/Global vb.
   *   paywall ekranlari gosterilmez, tum ozellikler acilir
   * - Kullanici tier'i DB'de degismez, sadece runtime override
   *
   * ACMAK ICIN:
   * 1. Odeme altyapisi hazir (Iyzico/Stripe entegrasyonu tamam)
   * 2. Bu flag'i true yap + redeploy
   * 3. Kullanicilar tier'larina gore erisim goreecek
   */
  paywallEnabled: false,

  /**
   * AI destekli sorgulama (Akilli Sorgu + Deep-Dive + Portfolio Health AI comment
   * + Portfolio Analiz) — normal kullanicilar icin.
   *
   * KAPALI iken:
   * - Sadece admin (server-side isAdmin === true) AI endpoint'leri kullanabilir
   * - Normal kullanicilar UI'da "AI su an bakim modunda" banner'i gorur
   * - Backend endpoint'leri admin dogrulamasi yapar, quota tuketimi yok
   *
   * ACMAK ICIN:
   * 1. Anthropic quota yeterli + odeme mimarisi hazir
   * 2. Bu flag'i true yap + redeploy
   */
  aiForAllUsers: false,
} as const;
