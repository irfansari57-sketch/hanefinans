"""
TEFAS fon verilerini doğrudan resmi API'den çeker, data/tefas.json'a yazar.

Strateji:
  - 7 / 30 / 90 / 180 / 365 gün geri tek noktalardan NAV oku
  - Son gün NAV ile compare et → dönemsel getiri
  - Tüm fonları tek tabloda topla
  - jsDelivr CDN üzerinden frontend'a sunulur

Çıktı: data/tefas.json (src/data/api/tefasGithub.ts ile uyumlu)
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sys
import time

import requests

API_URL = "https://www.tefas.gov.tr/api/DB/BindHistoryInfo"
OUTPUT_PATH = "data/tefas.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "https://www.tefas.gov.tr",
    "Referer": "https://www.tefas.gov.tr/TarihselVeriler.aspx",
    "X-Requested-With": "XMLHttpRequest",
}


def fmt_tr_date(d) -> str:
    """TEFAS dd.mm.yyyy formatı"""
    if isinstance(d, str):
        return d
    return d.strftime("%d.%m.%Y")


def fetch_tefas_for_date(date_str: str, retries: int = 3) -> list[dict]:
    """Tek bir gün için tüm fonların verisini çek."""
    payload = {
        "fontip": "YAT",       # yatırım fonu (emeklilik için 'EYF')
        "bastarih": date_str,
        "bittarih": date_str,
        "fonkod": "",
        "fongrup": "",
    }
    for attempt in range(retries):
        try:
            r = requests.post(API_URL, data=payload, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                j = r.json()
                return j.get("data", [])
            print(f"  ⚠️ {date_str} HTTP {r.status_code} (deneme {attempt + 1})", file=sys.stderr)
            time.sleep(1 + attempt)
        except Exception as e:
            print(f"  ⚠️ {date_str} hata: {e} (deneme {attempt + 1})", file=sys.stderr)
            time.sleep(1 + attempt)
    return []


def parse_date_str(s: str) -> datetime:
    """TEFAS dd.mm.yyyy → datetime"""
    return datetime.strptime(s, "%d.%m.%Y")


def get_business_day(target: datetime, max_back: int = 5) -> datetime:
    """Verilen tarih hafta sonuysa Cuma'ya çek."""
    d = target
    for _ in range(max_back):
        if d.weekday() < 5:  # 0=Mon, 4=Fri
            return d
        d -= timedelta(days=1)
    return target


def pct_change(latest: float, past: float | None) -> float | None:
    if past is None or past == 0:
        return None
    return round(((latest - past) / past) * 100, 2)


def main() -> int:
    os.makedirs("data", exist_ok=True)

    today = datetime.now(timezone.utc).replace(tzinfo=None)
    # Anchor tarihler — son iş gününe yuvarla
    anchors = {
        "last":  get_business_day(today - timedelta(days=1)),
        "1w":    get_business_day(today - timedelta(days=8)),
        "1m":    get_business_day(today - timedelta(days=31)),
        "3m":    get_business_day(today - timedelta(days=92)),
        "6m":    get_business_day(today - timedelta(days=183)),
        "1y":    get_business_day(today - timedelta(days=366)),
        "ytd":   get_business_day(datetime(today.year, 1, 2)),
    }

    print("Anchor tarihleri:")
    for k, v in anchors.items():
        print(f"  {k}: {v.strftime('%d.%m.%Y')} ({v.strftime('%A')})")

    # Her anchor için tek POST → tüm fonlar
    snapshots: dict[str, dict[str, dict]] = {}  # anchor_key → {code → row}
    for key, dt in anchors.items():
        date_str = fmt_tr_date(dt)
        print(f"\nFetching {key} = {date_str}…")
        # TEFAS bazen tek gün boş döner — 3 iş günü geriye bak
        rows = []
        attempt_date = dt
        for back in range(5):
            rows = fetch_tefas_for_date(fmt_tr_date(attempt_date))
            if rows:
                print(f"  ✓ {len(rows)} fon @ {fmt_tr_date(attempt_date)}")
                break
            attempt_date -= timedelta(days=1)
            attempt_date = get_business_day(attempt_date)
        if not rows:
            print(f"  ✗ {key} için veri alınamadı")
            snapshots[key] = {}
            continue
        snapshots[key] = {row.get("FONKODU", ""): row for row in rows if row.get("FONKODU")}
        time.sleep(0.5)  # nezaket aralığı

    # Son güne göre fonları birleştir
    last_snap = snapshots.get("last", {})
    if not last_snap:
        print("\n❌ Son gün verisi alınamadı — TEFAS şu anda erişilmez olabilir.", file=sys.stderr)
        return 1

    funds = []
    for code, last_row in last_snap.items():
        try:
            latest_nav = float(last_row.get("FIYAT", 0) or 0)
            if latest_nav <= 0:
                continue

            def get_past(key: str) -> float | None:
                row = snapshots.get(key, {}).get(code)
                if not row:
                    return None
                try:
                    v = float(row.get("FIYAT", 0) or 0)
                    return v if v > 0 else None
                except Exception:
                    return None

            returns = {
                "1w":  pct_change(latest_nav, get_past("1w")),
                "1m":  pct_change(latest_nav, get_past("1m")),
                "3m":  pct_change(latest_nav, get_past("3m")),
                "6m":  pct_change(latest_nav, get_past("6m")),
                "1y":  pct_change(latest_nav, get_past("1y")),
                "ytd": pct_change(latest_nav, get_past("ytd")),
            }

            tarih_raw = last_row.get("TARIH", "")
            iso_date = ""
            try:
                # TARIH bazen unix-ms format döner, bazen "01.01.2024"
                if isinstance(tarih_raw, int) or (isinstance(tarih_raw, str) and tarih_raw.isdigit()):
                    iso_date = datetime.fromtimestamp(int(tarih_raw) / 1000).date().isoformat()
                elif "/Date(" in str(tarih_raw):
                    ms = int(str(tarih_raw).split("(")[1].split(")")[0])
                    iso_date = datetime.fromtimestamp(ms / 1000).date().isoformat()
                else:
                    iso_date = parse_date_str(str(tarih_raw)).date().isoformat()
            except Exception:
                iso_date = anchors["last"].date().isoformat()

            funds.append({
                "code": code,
                "name": str(last_row.get("FONUNVAN") or "").strip(),
                "category": "",  # tek POST'ta kategori bilgisi sınırlı — boş bırak
                "nav": latest_nav,
                "date": iso_date,
                "marketCap": float(last_row.get("PORTFOYBUYUKLUK", 0) or 0) or None,
                "investorCount": int(last_row.get("KISISAYISI", 0) or 0) or None,
                "shareCount": int(last_row.get("TEDPAYSAYISI", 0) or 0) or None,
                "returns": returns,
                "history": [],
            })
        except Exception as e:
            print(f"  ⚠️ {code} işlenemedi: {e}", file=sys.stderr)

    funds.sort(key=lambda x: x["code"])

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(funds),
        "funds": funds,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUTPUT_PATH) // 1024
    print(f"\n✅ {len(funds)} fon yazıldı → {OUTPUT_PATH} ({size_kb} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
