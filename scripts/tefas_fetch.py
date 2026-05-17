"""
TEFAS fon verilerini çeker → data/tefas.json yazar.

Hızlı anchor-snapshot stratejisi (saatlik cron için):
  - 7 anchor tarihte (bugün, 1h/1a/3a/6a/1y önce, yılbaşı) ayrı sorgu
  - Her sorgu o günkü tüm 1000+ fonun NAV'ını döner (tefasfon get_funds)
  - Period getiri = (bugün NAV - anchor NAV) / anchor NAV × 100
  - Toplam ~7 POST, ~30-60 saniye (önceki 400 günlük all-history 18+ dk sürüyordu)

Çıktı: data/tefas.json — src/data/api/tefasGithub.ts şemasıyla uyumlu
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sys
import time
import traceback

try:
    from tefasfon import get_funds
    print("tefasfon import OK", flush=True)
except ImportError as e:
    print(f"ERROR: tefasfon yüklenmedi: {e}", file=sys.stderr)
    sys.exit(1)

import pandas as pd

OUTPUT_PATH = "data/tefas.json"


def fmt_tr_date(d: datetime) -> str:
    return d.strftime("%d.%m.%Y")


def previous_business_day(d: datetime) -> datetime:
    """Verilen tarih hafta sonuysa cuma'ya çek."""
    while d.weekday() >= 5:  # 0=Mon, 5=Sat, 6=Sun
        d -= timedelta(days=1)
    return d


def pct_change(latest: float, past: float | None) -> float | None:
    if past is None or past == 0 or latest is None:
        return None
    return round(((latest - past) / past) * 100, 2)


def fetch_snapshot(ftype: str, target_date: datetime, max_back: int = 5) -> pd.DataFrame | None:
    """Tek bir tarih için tüm fonların verisini çek; iş günü değilse 5 gün geriye dön."""
    d = previous_business_day(target_date)
    for back in range(max_back):
        try:
            df = get_funds(
                fund_type=ftype,
                start_date=fmt_tr_date(d),
                end_date=fmt_tr_date(d),
            )
            if df is not None and not df.empty:
                return df
        except Exception as e:
            print(f"    ! {fmt_tr_date(d)}: {type(e).__name__}: {e}", flush=True)
        d -= timedelta(days=1)
        d = previous_business_day(d)
    return None


def detect_columns(df: pd.DataFrame) -> dict[str, str | None]:
    """Sütun isimlerini paket versiyonuna göre keşfet."""
    return {
        'code':       next((c for c in ['fon_kodu', 'fonKodu', 'kod', 'code'] if c in df.columns), None),
        'name':       next((c for c in ['fon_adi', 'fonAdi', 'isim', 'name', 'title'] if c in df.columns), None),
        'date':       next((c for c in ['tarih', 'date'] if c in df.columns), None),
        'price':      next((c for c in ['fiyat', 'price', 'nav', 'son_fiyat'] if c in df.columns), None),
        'category':   next((c for c in ['fon_kategorisi', 'kategori', 'category'] if c in df.columns), None),
        'mcap':       next((c for c in ['portfoy_buyuklugu', 'market_cap', 'buyukluk'] if c in df.columns), None),
        'investors':  next((c for c in ['yatirimci_sayisi', 'kisi_sayisi', 'number_of_investors'] if c in df.columns), None),
        'shares':     next((c for c in ['ted_pay_sayisi', 'pay_sayisi', 'number_of_shares'] if c in df.columns), None),
    }


def main() -> int:
    os.makedirs("data", exist_ok=True)
    today = datetime.now(timezone.utc).replace(tzinfo=None)

    anchors = {
        'last':  today - timedelta(days=1),
        '1w':    today - timedelta(days=8),
        '1m':    today - timedelta(days=31),
        '3m':    today - timedelta(days=92),
        '6m':    today - timedelta(days=183),
        '1y':    today - timedelta(days=366),
        'ytd':   datetime(today.year, 1, 2),
    }

    print(f"\nAnchor tarihleri:", flush=True)
    for k, d in anchors.items():
        print(f"  {k}: {fmt_tr_date(d)}", flush=True)

    # Önce 'last' (bugün) ile fund_type doğrula — SEC önce, sonra YAT fallback
    snapshots: dict[str, pd.DataFrame] = {}
    working_ftype: str | None = None
    for ftype in ('SEC', 'YAT'):
        print(f"\nDeniyor: fund_type={ftype!r} for 'last' anchor", flush=True)
        df = fetch_snapshot(ftype, anchors['last'])
        if df is not None and not df.empty:
            print(f"  ✓ {ftype} ile başarılı: {len(df)} satır, sütunlar: {list(df.columns)[:8]}", flush=True)
            snapshots['last'] = df
            working_ftype = ftype
            break
        else:
            print(f"  ✗ {ftype} ile boş döndü", flush=True)

    if working_ftype is None or 'last' not in snapshots:
        print("\n❌ Hiçbir fund_type ile veri alınamadı", file=sys.stderr)
        return 1

    cols = detect_columns(snapshots['last'])
    print(f"\nAlgılanan sütunlar: {cols}", flush=True)
    if not (cols['code'] and cols['date'] and cols['price']):
        print(f"❌ Zorunlu sütunlar (code/date/price) eksik", file=sys.stderr)
        return 1

    # Diğer anchor'ları çek
    for key in ['1w', '1m', '3m', '6m', '1y', 'ytd']:
        print(f"\n{key} anchor çekiliyor...", flush=True)
        t0 = time.time()
        df = fetch_snapshot(working_ftype, anchors[key])
        elapsed = time.time() - t0
        if df is not None and not df.empty:
            print(f"  ✓ {key}: {len(df)} satır ({elapsed:.1f}s)", flush=True)
            snapshots[key] = df
        else:
            print(f"  ✗ {key}: veri yok ({elapsed:.1f}s)", flush=True)
            snapshots[key] = pd.DataFrame()  # boş DF, yokluğu işaretlemek için
        time.sleep(0.3)

    # Her anchor için kod → NAV map'i
    nav_maps: dict[str, dict[str, float]] = {}
    for key, df in snapshots.items():
        if df.empty:
            nav_maps[key] = {}
            continue
        code_col = cols['code']
        price_col = cols['price']
        if code_col is None or price_col is None:
            nav_maps[key] = {}
            continue
        df_clean = df[[code_col, price_col]].dropna()
        nav_maps[key] = {str(row[code_col]): float(row[price_col]) for _, row in df_clean.iterrows() if float(row[price_col]) > 0}

    last_df = snapshots['last']
    last_nav = nav_maps['last']

    funds = []
    for code, latest_nav in last_nav.items():
        # 'last' df'ten son satırı bul
        last_rows = last_df[last_df[cols['code']] == code]
        if last_rows.empty:
            continue
        last_row = last_rows.iloc[-1]

        def get_past(key: str) -> float | None:
            return nav_maps.get(key, {}).get(code)

        returns = {
            "1w":  pct_change(latest_nav, get_past('1w')),
            "1m":  pct_change(latest_nav, get_past('1m')),
            "3m":  pct_change(latest_nav, get_past('3m')),
            "6m":  pct_change(latest_nav, get_past('6m')),
            "1y":  pct_change(latest_nav, get_past('1y')),
            "ytd": pct_change(latest_nav, get_past('ytd')),
        }

        # ISO tarih
        date_val = last_row.get(cols['date'])
        try:
            iso_date = pd.to_datetime(date_val).strftime('%Y-%m-%d')
        except Exception:
            iso_date = anchors['last'].strftime('%Y-%m-%d')

        funds.append({
            "code": str(code),
            "name": str(last_row.get(cols['name'], "") if cols['name'] else "").strip() or str(code),
            "category": str(last_row.get(cols['category'], "") if cols['category'] else "").strip(),
            "nav": latest_nav,
            "date": iso_date,
            "marketCap": float(last_row.get(cols['mcap'], 0) or 0) if cols['mcap'] else None,
            "investorCount": int(last_row.get(cols['investors'], 0) or 0) if cols['investors'] else None,
            "shareCount": int(last_row.get(cols['shares'], 0) or 0) if cols['shares'] else None,
            "returns": returns,
            "history": [],  # anchor approach — full history yok; FundDetailPage canlı çeker
        })

    # 1Y getiriye göre desc sırala
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
    return 0 if funds else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\n❌ Yakalanmamış hata: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
