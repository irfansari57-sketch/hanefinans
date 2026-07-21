/**
 * Cloudflare Turnstile — CAPTCHA doğrulaması (#Ö5).
 *
 * Kullanım (endpoint içinden):
 *   const ok = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, getClientIp(request), request);
 *   if (!ok) return jsonResponse({ ok: false, error: 'Bot doğrulaması başarısız' }, 403);
 *
 * Konfigürasyon:
 *   1. Cloudflare Dashboard → Turnstile → Add Site
 *   2. Site Key (public) → Pages env vars: VITE_TURNSTILE_SITE_KEY
 *   3. Secret Key (private) → Pages env vars: TURNSTILE_SECRET_KEY
 *
 * Secret davranışı (hostname bazlı):
 *   - localhost / *.pages.dev preview → skip (dev kolaylığı, fail-open)
 *   - Prod custom domain (investliq.com, hanefinans.net vb.) → REDDET (fail-closed)
 *   - Env var eksikse config hatası; prod'da auth kapalı kalır.
 */

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/** Dev/preview host mu — localhost + *.pages.dev */
function isDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.pages.dev')
  );
}

/**
 * Turnstile token'ını siteverify endpoint'i ile doğrular.
 *
 * @param token  Frontend widget'tan gelen token (cf-turnstile-response)
 * @param secret TURNSTILE_SECRET_KEY env değeri; prod'da eksikse fail-closed
 * @param remoteIp Opsiyonel, CF-Connecting-IP
 * @param request Opsiyonel — hostname tespiti için (prod fail-closed ayrımı)
 * @returns      true: doğrulandı veya dev host'ta skip. false: token reddedildi / prod'da secret eksik.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  secret: string | undefined,
  remoteIp?: string,
  request?: Request,
): Promise<boolean> {
  // Secret eksikse: dev/preview'da skip, prod'da REDDET (fail-closed)
  if (!secret) {
    if (request) {
      try {
        const host = new URL(request.url).hostname;
        if (isDevHost(host)) {
          console.warn('[turnstile] secret yok + dev host → skip');
          return true;
        }
        console.error('[turnstile] PROD secret eksik — fail-closed');
        return false;
      } catch {
        // URL parse hatası → güvenli tarafta reddet
        return false;
      }
    }
    // Request verilmediyse defansif fail-open (backward-compat, log ile)
    console.warn('[turnstile] secret yok + request yok — legacy skip');
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
