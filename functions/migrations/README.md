# D1 migration'ları

Tek production veritabanı: **`hanefinans-db`** (Pages binding adı `DB`).
Dokümanlarda geçen `hanefinans-auth` / `finansal-asistan` adları eski; 13 Eki 2026'da düzeltildi.

Uygulama (elle, sırayla; takip tablosu yok — uygulananları buraya işaretle):

```powershell
npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/<dosya>.sql
```

| # | Dosya | Durum (prod) | Not |
|---|---|---|---|
| — | `../auth-schema.sql` | ✅ | users tablosu (başlangıç) |
| 002 | admin_role_and_rate_limit | ✅ | |
| 003 | yahoo_cache | ✅ | |
| 004 | telemetry_events | ✅ | |
| 005 | push_subscriptions | ✅ | |
| 006 | price_alerts | ✅ | |
| 007 | user_streaks | ✅ | |
| 008 | predictions | ✅ | |
| 010 | deep_analyses | ✅ | 009 yok (atlanmış numara) |
| 011 | portfolio | ✅ | |
| 012 | oauth_provider | ✅ | **çift 012** — ikisi de ayrı dosya, ikisi de uygulanır |
| 012 | portfolio_health | ✅ | |
| 013 | portfolio_snapshots | ✅ | |
| 014 | metals_spot | ✅ | |
| 015 | watchlist | ✅ | |
| 016 | bist_snapshot | ✅ | |
| 017 | agent_cache | ✅ 13 Eki 2026 | AI agent yanıt cache'i |
| 018 | token_version | ⏳ | JWT iptali — **uygulanmalı** |

Doğrulama:
```powershell
npx wrangler d1 execute hanefinans-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```
