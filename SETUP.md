# Hane Finans — Kurulum Kontrol Listesi

Bu dosya, Supabase backend + 4 ek API'yi devreye almak için yapman gereken adımları içerir. Tahmini süre: **30-40 dakika**.

---

## 1. Supabase projesi (~5 dk)

1. https://supabase.com → **Start Project** → kayıt ol
2. **New Project**
   - **Name:** `hane-finans` (önerilen)
   - **Region:** `Central EU (Frankfurt)` (BIST'e yakın)
   - **Plan:** Free
   - Güçlü bir database password seç ve kaydet
3. Proje hazır olduğunda:
   - **Database → Extensions** → `vector` ara → **Enable** (pgvector)
4. **SQL Editor → New Query** → `supabase/migrations/0001_init.sql` içeriğini yapıştır → **Run**
   - Tablolar (macro_series, news, news_embeddings, sentiment_mentions) ve RPC (match_news) oluşur
5. **Project Settings → API** → şu iki değeri kopyala:
   - **Project URL** → `VITE_SUPABASE_URL` olacak
   - **anon public** key → `VITE_SUPABASE_ANON_KEY` olacak

`.env.local` dosyana yapıştır:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 2. 4 ücretsiz API anahtarı (paralel ~15 dk)

### TCMB EVDS
- https://evds2.tcmb.gov.tr → **Üye Ol** → e-posta doğrula → **Profilim → API Anahtarı**
- Anahtarı kopyala — Supabase secret olarak ekleyeceğiz (`.env.local`'a koyma)

### Reddit
- https://www.reddit.com/prefs/apps → **create another app**
- Tip: **script**
- Name: `HaneFinans` (boşluksuz)
- redirect uri: `http://localhost`
- Create → `client_id` (uygulama adının altındaki kısa kod) ve `secret` notları al

### Voyage AI
- https://www.voyageai.com → Sign up → Dashboard → **API Keys** → **Create Key**

### Telegram
- Telegram'da `@BotFather`'ı bul
- `/newbot` → bot adı (örn. `HaneFinansBot`) → username (örn. `hane_finans_bot`)
- Sana **HTTP API token** verir, kopyala
- Botunla bir kez konuş (`/start` yaz)
- Tarayıcıda aç: `https://api.telegram.org/bot<TOKEN>/getUpdates`
- Cevaptaki `"chat":{"id":12345}` değeri **TELEGRAM_CHAT_ID**

---

## 3. Supabase CLI ile Edge Function deploy (~10 dk)

```powershell
# CLI kur
npm install -g supabase

# Login (tarayıcıda Supabase login açılır)
supabase login

# Proje klasöründen link
cd C:\Users\sirfa\OneDrive\Desktop\HaneFinans
supabase link --project-ref <project-ref>
# <project-ref>: Supabase Dashboard URL'inde projenin ID'si (örn. abcd1234efgh)

# Secret'ları sun (tek satırda hepsini birden de set edebilirsin)
supabase secrets set TCMB_API_KEY=<tcmb_key>
supabase secrets set REDDIT_CLIENT_ID=<reddit_client_id>
supabase secrets set REDDIT_CLIENT_SECRET=<reddit_secret>
supabase secrets set REDDIT_USER_AGENT="HaneFinans/0.1 by <reddit_kullanici_adin>"
supabase secrets set VOYAGE_API_KEY=<voyage_key>
supabase secrets set TELEGRAM_BOT_TOKEN=<telegram_token>
supabase secrets set TELEGRAM_CHAT_ID=<telegram_chat_id>

# 4 fonksiyonu deploy et
supabase functions deploy tcmb-evds
supabase functions deploy reddit-mentions
supabase functions deploy voyage-embed
supabase functions deploy telegram-send
```

---

## 4. İlk kullanım (testler)

Dev sunucusu çalışırken https://localhost:5173 → **Ayarlar** sayfasında:
- "Supabase" kartında yeşil **bağlı** rozeti olmalı

### Test 1 — TCMB Politika Faizi canlı
Tarayıcı konsolu (F12) aç ve yaz:
```js
await fetch('https://<project-ref>.supabase.co/functions/v1/tcmb-evds', {
  method: 'POST',
  headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
  body: '{}'
}).then(r => r.json()).then(console.log)
```
`{ ok: true, updated: [...] }` görmelisin. **Makro sayfasını yenile** → "Politika Faizi" CANLI rozeti almalı.

### Test 2 — Reddit sentiment
Aynı şekilde `reddit-mentions` çağır, body:
```js
JSON.stringify({ symbols: ['THYAO', 'ASELS', 'GARAN'] })
```
**Panel'i yenile** → "En Çok Bahsedilen" CANLI yeşil rozet.

### Test 3 — Voyage embed
Önce `news` tablosuna birkaç haber ekle (GNews bağlandığında otomatik olur, manuel de eklenebilir):
```sql
insert into public.news (id, source, symbols, importance, title, summary, published_at)
values ('test-1', 'KAP', '{THYAO}', 8, 'THYAO test başlığı', 'Test özet', now());
```
Sonra `voyage-embed` çağır body olmadan → `{ ok: true, embedded: 1 }`.
**Akıllı Arama** sayfasına git → "havayolu" yaz → match gelir.

### Test 4 — Telegram bildirim
```js
JSON.stringify({ text: '*Hane Finans test* — bağlantı çalışıyor 🎯' })
```
→ Telegram'da bildirim almalısın.

---

## 5. Periyodik veri çekimi (opsiyonel, otomasyon)

Edge Function'ları periyodik tetiklemek için **Supabase Cron** (pg_cron):
```sql
-- TCMB her saat
select cron.schedule('tcmb-hourly', '0 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/tcmb-evds',
    headers := jsonb_build_object('Authorization', 'Bearer <ANON_KEY>'),
    body := '{}'::jsonb
  );
$$);

-- Reddit her 30 dakika
select cron.schedule('reddit-30m', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/reddit-mentions',
    headers := jsonb_build_object('Authorization', 'Bearer <ANON_KEY>'),
    body := '{"symbols":["THYAO","ASELS","GARAN","SISE","KCHOL","AKBNK","EREGL","TUPRS","BIMAS"]}'::jsonb
  );
$$);
```
`pg_net` ve `pg_cron` Supabase'de zaten yüklü; aktive etmek: Database → Extensions.

---

## Sorun giderme

- **Edge Function 401**: `verify_jwt = true` olduğu için her istek `Authorization: Bearer <anon_key>` ister. Supabase JS SDK bunu otomatik ekler; manuel test ediyorsan başlığı unutma.
- **TCMB seri kodu boş**: EVDS dashboardda **Seri Arama** ile güncel kodu doğrula (`TP.PY.P01.M01` yerine güncel olan ne ise). `supabase/functions/tcmb-evds/index.ts` içindeki sabitleri güncelle ve `supabase functions deploy tcmb-evds`.
- **Reddit 401**: User-agent'in Reddit politikasına uygun olduğundan emin ol. Format: `<UygulamaAdı>/<sürüm> by <reddit-kullanıcı-adı>`.
- **Voyage 401**: API key'in geçerli olduğunu Voyage dashboard'tan doğrula.
- **Telegram "chat not found"**: Botunla en az bir kez `/start` yazıp konuşmalısın; ondan sonra `getUpdates`'tan chat_id görünür.

---

## Mimari özeti

```
+----------------------+         +----------------------+
|  Tarayıcı (PWA)     |◀───────▶|  Supabase Postgres   |
|  React + Dexie      |         |  + pgvector          |
+----------+-----------+         +----------+-----------+
           │ HTTPS                          │
           ▼                                │ service_role
  +--------+---------+                      │
  | Vite dev proxy   |  →  Yahoo Finance    │
  | /api/yahoo/*     |     (CORS workaround)│
  +------------------+                      │
                                            │
           ┌────────────────────────────────┘
           │ Edge Functions (Deno)
           ▼
  ┌────────────────────────────────────────────────────┐
  │ tcmb-evds      → evds2.tcmb.gov.tr (TR makro)      │
  │ reddit-mentions→ oauth.reddit.com (sentiment)      │
  │ voyage-embed   → api.voyageai.com (embeddings)     │
  │ telegram-send  → api.telegram.org (push)           │
  └────────────────────────────────────────────────────┘
```

Doğrudan frontend → Twelve Data, GNews, GoldAPI, frankfurter.app, Yahoo (via dev proxy)
Frontend → Supabase → Edge Functions → TCMB, Reddit, Voyage, Telegram
