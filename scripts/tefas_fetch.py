"""
TEFAS fon verilerini çeker → data/tefas.json yazar.

Strateji:
  - tefas-crawler paketi (burhanyldzz/tefas-crawler) TEFAS ASP.NET session ile
    çalışır; doğrudan API çağırmaktan daha güvenilirdir
  - Tüm fon listesini POPULAR_FUNDS dışında dinamik olarak da çekmeye çalışır
  - Son 400 günlük history'den dönemsel getiri hesaplanır

Çıktı: data/tefas.json — src/data/api/tefasGithub.ts şemasıyla uyumlu
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sys
import time

try:
    from tefas import Crawler
except ImportError:
    print("ERROR: tefas-crawler yüklenmedi", file=sys.stderr)
    sys.exit(1)

import pandas as pd

OUTPUT_PATH = "data/tefas.json"

# Geniş fon evreni — tefas-crawler hepsini tek tek dener; başarısızlar atlanır.
# Kullanıcı eklemek isterse buraya ticker eklesin.
FUND_CODES = [
    # İş Portföy
    "AAL", "AAS", "AAV", "AC1", "AC4", "AC5", "AC6", "ACC", "ACD", "ACU",
    "AGC", "AHI", "AHN", "AHU", "AHV", "AIS", "AJ1", "AJK", "AK2", "AK3",
    # Ak Portföy
    "ADE", "ADP", "AED", "AES", "AEV", "AFA", "AFO", "AFS", "AFT", "AFV",
    "AKE", "AYR",
    # Garanti Portföy
    "GHF", "GAF", "GBE", "GBV", "GMR", "GO1", "GO2", "GO3", "GPF", "GPG",
    "GSP", "GTA", "GTE", "GTI", "GTL", "GTU", "GUB", "GUF", "GUH", "GUS",
    # Yapı Kredi Portföy
    "YAY", "YBS", "YHS", "YAS", "YBA", "YBE", "YBL", "YBM", "YGF", "YJK",
    "YKB", "YKO", "YKR", "YKS", "YKT", "YLT", "YOK", "YOT", "YYL", "YZC",
    # Türkiye Garanti / TLY
    "TLY", "TMG", "TPP", "TFF", "TGE", "TGY", "TI2", "TI4", "TIE", "TJZ",
    "TKF", "TMM", "TNF", "TPL", "TPZ", "TTA", "TUA", "TYH",
    # Allianz / NN / AGESA
    "AHB", "AHL", "AHT", "AHE", "AGA",
    # Diğer büyük yöneticiler
    "ABD", "ACP", "ACR", "ACS", "AFL", "AGI", "AGM", "AGN", "AHO", "AIN",
    "AJG", "AJL", "AJN", "AJP", "AJR", "AJT", "AJU", "AJV", "AKB", "AKK",
    "AKL", "AKR", "AKU", "ALC", "ALL", "ALN", "ALO", "ALS", "ALV", "AOB",
    "AOK", "AOO", "AOR", "AOS", "AOT", "AOY", "APC", "APL", "APS", "APT",
    "APV", "APY", "AQA", "AQE", "AQF", "AQG", "AQK", "AQL", "AQM", "AQN",
    "AQR", "AQS", "AQT", "AQU", "AQV", "AQY", "ARD", "ARF", "ARK", "ARM",
    "ARN", "ARO", "ARP", "ARS", "ART", "ARV", "ARW", "ARX", "ARY", "ARZ",
    # Teknoloji & sektörel popüler
    "IJC", "IIH", "BMU", "KLH", "SNY", "NTI", "BTK", "CPU", "RIH", "DVT",
    "BVV", "YIT", "CPT", "IJZ", "RTD", "GPT", "FSH", "TEJ", "ZFB", "RTG",
    # Para piyasası
    "GPS", "ICF", "IPM", "IPP",
    # BES (emeklilik fonları popüler) — fontip=YAT olduğu için bu liste belki çalışmaz
    "BHF", "BNI", "BAS", "AZP",
    # Karma / Değişken
    "MJG", "BES", "BIF", "TIF", "FYK", "FIB",
    # Kıymetli madenler
    "AFO", "GAU", "GUM", "GHA",
]

START_DATE = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
END_DATE = datetime.now().strftime("%Y-%m-%d")


def calc_return(history: list[dict], days: int) -> float | None:
    """history: [{date, price}, ...] — son tarihten N gün öncesi"""
    if not history or len(history) < 2:
        return None
    history = sorted(history, key=lambda x: x["date"])
    last = history[-1]
    target = (datetime.strptime(last["date"], "%Y-%m-%d") - timedelta(days=days)).strftime("%Y-%m-%d")
    candidate = None
    for h in history:
        if h["date"] <= target:
            candidate = h
        else:
            break
    if not candidate or candidate["price"] == 0:
        return None
    return round(((last["price"] - candidate["price"]) / candidate["price"]) * 100, 2)


def calc_ytd(history: list[dict]) -> float | None:
    if not history:
        return None
    history = sorted(history, key=lambda x: x["date"])
    last = history[-1]
    year_prefix = last["date"][:4]
    for h in history:
        if h["date"].startswith(year_prefix):
            if h["price"] == 0:
                return None
            return round(((last["price"] - h["price"]) / h["price"]) * 100, 2)
    return None


def fetch_fund(crawler: Crawler, code: str) -> dict | None:
    try:
        df = crawler.fetch(start=START_DATE, end=END_DATE, name=code)
        if df is None or df.empty:
            return None
    except Exception as e:
        print(f"  ! {code}: {e}", file=sys.stderr)
        return None

    df = df.sort_values("date")
    history = [
        {"date": str(row["date"])[:10], "price": float(row["price"])}
        for _, row in df.tail(120).iterrows()
        if pd.notna(row.get("price"))
    ]
    if not history:
        return None

    last_row = df.iloc[-1]
    return {
        "code": code,
        "name": str(last_row.get("title", "")).strip() or code,
        "category": str(last_row.get("fon_kategorisi") or last_row.get("title_full") or "").strip(),
        "nav": float(last_row["price"]),
        "date": str(last_row["date"])[:10],
        "marketCap": float(last_row.get("market_cap") or 0) or None,
        "investorCount": int(last_row.get("number_of_investors") or 0) or None,
        "shareCount": int(last_row.get("number_of_shares") or 0) or None,
        "returns": {
            "1w":  calc_return(history, 7),
            "1m":  calc_return(history, 30),
            "3m":  calc_return(history, 90),
            "6m":  calc_return(history, 180),
            "ytd": calc_ytd(history),
            "1y":  calc_return(history, 365),
        },
        "history": history[-30:],
    }


def main() -> int:
    os.makedirs("data", exist_ok=True)
    crawler = Crawler()
    seen: set[str] = set()
    funds: list[dict] = []
    failed: list[str] = []

    for code in FUND_CODES:
        if code in seen:
            continue
        seen.add(code)
        data = fetch_fund(crawler, code)
        if data:
            funds.append(data)
            r = data["returns"]
            print(f"  ✓ {code}: NAV={data['nav']:.4f}  1A={r.get('1m')}%  1Y={r.get('1y')}%")
        else:
            failed.append(code)
        time.sleep(0.3)  # nezaket aralığı

    print(f"\nOK: {len(funds)} / FAIL: {len(failed)}")

    # En yüksek 1-yıllık getiriye göre sırala (frontend zaten sıralıyor ama burada da yapalım)
    funds.sort(key=lambda f: (f["returns"].get("1y") or -9999), reverse=True)

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(funds),
        "funds": funds,
        "failed": failed,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUTPUT_PATH) // 1024
    print(f"\n✅ {OUTPUT_PATH} yazıldı ({size_kb} KB, {len(funds)} fon)")

    if len(funds) == 0:
        print("❌ Hiç fon alınamadı — tefas-crawler ile TEFAS arasındaki bağlantı kopuk olabilir", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
