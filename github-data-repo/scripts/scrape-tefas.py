"""
Hane Finans — TEFAS scraper.
GitHub Actions tarafından saatte bir çalıştırılır.
Sonuçları data/funds.json'a yazar.

tefas-crawler (https://github.com/burhanyldzz/tefas-crawler) — TEFAS'ı session ile aşar.
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from tefas import Crawler
except ImportError:
    print("ERROR: tefas-crawler not installed", file=sys.stderr)
    sys.exit(1)

import pandas as pd

# Popüler Türk yatırım fonları — listeyi istediğin kadar büyüt
POPULAR_FUNDS = [
    # İş Portföy
    "AAL", "AAS", "AAV", "AC1", "AC4", "AC5", "AC6", "ACC", "ACD", "ACU",
    # Ak Portföy
    "ADE", "ADP", "AED", "AES", "AEV", "AFA", "AFO", "AFS", "AFT", "AFV",
    # Allianz / diğer büyük
    "AGC", "AHI", "AHN", "AHU", "AHV", "AIS", "AJ1", "AJK", "AK2", "AK3",
    # Garanti / Yapı Kredi
    "TLY", "GHF", "GAF", "YAY", "YBS", "YHS",
    # Bilinen büyük fonlar
    "IJC", "IIH", "TI2", "MJG",
    # Para piyasası
    "AAL", "GPS", "ICF",
    # Borçlanma araçları
    "AKE", "AK2", "AHU",
]

START_DATE = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
END_DATE = datetime.now().strftime("%Y-%m-%d")


def calc_return(history, days):
    """history: [{'date': '2026-05-11', 'price': 16.45}, ...] son tarihten N gün öncesi"""
    if not history or len(history) < 2:
        return None
    history = sorted(history, key=lambda x: x["date"])
    last = history[-1]
    target_date_str = (
        datetime.strptime(last["date"], "%Y-%m-%d") - timedelta(days=days)
    ).strftime("%Y-%m-%d")
    # En yakın tarihten önceki kayıt
    candidate = None
    for h in history:
        if h["date"] <= target_date_str:
            candidate = h
        else:
            break
    if not candidate or candidate["price"] == 0:
        return None
    return round(((last["price"] - candidate["price"]) / candidate["price"]) * 100, 2)


def calc_ytd(history):
    if not history:
        return None
    history = sorted(history, key=lambda x: x["date"])
    last = history[-1]
    year = last["date"][:4]
    # Yıl başına en yakın kayıt
    for h in history:
        if h["date"].startswith(year):
            if h["price"] == 0:
                return None
            return round(((last["price"] - h["price"]) / h["price"]) * 100, 2)
    return None


def fetch_fund(crawler, code):
    """Tek bir fonun verisini çek."""
    try:
        df = crawler.fetch(start=START_DATE, end=END_DATE, name=code)
        if df is None or df.empty:
            return None
    except Exception as e:
        print(f"  ! {code}: fetch hatası: {e}", file=sys.stderr)
        return None

    # Tarihe göre sırala
    df = df.sort_values("date")
    # JSON serializable history (son 100 gün)
    history = [
        {"date": str(row["date"])[:10], "price": float(row["price"])}
        for _, row in df.tail(100).iterrows()
        if pd.notna(row.get("price"))
    ]
    if not history:
        return None

    last_row = df.iloc[-1]
    return {
        "code": code,
        "name": str(last_row.get("title", "")).strip() or code,
        "category": str(last_row.get("fon_kategorisi", last_row.get("title_full", ""))).strip(),
        "nav": float(last_row["price"]),
        "date": str(last_row["date"])[:10],
        "marketCap": float(last_row.get("market_cap") or 0),
        "investorCount": int(last_row.get("number_of_investors") or 0),
        "shareCount": float(last_row.get("number_of_shares") or 0),
        "returns": {
            "1w": calc_return(history, 7),
            "1m": calc_return(history, 30),
            "3m": calc_return(history, 90),
            "6m": calc_return(history, 180),
            "ytd": calc_ytd(history),
            "1y": calc_return(history, 365),
        },
        "history": history[-30:],  # son 30 gün
    }


def main():
    crawler = Crawler()
    seen = set()
    funds = []
    failed = []

    for code in POPULAR_FUNDS:
        if code in seen:
            continue
        seen.add(code)
        print(f"Fetching {code}...")
        data = fetch_fund(crawler, code)
        if data:
            funds.append(data)
            r = data["returns"]
            print(f"  ✓ {code}: NAV={data['nav']:.4f}  1A={r.get('1m')}%  1Y={r.get('1y')}%")
        else:
            failed.append(code)

    print(f"\nOK: {len(funds)} fonun verisi alındı.")
    if failed:
        print(f"FAILED: {len(failed)} fon: {', '.join(failed)}")

    output = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(funds),
        "funds": funds,
        "failed": failed,
    }

    data_dir = Path("data")
    data_dir.mkdir(parents=True, exist_ok=True)
    output_path = data_dir / "funds.json"
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWritten to {output_path} ({output_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
