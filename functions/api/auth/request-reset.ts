/**
 * POST /api/auth/request-reset
 * Body: { email: string }
 *
 * Şifre sıfırlama akışı — adım 1.
 *  1) E-posta DB'de var mı kontrol et (varsa)
 *  2) HMAC-imzalı reset token üret (30 dk geçerli)
 *  3) Resend ile e-posta gönder (içinde reset linki: /auth/reset-password?token=…)
 *  4) Her durumda 200 dön — kullanıcı yoksa da. Email enumeration savunması (#Ö3).
 *
 * Güvenlik:
 *  - Rate limit: auth bucket (10/dk/IP) + per-email (5/10dk) — middleware + bu endpoint
 *  - Token 30 dk exp, purpose='reset-password' zorunlu, nonce ile replay savunması
 *  - Mail içeriği: sadece kısa açıklama + tıklanabilir link, kod yok
 */

import {
  signToken, generateNonce, jsonResponse, corsPreflightResponse,
  type ResetPayload,
} from './_token';
import type { Env } from './_utils';
import { rateLimitCheck, getClientIp } from '../../_rate-limit';
import { verifyTurnstile } from '../../_turnstile';

interface RequestResetBody {
  email: string;
  turnstileToken?: string;
}

const RESET_TTL_MS = 30 * 60 * 1000; // 30 dk

export const onRequestPost: PagesFunction<Env & {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  TURNSTILE_SECRET_KEY?: string;
}> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'Servis hazırlanıyor' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'Servis hazırlanıyor' }, 503);
  if (!env.RESEND_API_KEY) return jsonResponse({ ok: false, error: 'Mail servisi yapılandırılmamış' }, 503);

  let body: RequestResetBody;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz istek' }, 400); }

  // Turnstile (#Ö5) — mail bombing / Resend kotası DoS savunması.
  const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, getClientIp(request));
  if (!turnstileOk) {
    // Bot olduğu için sahte 200 dön — enumeration için hata mesajı verme.
    return jsonResponse({ ok: true, sent: true }, 200);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: false, error: 'Geçerli bir e-posta gir' }, 400);
  }

  // Per-email rate limit — mail bombing savunması (5 istek / 10 dk / email)
  const limit = await rateLimitCheck(env.DB, 'reset-email', email, 5, 600);
  if (!limit.allowed) {
    return jsonResponse({ ok: true, sent: true }, 200); // sessizce yutarak 200 dön
  }

  // Kullanıcı var mı kontrol et — yoksa sessizce 200 dön (enumeration savunması)
  const row = await env.DB
    .prepare('SELECT id, email FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number; email: string }>();

  if (!row) {
    // Email enumeration savunması: sahte token üretip mail göndermeden 200 dön.
    // Süre/timing eşit olsun diye küçük bir delay ekle.
    await new Promise((r) => setTimeout(r, 50));
    return jsonResponse({ ok: true, sent: true }, 200);
  }

  const payload: ResetPayload = {
    email,
    exp: Date.now() + RESET_TTL_MS,
    purpose: 'reset-password',
    nonce: generateNonce(),
  };
  const token = await signToken(payload, env.AUTH_TOKEN_SECRET);

  // Reset linki — frontend route'a yönlendir, token query param
  const origin = new URL(request.url).origin;
  const resetUrl = `${origin}/auth/reset-password?token=${encodeURIComponent(token)}`;

  const fromEmail = env.RESEND_FROM_EMAIL ?? 'InvestLiq <onboarding@resend.dev>';
  const html = buildEmailHtml(email, resetUrl);
  const text = `InvestLiq şifre sıfırlama\n\n${email} hesabın için şifre sıfırlama isteği aldık.\n\nBağlantı (30 dk geçerli):\n${resetUrl}\n\nSen istemediysen bu maili görmezden gel — şifren değişmeyecek.`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: 'InvestLiq — Şifre sıfırlama isteğin',
        html,
        text,
      }),
    });
    if (!r.ok) {
      // Upstream error'u client'a açma — sadece status logla (Ö16)
      console.error('[request-reset] Resend error', r.status);
      return jsonResponse({ ok: false, error: 'Mail gönderilemedi, daha sonra tekrar dene' }, 502);
    }
  } catch (e) {
    console.error('[request-reset] fetch failed', (e as Error).message);
    return jsonResponse({ ok: false, error: 'Mail servisi geçici olarak ulaşılamıyor' }, 502);
  }

  return jsonResponse({ ok: true, sent: true }, 200);
};

export const onRequestOptions: PagesFunction = async () => corsPreflightResponse();

function buildEmailHtml(email: string, resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>InvestLiq — Şifre sıfırlama</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,Segoe UI,sans-serif;color:#cbd5e1;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#111a2e;border-radius:16px;margin-top:32px;border:1px solid #1f2a44;">
    <div style="text-align:center;font-size:22px;font-weight:800;letter-spacing:-0.3px;margin-bottom:24px;">
      <span style="color:#f1f5f9;">Invest</span><span style="color:#4ade80;">Liq</span>
    </div>
    <h1 style="font-size:18px;color:#f1f5f9;margin:0 0 12px;">Şifre sıfırlama isteğin</h1>
    <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 20px;">
      <strong style="color:#cbd5e1;">${email}</strong> hesabın için şifre sıfırlama isteği aldık.
      Yeni şifreni belirlemek için aşağıdaki butona tıkla. Bağlantı
      <strong style="color:#fbbf24;">30 dakika</strong> geçerlidir.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetUrl}"
         style="display:inline-block;background:#4ade80;color:#052e16;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:14px;">
        Şifremi Sıfırla
      </a>
    </div>
    <p style="font-size:12px;line-height:1.5;color:#64748b;margin:16px 0 0;word-break:break-all;">
      Buton çalışmıyorsa bu adresi kopyala:<br />
      <span style="color:#4ade80;">${resetUrl}</span>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0;">
      <strong style="color:#fbbf24;">Sen istemediysen</strong> bu e-postayı görmezden gelebilirsin —
      şifren değişmeyecek.
    </p>
    <hr style="border:none;border-top:1px solid #1f2a44;margin:24px 0;" />
    <p style="font-size:11px;color:#475569;text-align:center;margin:0;">
      InvestLiq · <a href="https://investliq.com" style="color:#4ade80;text-decoration:none;">investliq.com</a>
    </p>
  </div>
</body>
</html>`;
}
