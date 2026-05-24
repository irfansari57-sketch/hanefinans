# Hane Finans — Güvenlik Denetimi (24 Mayıs 2026)

Üç paralel ajan denetimi (backend / frontend / servis-deploy) sonucu konsolide rapor.
Kapsam: `functions/`, `src/`, `public/`, `.github/`, `.env*`, `package.json`, deploy konfigi.

---

## 🔴 KRİTİK — bu hafta içinde halledilmeli

### K1. Canlı API anahtarları repo'da plain text
- **Dosya:** `DEPLOY.md` (git'te tracked, ilk commit `87997dd`)
- **Sızan secret'lar:**
  - `VITE_TWELVEDATA_KEY = ebb26064c1154fe094f7370ec552a10b`
  - `VITE_GNEWS_KEY = 5c4ddc08bffa3d26cd009ea7beb94e37`
  - `VITE_GOLDAPI_KEY = goldapi-12e53f90815ec100c2ad94e10236e8ef-io`
  - `TCMB_API_KEY = lT4irjYOXr`
  - `TELEGRAM_BOT_TOKEN = 8624595740:AAE7bFW4QvAfW5jyr5cjZcb29H0tYOEdGNU`
- **Aksiyon:**
  1. Her servisin panelinden token'ı **hemen** rotate et (BotFather `/revoke`, TCMB EVDS profil, Twelve Data / GNews / GoldAPI dashboard).
  2. `DEPLOY.md`'den secret'ları kaldır, sadece "Cloudflare Dashboard → Variables" referansı bırak.
  3. Git history'den `git filter-repo --path DEPLOY.md --invert-paths` veya BFG ile temizle (force-push gerekir).

### K2. VITE_* anahtarları frontend bundle'a sızıyor
- **Kanıt:** `dist/assets/index-DNVJkOUV.js` içinde literal olarak `ebb26064...`, `5c4ddc08...`, `goldapi-12e53...` mevcut.
- **Etki:** Twelve Data, GNews, GoldAPI quota'ları DevTools'tan erişen herkesin elinde. GoldAPI 100/ay free quota → bir kullanıcı tek günde yakar.
- **Aksiyon:** Bu üç servisi `functions/api/{gnews,twelvedata,goldapi}.ts` proxy'sine taşı (TCMB/Telegram pattern'i ile aynı). VITE_ prefix'ini kaldır, Cloudflare Pages env'ine `GNEWS_KEY` vs olarak ekle. Rate-limit middleware'de yeni `external` bucket tanımla.

### K3. Password hash = düz SHA-256 + sabit pepper, salt yok
- **Dosya:** `functions/api/auth/_utils.ts:93-99`
- **Sorun:** Her kullanıcı email-deterministik tek SHA-256 round; pepper kod içinde literal (`"hane-finans"`). DB sızıntısında rainbow-table + GPU brute-force ile dakikalarda çözülür.
- **Aksiyon:** PBKDF2-SHA256 (≥210k iter) + kullanıcı bazlı rastgele 16-byte salt. Format: `pbkdf2$210000$<base64(salt)>$<base64(hash)>`. Mevcut kullanıcılar için login sırasında lazy migration: eski formatla doğrula → başarılıysa yeni formatla yaz.

### K4. Open proxy / SSRF — Yahoo + TCMB + Telegram
- **Dosyalar:**
  - `functions/api/yahoo/[[path]].ts` — herhangi bir path forward, auth yok, kullanıcı `*.yahoo.com` altında istediği endpoint'i çağırabilir.
  - `functions/api/tcmb/[[path]].ts` — TCMB_API_KEY her isteme inject, kullanıcı kotasını sömürebilir.
  - `functions/api/telegram/[[path]].ts` — bot token inject; saldırgan `setWebhook`/`getUpdates` çağırarak botu hijack edebilir.
  - `functions/api/telegram/send.ts` — auth check yok, herhangi bir chat_id'ye mesaj atılabilir.
- **Aksiyon:**
  - Yahoo: path regex whitelist (`/^v8\/finance\/chart\/[A-Z0-9.\-]+$/`), `getAuthedUser` zorunlu, kullanıcı başına quota.
  - TCMB: aynı pattern.
  - Telegram `[[path]]`: method whitelist (sadece `sendMessage`); `setWebhook`/`getUpdates` blok.
  - Telegram `send.ts`: auth zorunlu, chat_id DB'de user'a bağlı olmalı.

### K5. Pages Functions middleware D1 yoksa fail-open
- **Dosya:** `functions/api/_middleware.ts`
- **Sorun:** `if (!env.DB) return next()` — preview deployment'ta DB binding unutulursa rate-limit yok, brute-force sınırsız.
- **Aksiyon:** Production'da `env.DB` zorunlu, eksikse 503 dön. Auth bucket için ayrıca fail-closed (D1 hata verirse de 429).

### K6. Logout/şifre değişikliği server-side iptal mekanizması yok
- **Etki:** JWT 30 gün geçerli. Çalınmış token revoke edilemez, şifre değişimi mevcut oturumları sonlandıramaz.
- **Aksiyon:** `users` tablosuna `token_version INTEGER NOT NULL DEFAULT 0` ekle; JWT payload'a `tv` koy; `verifyJwt` sonrası DB'deki `token_version` ile karşılaştır. Şifre değişikliği / "tüm cihazlardan çıkış" → `token_version++`.

---

## 🟡 ÖNEMLİ — bu sprint içinde

### Ö1. Şifre sıfırlama akışı yok
- `change-password.ts`, `request-reset.ts`, `confirm-reset.ts` endpoint'leri **yok**. Şifresini unutan kullanıcının kurtarma yolu yok.

### Ö2. Signup'ta `isAdmin` otomatik atama
- **Dosya:** `functions/api/auth/signup.ts:45-59`
- DB silinmiş/migration uygulanmamış bir state'te saldırgan `irfansari57@gmail.com` ile signup yapıp admin+elite olabilir.
- **Aksiyon:** Signup'tan `isAdmin = isAdminEmail(email)` koşulunu çıkar; default `is_admin=0`, `tier='free'`, `email_verified=0`. Admin atama yalnızca manuel SQL.

### Ö3. Email enumeration + timing attack
- **Dosya:** `functions/api/auth/login.ts:31,35` + `signup.ts:38`
- Farklı mesajlar (`'Bu e-posta ile kayıt yok'` vs `'Şifre yanlış'` vs `'Bu e-posta zaten kayıtlı'`) sistemdeki e-postaları açığa çıkarıyor.
- Kullanıcı yoksa `hashPassword` çağrılmıyor → timing farkı.
- **Aksiyon:** Tek bir generic mesaj (`'E-posta veya şifre hatalı'`). Login'de user yoksa dummy hash çağrısı yap (sabit gecikme).

### Ö4. Per-email login rate limit yok
- **Dosya:** `functions/_rate-limit.ts`
- 10/dk/IP yetersiz — saldırgan residential proxy ile hesap başına 10/dk deneyebilir.
- **Aksiyon:** `login.ts`'te ekstra `rateLimitCheck(db, 'auth-email', email, 5, 600)`.

### Ö5. CAPTCHA / Turnstile yok
- **Dosya:** `functions/api/auth/send-code.ts`
- Auth 10/dk → dakikada 10 farklı e-postaya kod gönderilebilir → Resend quota tükenir + IP reputation düşer.
- **Aksiyon:** Cloudflare Turnstile zorunlu (signup, send-code, login).

### Ö6. JWT iat/exp birim hatası
- **Dosya:** `functions/api/auth/_utils.ts:139-163`
- `Date.now()` (ms) kullanılıyor; RFC 7519 saniye bekler. Harici JWT araçları bu token'ı 1970+epoch olarak yorumlar.
- **Aksiyon:** `Math.floor(Date.now()/1000)`.

### Ö7. CSP hâlâ Report-Only
- **Dosya:** `public/_headers:19`
- XSS koruması aktif değil. `report-uri` direktifi de yok → ihlaller console dışında toplanmıyor.
- **Aksiyon:** TradingView (`s3.tradingview.com`) için `script-src`/`frame-src`/`connect-src` ekle, `report-uri https://hanefinans.report-uri.com/r/d/csp/enforce` veya kendi endpoint'ini yaz, sonra `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.

### Ö8. API response'larında security header yok
- **Dosya:** Tüm `functions/api/**` `_utils.jsonResponse`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` eksik.
- **Aksiyon:** `_middleware.ts` global olarak ekle.

### Ö9. Telegram proxy CORS `*`
- **Dosya:** `functions/api/telegram/[[path]].ts:42`, `_token.ts:87`, `feedback.ts:67`, `yahoo`, `tcmb`
- `Access-Control-Allow-Origin: *` — auth-bearing endpoint'lerle tutarsız.
- **Aksiyon:** `Allow-Origin: https://hanefinans.net` + preview pattern. Sensitive endpoint'lerde CORS hiç set etme (same-origin default).

### Ö10. JSON body size limit yok
- Cloudflare Workers default 100MB POST kabul → CPU/memory DoS.
- **Aksiyon:** `_middleware.ts`'te `Content-Length > 64KB` ise 413 dön.

### Ö11. Min şifre 6 karakter
- **Dosya:** `functions/api/auth/signup.ts:32`
- **Aksiyon:** ≥10 karakter veya zxcvbn skor ≥3.

### Ö12. Rate limit fail-open kritik bucket'larda
- **Dosya:** `functions/_rate-limit.ts:82-85`
- Auth bucket için fail-closed (D1 hata verirse 429).

### Ö13. `getClientIp` XFF fallback spoof
- **Dosya:** `functions/_rate-limit.ts:92-99`
- `x-forwarded-for` fallback'ı saldırgan kontrolünde olabilir.
- **Aksiyon:** Sadece `CF-Connecting-IP`'ye güven; yoksa `'unknown'` dön.

### Ö14. EmailVerifyBanner token localStorage
- **Dosya:** `src/components/domain/EmailVerifyBanner.tsx:7,47,76,101`
- XSS'te ele geçirilirse hesap doğrulanır.
- **Aksiyon:** `sessionStorage` veya kısa-TTL HttpOnly cookie.

### Ö15. ADMIN_EMAILS_LC bundle'da
- **Dosyalar:** `src/store/auth.ts:52`, `functions/api/auth/_utils.ts:51`
- Phishing/credential-stuffing için hedef listesi açıkta.
- **Aksiyon:** Hardcoded liste fallback'ini sil (migration 002 zaten uygulandığı için). Frontend tek truth: server'dan gelen `user.isAdmin`.

### Ö16. Upstream error body leak
- **Dosyalar:** `functions/api/ai/analyze.ts:106`, `portfolio.ts:130`, `send-code.ts:73`
- Anthropic/Resend error mesajları client'a 200 char dönüyor (model adı, prompt fragment, domain info).
- **Aksiyon:** Sadece status; tam hata Sentry'ye.

### Ö17. Stateless email verification token replay
- **Dosya:** `functions/api/auth/_token.ts`
- Aksiyon: `used_tokens` D1 tablosu (key=base64(sig), expires_at).

### Ö18. Wrangler config eksik (Pages için)
- Sadece TEFAS Worker'ın `wrangler.toml`'u var. Pages D1/secret binding'leri dashboard-only → preview prod DB'ye bağlanma riski, IaC denetlenemiyor.
- **Aksiyon:** Pages için `wrangler.toml` ekle; production/preview ayrı D1 binding.

### Ö19. .gitignore eksikler
- Eksik: `.wrangler/`, `.dev.vars`, `*.tsbuildinfo`, `coverage/`, `dist-types/`
- **Aksiyon:** Ekle + `git rm --cached tsconfig.tsbuildinfo tsconfig.node.tsbuildinfo`.

---

## 🟢 NICE-TO-HAVE — sonraki sprint

### N1. Cookie `__Host-` prefix
- `fa_session` → `__Host-fa_session` (Domain hariç, Path=/, Secure). Subdomain saldırı vektörünü kapatır.

### N2. HMAC sabit-zamanlı karşılaştırma
- **Dosya:** `_utils.ts:153`, `_token.ts:65`
- String `===` yerine constant-time compare.

### N3. Audit log tablosu
- `audit_logs (admin_id, target_user_id, action, before, after, ts)`.

### N4. Cron-tabanlı rate_limits cleanup
- %1 olasılıkla LIMIT 1000 yerine daily Cron Trigger.

### N5. TradingView SRI / dinamik script güvenliği
- Dynamic widget olduğu için SRI zor; CSP'de origin whitelist yeterli.

### N6. CSP report-uri / report-to
- Şu an Report-Only ama hiçbir yere toplanmıyor.

### N7. Eksik repo dosyaları
- `SECURITY.md` (vulnerability disclosure)
- `.github/dependabot.yml`
- `.github/workflows/codeql.yml` (SAST)
- `CODEOWNERS`

### N8. Dev console temizliği
- `vite-plugin-remove-console` veya esbuild `drop: ['console']`.

### N9. Sentry tunnel
- Frontend → server proxy → Sentry. DSN gizlenir, sample rate server-side kontrol.

### N10. CRON_SECRET sabit-zaman compare
- `daily-report.ts:84`.

### N11. Logout-all endpoint
- `token_version++` ile tüm cihazlardan çıkış.

### N12. Fixed-window rate limit → sliding window
- Pencere sınırında 2x burst riski.

### N13. KVKK data retention politikası
- Doküman + auto-purge cron.

### N14. cdn.jsdelivr TEFAS JSON schema validation
- Client-side boyut + alan tipi kontrolü.

### N15. CI `npm audit --audit-level=high` + `actions/dependency-review-action@v4`
- Şu an `--no-audit` ile bypass.

### N16. Python scripts için pinned `requirements.txt`
- `playwright>=1.40.0` floating; typo-squat riski.

### N17. `.npmrc` `legacy-peer-deps=true` belgele veya kaldır
- Peer dep uyumsuzluğunu sessizce yutuyor.

### N18. push-handler.js SW `event.source/origin` doğrulama
- Aynı origin sandboxa güveniliyor; ek katman.

### N19. Sentry DSN için sample rate sıkılaştır

### N20. Branch protection + CODEOWNERS

---

## OLUMLU GÖZLEMLER

- **HttpOnly cookie tabanlı session** (`fa_session`) — JS'ten erişilemez, XSS-immune.
- D1 sorgularının **%100'ü prepared statement** ile bind ediliyor → SQL injection yok.
- `target="_blank"` linklerinin **%100'ü** `rel="noopener noreferrer"`.
- `dangerouslySetInnerHTML`, `eval`, `new Function`, `document.write` **hiç kullanılmıyor**.
- `sanitizeUrl` helper'ı `javascript:`/`data:` URI'lerini reddediyor.
- Güvenlik header'ları (HSTS, X-Frame-Options DENY, Permissions-Policy, COOP/CORP, Referrer-Policy) `_headers`'da kapsamlı.
- `.gitignore` `.env*` (`!.env.example` hariç) doğru.
- Vite proxy yalnız `server` block'unda → prod build temiz.
- `vite.config.ts` sourcemap default `false` → kaynak kod sızıntısı yok.
- `ci.yml` `pull_request_target` kullanmıyor (fork PR injection güvenli).
- `daily-telegram.yml`'da secret `X-Cron-Secret` header'ında, log'a basılmıyor.
- `robots.txt` private route'ları (`/settings`, `/portfoy`, `/watchlist`, `/auth/`, `/api/`) doğru disallow ediyor.
- Sentry SDK dinamik import (DSN yoksa bundle'a girmez); Replay devre dışı (gizlilik).

---

## ÖNCELİK SIRASI (öneri)

**1. gün (acil rotasyon):**
- K1: tüm sızan key'leri panellerden rotate, `DEPLOY.md` temizle
- K5: middleware fail-closed
- K2 ön-hazırlık: env'leri Cloudflare Dashboard'a `GNEWS_KEY` vs olarak ekle

**1. hafta:**
- K2: 3 proxy endpoint (`/api/gnews`, `/api/twelvedata`, `/api/goldapi`)
- K4: Yahoo/TCMB/Telegram proxy whitelist + auth + per-user quota
- K6: `token_version` kolonu + JWT payload + revocation
- Ö2 + Ö3 + Ö4: signup admin auto-grant kaldır, generic mesajlar, per-email rate limit
- Ö15 + Ö19: ADMIN_EMAILS_LC kaldır, .gitignore patch

**2. hafta:**
- K3: PBKDF2 + lazy migration
- Ö1: şifre sıfırlama akışı (`request-reset` + `confirm-reset` + email template)
- Ö5: Turnstile entegrasyonu
- Ö7: CSP enforce'a geç

**Sprint sonu:**
- Ö6, Ö8, Ö9, Ö10, Ö11, Ö12, Ö13, Ö14, Ö16, Ö17, Ö18 — kalan ÖNEMLİ'ler

**Sonraki sprint:** N1–N20 (NICE-TO-HAVE)

---

## EKSİK ENDPOINT'LER / DOSYALAR

- `functions/api/auth/change-password.ts`
- `functions/api/auth/request-reset.ts`
- `functions/api/auth/confirm-reset.ts`
- `functions/api/auth/logout-all.ts`
- `functions/api/{gnews,twelvedata,goldapi}.ts` (proxy)
- `wrangler.toml` (Pages için, root'ta)
- `SECURITY.md`
- `.github/dependabot.yml`
- `.github/workflows/codeql.yml`
- `CODEOWNERS`
- `functions/migrations/003_token_version_and_audit_log.sql`
- `functions/migrations/004_used_tokens.sql`
