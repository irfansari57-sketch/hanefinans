/**
 * Cloudflare Turnstile — CAPTCHA doğrulaması (#Ö5).
 *
 * Kullanım (endpoint içinden):
 *   const ok = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, getClientIp(request));
 *   if (!ok) return jsonResponse({ ok: false, error: 'Bot doğrulaması başarısız' }, 403);
 *
 * Frontend, <Turnstile widget /> tarafından üretilen `cf-turnstile-response` token'ı
 * body içinde `turnstileToken` field'ında server'a gönderir.
 *
 * Konfigürasyon:
 *   1. Cloudflare Dashboard → Turnstile → Add Site
 *   2. Site Key (public) → Pages env vars: VITE_TURNSTILE_SITE_KEY
 *   3. Secret Key (private) → Pages env vars: TURNSTILE_SECRET_KEY
 *
 * Secret yokken: helper `null` döner; endpoint'ler "skip" davranışına geçer
 * (dev/preview kolaylığı için). Production'da secret eksikse Turnstile devre dışı —
 * fail-open ama log'da uyarı.
 */

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Turnstile token'ını siteverify endpoint'i ile doğrular.
 *
 * @param token  Frontend widget'tan gelen token (cf-turnstile-response)
 * @param secret TURNSTILE_SECRET_KEY env değeri; null/undefined ise skip (fail-open)
 * @param remoteIp Opsiyonel, CF-Connecting-IP — Cloudflare extra fingerprint için
 * @returns      true: doğrulandı veya secret yok (skip). false: token reddedildi.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  secret: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  // Secret yapılandırılmamışsa Turnstile devre dışı kabul et (skip).
  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY env yok — bot doğrulaması skip');
    return true;
  }
  // Frontend widget yüklenmemiş veya kullanıcı submit ettiyse boş token gelebilir.
  // Production'da bu istek reddedilmeli.
  if (!token || typeof token !== 'string' || token.length < 10) {
    return false;
  }

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp && remoteIp !== 'unknown') form.append('remoteip', remoteIp);

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!r.ok) {
      console.error('[turnstile] siteverify HTTP', r.status);
      // Cloudflare downtime → fail-closed (güvenli taraf)
      return false;
    }
    const data = await r.json<TurnstileVerifyResponse>();
    if (!data.success) {
      console.warn('[turnstile] failed:', data['error-codes']);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[turnstile] fetch error:', (e as Error).message);
    return false;
  }
}
