"""
TEFAS fon verilerini çeker → data/tefas.json yazar.

Strateji: tefasfon paketi (urazakgul/tefasfon, 49★)
  - curl_cffi ile Chrome131 TLS fingerprint taklidi → Cloudflare bot koruması geçer
  - Yeni TEFAS API endpoint'leri: /api/funds/fonGnlBlgSiraliGetir, fonGetiriBazliBilgiGetir
  - Eski /api/DB/BindHistoryInfo (ERR-006) yerine güncel API

Çıktı: data/tefas.json — src/data/api/tefasGithub.ts şemasıyla uyumlu
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sys
import traceback

try:
    from tefasfon import get_funds
    print(f"tefasfon import OK", flush=True)
except ImportError as e:
    print(f"ERROR: tefasfon yüklenmedi: {e}", file=sys.stderr)
    sys.exit(1)

import pandas as pd

OUTPUT_PATH = "data/tefas.json"

# 400 günlük pencere — 1Y getirisini hesaplayabilelim
HISTORY_DAYS = 400


def fmt_tr_date(d: datetime) -> str:
    return d.strftime("%d.%m.%Y")


def pct_change(latest: float, past: float | None) -> float | None:
    if past is None or past == 0:
        return None
    return round(((latest - past) / past) * 100, 2)


def calc_period_return(history_sorted: list[tuple[str, float]], days: int) -> float | None:
    """history: [(date_str, price), ...] sıralı, son tarihten N gün öncesi pivot."""
    if len(history_sorted) < 2:
        return None
    last_date_str, last_price = history_sorted[-1]
    target_date = datetime.strptime(last_date_str, "%Y-%m-%d") - timedelta(days=days)
    target_str = target_date.strftime("%Y-%m-%d")
    candidate = None
    for d, p in history_sorted:
        if d <= target_str:
            candidate = (d, p)
        else:
            break
    if not candidate or candidate[1] == 0:
        return None
    return round(((last_price - candidate[1]) / candidate[1]) * 100, 2)


def calc_ytd(history_sorted: list[tuple[str, float]]) -> float | None:
    if not history_sorted:
        return None
    last_date_str, last_price = history_sorted[-1]
    year = last_date_str[:4]
    for d, p in history_sorted:
        if d.startswith(year):
            if p == 0:
                return None
            return round(((last_price - p) / p) * 100, 2)
    return None


def main() -> int:
    os.makedirs("data", exist_ok=True)
    today = datetime.now(timezone.utc).replace(tzinfo=None)
    start = today - timedelta(days=HISTORY_DAYS)

    print(f"TEFAS fetch: {fmt_tr_date(start)} → {fmt_tr_date(today)}", flush=True)

    # tefasfon paketinde fund_type değerleri: SEC (Securities/yatırım) ve EMK (Emeklilik).
    # Eski tefas-crawler ile uyumluluk için YAT da dene.
    df = None
    last_err: Exception | None = None
    for ftype in ("SEC", "YAT"):
        print(f"  Deneme: get_funds(fund_type={ftype!r}, start={fmt_tr_date(start)}, end={fmt_tr_date(today)})", flush=True)
        try:
            df = get_funds(
                fund_type=ftype,
                start_date=fmt_tr_date(start),
                end_date=fmt_tr_date(today),
            )
            if df is not None and not df.empty:
                print(f"  ✓ {ftype} ile başarılı, {len(df)} satır", flush=True)
                break
            else:
                print(f"  ⚠ {ftype} boş dönüş", flush=True)
        except Exception as e:
            last_err = e
            print(f"  ✗ {ftype} hata: {type(e).__name__}: {e}", flush=True)
            traceback.print_exc()

    if df is None or df.empty:
        print(f"\n❌ TÜM fund_type değerleri başarısız", file=sys.stderr)
        if last_err:
            print(f"Son hata: {type(last_err).__name__}: {last_err}", file=sys.stderr)
        return 1

    if df is None or df.empty:
        print("❌ TEFAS boş data döndü", file=sys.stderr)
        return 1

    print(f"✓ Ham veri: {len(df)} satır, {df['fon_kodu'].nunique() if 'fon_kodu' in df.columns else '?'} farklı fon")
    print(f"  Sütunlar: {list(df.columns)[:10]}…")

    # Sütun isimlerini keşfet (paket versiyonuna göre değişebilir)
    col_code = next((c for c in ['fon_kodu', 'fonKodu', 'kod', 'code'] if c in df.columns), None)
    col_name = next((c for c in ['fon_adi', 'fonAdi', 'isim', 'name', 'title'] if c in df.columns), None)
    col_date = next((c for c in ['tarih', 'date'] if c in df.columns), None)
    col_price = next((c for c in ['fiyat', 'price', 'nav'] if c in df.columns), None)
    col_category = next((c for c in ['fon_kategorisi', 'kategori', 'category'] if c in df.columns), None)
    col_mcap = next((c for c in ['portfoy_buyuklugu', 'market_cap', 'buyukluk'] if c in df.columns), None)
    col_investors = next((c for c in ['yatirimci_sayisi', 'kisi_sayisi', 'number_of_investors'] if c in df.columns), None)
    col_shares = next((c for c in ['ted_pay_sayisi', 'pay_sayisi', 'number_of_shares'] if c in df.columns), None)

    print(f"  Algılanan: code={col_code} name={col_name} date={col_date} price={col_price}")

    if not (col_code and col_date and col_price):
        print(f"❌ Zorunlu sütunlar bulunamadı (code/date/price). Gerçek sütunlar: {list(df.columns)}", file=sys.stderr)
        return 1

    # Tarihi ISO formatına çevir
    df[col_date] = pd.to_datetime(df[col_date]).dt.strftime('%Y-%m-%d')

    # Her fon için history birleştir
    funds = []
    grouped = df.groupby(col_code)
    for code, group in grouped:
        group = group.sort_values(col_date)
        history = [(str(r[col_date]), float(r[col_price])) for _, r in group.iterrows() if pd.notna(r[col_price]) and float(r[col_price]) > 0]
        if not history:
            continue

        last_date_str, last_nav = history[-1]
        last_row = group.iloc[-1]

        returns = {
            "1w":  calc_period_return(history, 7),
            "1m":  calc_period_return(history, 30),
            "3m":  calc_period_return(history, 90),
            "6m":  calc_period_return(history, 180),
            "1y":  calc_period_return(history, 365),
            "ytd": calc_ytd(history),
        }

        funds.append({
            "code": str(code),
            "name": str(last_row.get(col_name, "") if col_name else "").strip() or str(code),
            "category": str(last_row.get(col_category, "") if col_category else "").strip(),
            "nav": last_nav,
            "date": last_date_str,
            "marketCap": float(last_row.get(col_mcap, 0) or 0) if col_mcap else None,
            "investorCount": int(last_row.get(col_investors, 0) or 0) if col_investors else None,
            "shareCount": int(last_row.get(col_shares, 0) or 0) if col_shares else None,
            "returns": returns,
            "history": [{"date": d, "price": p} for d, p in history[-30:]],
        })

    # 1-yıllık getiriye göre en yüksek üstte
    funds.sort(key=lambda f: (f["returns"].get("1y") or -9999), reverse=True)

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(funds),
        "funds": funds,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUTPUT_PATH) // 1024
    print(f"\n✅ {OUTPUT_PATH} yazıldı ({size_kb} KB, {len(funds)} fon)")
    if len(funds) == 0:
        print("❌ Hiç fon işlenemedi", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\n❌ Yakalanmamış hata: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
