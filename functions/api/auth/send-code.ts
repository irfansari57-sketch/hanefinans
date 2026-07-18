/**
 * POST /api/auth/send-code
 * Body: { email: string }
 *
 * 6-haneli kod üretir, Resend ile email gönderir, HMAC-signed token döner.
 * Frontend token'ı localStorage'a kaydeder; sonra /api/auth/verify-code'a gönderir.
 *
 * Env (Cloudflare Pages dashboard → Settings → Environment variables):
 *   RESEND_API_KEY      — https://resend.com/api-keys'ten al
 *   AUTH_TOKEN_SECRET   — 32+ karakterlik random string (openssl rand -hex 32)
 *   RESEND_FROM_EMAIL   — opsiyonel, varsayılan: onboarding@resend.dev (Resend sandbox)
 */

import { signToken, generateCode, jsonResponse, corsPreflightResponse } from './_token';
import { verifyTurnstile } from '../../_turnstile';
import { getClientIp } from '../../_rate-limit';

interface Env {
  RESEND_API_KEY?: string;
  AUTH_TOKEN_SECRET?: string;
  RESEND_FROM_EMAIL?: string;
  TURNSTILE_SECRET_KEY?: string;
}

interface SendCodeRequest {
  email: string;
  turnstileToken?: string;
}

const EXPIRY_MS = 15 * 60 * 1000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) {
    return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env tanımlı değil (Pages settings)' }, 503);
  }
  if (!env.RESEND_API_KEY) {
    return jsonResponse({ ok: false, error: 'RESEND_API_KEY env tanımlı değil — Pages settings\'ten ekle' }, 503);
  }

  let body: SendCodeRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400);
  }

  // Turnstile (#Ö5) — Resend kota DoS savunması
  const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, getClientIp(request));
  if (!turnstileOk) {
    return jsonResponse({ ok: false, error: 'Bot doğrulaması başarısız' }, 403);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: false, error: 'Geçerli bir e-posta gir' }, 400);
  }

  const code = generateCode();
  const exp = Date.now() + EXPIRY_MS;
  const token = await signToken({ email, code, exp }, env.AUTH_TOKEN_SECRET);

  const fromEmail = env.RESEND_FROM_EMAIL ?? 'InvestLiq <onboarding@resend.dev>';
  const html = buildEmailHtml(code, email);
  const text = `InvestLiq email doğrulama kodun: ${code}\n\nBu kod 15 dakika geçerli. Sen değilsen bu maili görmezden gel.`;

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
        subject: `InvestLiq doğrulama kodun: ${code}`,
        html,
        text,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return jsonResponse({ ok: false, error: `Resend API ${r.status}: ${errText.slice(0, 200)}` }, 502);
    }
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message }, 500);
  }

  return jsonResponse({ ok: true, token, expiresIn: EXPIRY_MS });
};

export const onRequestOptions: PagesFunction = async () => corsPreflightResponse();

function buildEmailHtml(code: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>InvestLiq doğrulama kodun</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,Segoe UI,sans-serif;color:#cbd5e1;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#111a2e;border-radius:16px;margin-top:32px;border:1px solid #1f2a44;">
    <div style="text-align:center;font-size:20px;font-weight:700;color:#22d3ee;letter-spacing:0.5px;margin-bottom:24px;">
      HANE FİNANS
    </div>
    <h1 style="font-size:18px;color:#f1f5f9;margin:0 0 12px;">E-posta doğrulama</h1>
    <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 20px;">
      <strong style="color:#cbd5e1;">${email}</strong> hesabını aktifleştirmek için aşağıdaki 6 haneli kodu siteye gir.
      Kod <strong style="color:#fbbf24;">15 dakika</strong> geçerlidir.
    </p>
    <div style="text-align:center;background:#0f172a;border:2px dashed #22d3ee;border-radius:12px;padding:24px;margin:24px 0;">
      <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#22d3ee;font-family:'SF Mono',Monaco,monospace;">
        ${code}
      </div>
    </div>
    <p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0;">
      Bu e-postayı sen istemediysen görmezden gelebilirsin — hesabın aktifleşmez.
    </p>
    <hr style="border:none;border-top:1px solid #1f2a44;margin:24px 0;" />
    <p style="font-size:11px;color:#475569;text-align:center;margin:0;">
      Hane Dijital Teknoloji A.Ş. · <a href="https://investliq.com" style="color:#22d3ee;text-decoration:none;">investliq.com</a>
    </p>
  </div>
</body>
</html>`;
}
