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


def categorize_fund(name: str) -> str:
    """
    Fon isminden kategori çıkar — TEFAS'ın resmi kategorilerini tefasfon
    döndürmediği için isim bazlı heuristic. Çoğunluğu doğru yakalar.
    """
    n = name.upper()

    # Önce spesifik kategoriler (genel'den önce kontrol)
    if 'PARA PİYASASI' in n or 'PARA PIYASASI' in n:
        return 'Para Piyasası'
    if 'KIYMETLİ MADEN' in n or 'KIYMETLI MADEN' in n:
        return 'Kıymetli Maden'
    if 'ALTIN' in n:
        return 'Altın'
    if 'EMTİA' in n or 'EMTIA' in n:
        return 'Emtia'
    if 'GÜMÜŞ' in n or 'GUMUS' in n:
        return 'Gümüş'
    if 'KATILIM' in n:
        return 'Katılım'
    if 'BORÇLANMA' in n or 'BORCLANMA' in n or 'TAHVIL' in n or 'BONO' in n or 'EUROBOND' in n:
        return 'Borçlanma Araçları'
    if 'HİSSE SENEDİ' in n or 'HISSE SENEDI' in n or 'HİSSE' in n:
        return 'Hisse Senedi'
    if 'KARMA' in n:
        return 'Karma'
    if 'DEĞİŞKEN' in n or 'DEGISKEN' in n:
        return 'Değişken'
    if 'FON SEPETİ' in n or 'FON SEPETI' in n:
        return 'Fon Sepeti'
    if 'DÖVİZ' in n or 'DOVIZ' in n:
        return 'Döviz'
    if 'SERBEST' in n:
        return 'Serbest'
    if 'EMEKLİLİK' in n or 'EMEKLILIK' in n or 'BES' in n:
        return 'Emeklilik (BES)'
    if 'GİRİŞİM' in n or 'GIRISIM' in n or 'VENTURE' in n:
        return 'Girişim Sermayesi'
    if 'GAYRİMENKUL' in n or 'GAYRIMENKUL' in n or 'GMYO' in n:
        return 'Gayrimenkul'

    return 'Diğer'


def detect_columns(df: pd.DataFrame) -> dict[str, str | None]:
    """Sütun isimlerini paket versiyonuna göre keşfet (geniş varyant listesi)."""
    return {
        'code':       next((c for c in [
            'fon_kodu', 'fonKodu', 'fonkod', 'fonKod', 'fon_kod', 'kod', 'code',
        ] if c in df.columns), None),
        'name':       next((c for c in [
            'fon_adi', 'fonAdi', 'fon_unvan', 'fonUnvan', 'fonunvan', 'isim', 'name',
            'title', 'long_name', 'unvan', 'ad', 'tanim', 'fon_ad',
        ] if c in df.columns), None),
        'date':       next((c for c in ['tarih', 'date'] if c in df.columns), None),
        'price':      next((c for c in [
            'fiyat', 'price', 'nav', 'son_fiyat', 'birim_pay_degeri', 'bpd',
        ] if c in df.columns), None),
        'category':   next((c for c in [
            'fon_kategorisi', 'kategori', 'category', 'fon_kategori', 'fonKategori',
            'fon_kategorisi_ad', 'kategori_ad', 'category_name', 'fon_grubu',
            'semsiye_fon_turu', 'semsiye', 'umbrella',
        ] if c in df.columns), None),
        'mcap':       next((c for c in [
            'portfoy_buyuklugu', 'market_cap', 'buyukluk', 'portfoyBuyuklugu',
            'fon_portfoy_degeri', 'portfoy_degeri',
        ] if c in df.columns), None),
        'investors':  next((c for c in [
            'yatirimci_sayisi', 'kisi_sayisi', 'number_of_investors',
            'yatirimciSayisi', 'kisi', 'investor_count',
        ] if c in df.columns), None),
        'shares':     next((c for c in [
            'ted_pay_sayisi', 'pay_sayisi', 'number_of_shares', 'tedPaySayisi',
            'pay_adedi', 'share_count',
        ] if c in df.columns), None),
    }


def main() -> int:
    os.makedirs("data", exist_ok=True)
    today = datetime.now(timezone.utc).replace(tzinfo=None)

    anchors = {
        'last':  today - timedelta(days=1),
        'prev':  today - timedelta(days=2),  # günlük getiri için önceki iş günü
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
    print(f"\n📋 TÜM sütunlar: {list(snapshots['last'].columns)}", flush=True)
    print(f"📋 Algılanan eşleme: {cols}", flush=True)
    # Örnek bir satır — gerçek değerleri göster
    first_row = snapshots['last'].iloc[0].to_dict()
    print(f"📋 Örnek satır (ilk fon): {first_row}", flush=True)
    if not (cols['code'] and cols['date'] and cols['price']):
        print(f"❌ Zorunlu sütunlar (code/date/price) eksik", file=sys.stderr)
        return 1
    if not cols['name']:
        print(f"⚠️ Name sütunu bulunamadı — fonlar isim yerine kod gösterecek", file=sys.stderr)
    if not cols['category']:
        print(f"⚠️ Category sütunu bulunamadı — kategori boş gelecek", file=sys.stderr)

    # Diğer anchor'ları çek
    for key in ['prev', '1w', '1m', '3m', '6m', '1y', 'ytd']:
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
            "1d":  pct_change(latest_nav, get_past('prev')),
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

        fund_name = str(last_row.get(cols['name'], "") if cols['name'] else "").strip() or str(code)
        # Resmi kategori varsa onu kullan, yoksa isim-bazlı heuristic
        official_cat = str(last_row.get(cols['category'], "") if cols['category'] else "").strip()
        fund_category = official_cat if official_cat else categorize_fund(fund_name)
        funds.append({
            "code": str(code),
            "name": fund_name,
            "category": fund_category,
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
