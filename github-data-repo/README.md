# Hane Finans — TEFAS Data Repo

Bu repo, **GitHub Actions** ile her saat TEFAS'tan fon verisi çekip JSON olarak yayınlar.
Hane Finans uygulaması bu JSON'u CDN üzerinden okur, gerçek NAV/getiri/varlık verisi gösterir.

## Mimari

```
GitHub Actions (saatte 1)
   ↓
Python (tefas-crawler kütüphanesi)
   ↓
TEFAS sitesi (Akamai aşılır, runner farklı IP'den)
   ↓
data/funds.json oluştur
   ↓
git commit + push
   ↓
jsDelivr CDN (anında yansır)
   ↓
Hane Finans (fetch → render)
```

## İçerik

- `.github/workflows/tefas-scrape.yml` — saatlik cron + manuel tetik
- `scripts/scrape-tefas.py` — Python scraper
- `scripts/requirements.txt` — Python paketleri
- `data/funds.json` — **çıktı (otomatik oluşturulur)**

## Çıktı formatı

```json
{
  "updatedAt": "2026-05-12T14:05:00Z",
  "count": 42,
  "funds": [
    {
      "code": "TLY",
      "name": "Türkiye Garanti Yatırım Hisse Senedi (TL) Fonu",
      "category": "Hisse Senedi",
      "nav": 16.4523,
      "date": "2026-05-11",
      "marketCap": 4500000000,
      "investorCount": 33919,
      "returns": {
        "1w": 4.21,
        "1m": 14.87,
        "3m": 22.31,
        "6m": 41.55,
        "ytd": 38.20,
        "1y": 78.45
      },
      "history": [
        { "date": "2026-04-13", "price": 14.32 },
        { "date": "2026-04-14", "price": 14.41 }
      ]
    }
  ],
  "failed": []
}
```

## CDN URL (uygulamaya verilen)

```
https://cdn.jsdelivr.net/gh/<KULLANICI>/<REPO>@main/data/funds.json
```

jsDelivr GitHub CDN'i:
- Ücretsiz, no rate-limit (gerçekçi kullanım için)
- Edge cache (anlık güncelleme)
- HTTPS

## Kurulum

Bkz. ana proje: `SETUP_GITHUB_TEFAS.md`
