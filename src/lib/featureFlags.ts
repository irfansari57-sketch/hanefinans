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
   *    - RESEND_FROM_EMAIL = noreply@hanefinans.net (Resend domain verify gerekir)
   * 3. Bu flag'i true yap + redeploy
   */
  emailVerification: false,
} as const;
