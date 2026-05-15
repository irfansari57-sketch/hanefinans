"""
TEFAS fon verilerini çeker, data/tefas.json'a yazar.
GitHub Actions saatlik çalıştırır.

Çıktı formatı (src/data/api/tefasGithub.ts ile uyumlu):
{
  "updatedAt": "ISO",
  "count": N,
  "funds": [
    { code, name, category, nav, date, marketCap, investorCount, shareCount,
      returns: {1w, 1m, 3m, 6m, ytd, 1y},
      history: [{date, price}] }
  ]
}
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sys

import pandas as pd
from tefas import Crawler

OUTPUT_PATH = "data/tefas.json"
HISTORY_DAYS = 400  # ~13 ay; YTD ve 1yıl hesabı için yeterli

def pct_change(latest: float, past: float) -> float | None:
    if past is None or past == 0 or pd.isna(past):
        return None
    return round(((latest - past) / past) * 100, 2)

def find_close_at(history: pd.DataFrame, target_date: datetime) -> float | None:
    """Tarihten geriye en yakın günlük NAV'ı bulur."""
    if history.empty:
        return None
    target = target_date.date()
    history_sorted = history.sort_values("date")
    on_or_before = history_sorted[history_sorted["date"].dt.date <= target]
    if on_or_before.empty:
        return None
    return float(on_or_before.iloc[-1]["price"])

def main() -> int:
    os.makedirs("data", exist_ok=True)
    crawler = Crawler()

    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=HISTORY_DAYS)

    # Tüm fonların tarihsel verisini çek
    print(f"TEFAS verisi çekiliyor: {start_date} → {end_date}")
    try:
        df = crawler.fetch(start=start_date.isoformat(), end=end_date.isoformat())
    except Exception as e:
        print(f"TEFAS fetch hatası: {e}", file=sys.stderr)
        return 1

    if df.empty:
        print("TEFAS boş döndü", file=sys.stderr)
        return 1

    print(f"Toplam {len(df)} satır çekildi")
    df["date"] = pd.to_datetime(df["date"])

    funds = []
    failed = []

    # Her fon için aggregation
    for code in sorted(df["code"].unique()):
        try:
            sub = df[df["code"] == code].sort_values("date")
            if sub.empty:
                continue
            last = sub.iloc[-1]
            last_date = last["date"]
            latest_nav = float(last["price"])

            # Periyodik getiriler — kapanış fiyatları üzerinden
            past_dates = {
                "1w": last_date - timedelta(days=7),
                "1m": last_date - timedelta(days=30),
                "3m": last_date - timedelta(days=90),
                "6m": last_date - timedelta(days=180),
                "ytd": datetime(last_date.year, 1, 1, tzinfo=last_date.tzinfo) if last_date.tzinfo else datetime(last_date.year, 1, 1),
                "1y": last_date - timedelta(days=365),
            }
            returns = {}
            for key, target in past_dates.items():
                past_close = find_close_at(sub, target if isinstance(target, datetime) else datetime.combine(target, datetime.min.time()))
                returns[key] = pct_change(latest_nav, past_close) if past_close else None

            # History — son 1 yıl, sadece tarih+fiyat (grafik için)
            cutoff = last_date - timedelta(days=365)
            hist = sub[sub["date"] >= cutoff][["date", "price"]]
            history = [
                {"date": row["date"].date().isoformat(), "price": float(row["price"])}
                for _, row in hist.iterrows()
            ]

            funds.append({
                "code": code,
                "name": str(last.get("title") or "").strip(),
                "category": str(last.get("category") or "").strip(),
                "nav": latest_nav,
                "date": last_date.date().isoformat(),
                "marketCap": float(last["market_cap"]) if pd.notna(last.get("market_cap")) else None,
                "investorCount": int(last["number_of_investors"]) if pd.notna(last.get("number_of_investors")) else None,
                "shareCount": int(last["number_of_shares"]) if pd.notna(last.get("number_of_shares")) else None,
                "returns": returns,
                "history": history,
            })
        except Exception as e:
            print(f"  ⚠️ {code} işlenemedi: {e}", file=sys.stderr)
            failed.append(code)

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(funds),
        "failed": failed,
        "funds": funds,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅ {len(funds)} fon yazıldı → {OUTPUT_PATH} ({os.path.getsize(OUTPUT_PATH) // 1024} KB)")
    if failed:
        print(f"⚠️ {len(failed)} fon hata verdi: {failed[:10]}{'...' if len(failed) > 10 else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
