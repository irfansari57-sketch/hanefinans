# Cloud Auth Setup — Cloudflare D1

5 dakikalık kurulum. Bu adımları tamamladıktan sonra kullanıcı kayıtları **tüm cihazlarda** merkezi olarak görünür, admin paneli **tüm kullanıcıları** listeler.

## 1) Cloudflare D1 Database oluştur

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → sol menüden **Workers & Pages**
2. **D1 SQL Database** → **Create database**
3. Database name: `hanefinans-db` (ya da istediğin isim)
4. Location: **WEUR (Western Europe)** veya **ENAM (Eastern North America)** — Türkiye'ye en yakın
5. **Create** → DB oluşur

## 2) Schema'yı apply et

D1 dashboard'unda az önce oluşturduğun DB'yi aç → üstte **"Console"** sekmesi → aşağıdaki SQL'i yapıştır + **Execute**:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  tier_expires_at INTEGER,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verified_at INTEGER,
  avatar_color TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
```

(Aynı SQL `functions/auth-schema.sql` dosyasında da var, oradan kopyalayabilirsin.)

## 3) Pages projesine D1 binding ekle

1. **Workers & Pages** → **hanefinans** projesi (Cloudflare Pages projen)
2. **Settings** sekmesi → **Functions** alt sekmesi
3. **D1 database bindings** bölümü → **Add binding**:
   - **Variable name:** `DB`
   - **D1 database:** az önce oluşturduğun `hanefinans-db`
4. **Save**

## 4) AUTH_TOKEN_SECRET environment variable ekle

Aynı **Settings** sayfasında:

1. **Environment variables** bölümü → **Add variable**
2. **Variable name:** `AUTH_TOKEN_SECRET`
3. **Value:** rastgele 32+ karakter (örnek üretmek için terminalde: `openssl rand -hex 32`)
4. **Type:** Production + Preview (her ikisi)
5. **Save and deploy**

## 5) Yeniden deploy

Pages otomatik yeniden deploy ettikten sonra (3-4 dk):

1. Site adresine gidin: https://hanefinans.net
2. Eski oturum otomatik kapanır (artık D1 üzerinden çalışır)
3. **Yeniden signup yap** (aynı admin email + şifre ile)
   - Admin email'ler (`irfansari57@gmail.com`, `haneassistance@gmail.com`) signup'ta otomatik **elite + verified** olarak kaydedilir
4. Settings → Üye Yönetimi → "CLOUD" yeşil badge gözükür, başka cihazdan kayıt olan kullanıcılar listelenmeye başlar

## Sorun giderme

**"D1 binding (DB) eksik" hatası:**
- Pages → Settings → Functions → D1 bindings'i kontrol et, variable name `DB` olmalı (büyük harf)
- Save sonrası **yeniden deploy gerekir** (otomatik tetiklenir ya da Deployments'tan Retry)

**"AUTH_TOKEN_SECRET env eksik":**
- Environment variables → AUTH_TOKEN_SECRET tanımlı mı, Production scope'unda mı?

**Login çalışmıyor, "Bu e-posta ile kayıt yok":**
- Eski lokal IndexedDB kayıtları geçersiz — `Signup` ile yeniden kayıt ol

**Maliyet:**
- D1 free tier: 5 GB storage + 5M satır okuma/gün + 100K yazma/gün
- 10.000 kullanıcılı bir site için yeterli (mevcut ölçek çok altında)
- Beklenen maliyet: **₺0/ay**
