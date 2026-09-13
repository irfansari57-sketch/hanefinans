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
import requests

OUTPUT_PATH = "data/tefas.json"

# ============================================================================
# TEFAS resmi "isleme acik fonlar" listesi - tek noktadan toptan cozum.
# ============================================================================
#
# Heuristic (isim/kategori bazli) yetersiz: yeni bir banka ozel "PAYLASIMLI HESAP"
# veya "NEO FON" turu cikinca otomatik yakalanamaz.
#
# Cozum: TEFAS'in kendi "Fon Karsilastirma" sayfasi tum platformda islem goren
# fonlari donduren bir POST endpoint sunar. Bu listeyi bir kere ceker, set'e
# koyarız. Listede yoksa fon TEFAS'a kapalidir.
#
# Endpoint: POST https://www.tefas.gov.tr/api/DB/BindComparisonFundReturns
# Parametreler:
#   - calismatipi=1     -> "TEFAS'ta Islem Goren" filter (resmi tanim)
#   - fontip=YAT        -> Yatirim Fonu kategorisi (BES disinda)
#   - bastarih,bittarih -> Bugun
#   - strperiod         -> Donem getirileri (kullanmiyoruz, sadece liste icin)

_OPEN_CODES_CACHE: "set[str] | None" = None
_OPEN_CODES_FETCH_ATTEMPTED = False


def fetch_tefas_open_codes() -> "set[str]":
    """Takasbank'in TEFAS Yatirim Fonlari Excel'inden TEFAS'ta islem goren tum
    YAT fon kodlarini doner. Takasbank TEFAS'i isleten kurum oldugu icin bu liste
    OTORITER: bir fon listede ise TEFAS'ta islem gorur, yoksa gormez.

    Takasbank.com.tr farkli bir altyapida calistigi icin tefas.gov.tr'nin bot
    korumasindan etkilenmez. Tek HTTP istegi (~150-300 KB xlsx).

    Hata durumunda bos set doner -> caller bir sonraki katmana (heuristic) duser.
    """
    # openpyxl pandas dependency'si olarak GitHub Actions runner'da kurulu
    try:
        import io
        import openpyxl
    except ImportError as e:
        print(
            f"[fetch_tefas_open_codes] HATA: openpyxl import yok ({e}) - heuristic fallback",
            file=sys.stderr,
            flush=True,
        )
        return set()

    url = (
        "https://www.takasbank.com.tr/plugins/"
        "ExcelExportTefasFundsTradingInvestmentPlatform?language=tr"
    )
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }

    # curl_cffi ile chrome131 impersonation (Takasbank bot protection icin yedek).
    # Once duz requests dene; 403/401 alirsa curl_cffi'a dus.
    response_content = None
    try:
        r = requests.get(url, headers=headers, timeout=30)
        if r.status_code == 200:
            response_content = r.content
        else:
            print(
                f"[fetch_tefas_open_codes] requests {r.status_code} - curl_cffi'a dusuluyor",
                flush=True,
            )
    except Exception as e:
        print(f"[fetch_tefas_open_codes] requests basarisiz ({e}) - curl_cffi'a dusuluyor", flush=True)

    if response_content is None:
        try:
            from curl_cffi import requests as cr
            session = cr.Session(impersonate="chrome131")
            r2 = session.get(url, headers=headers, timeout=30)
            r2.raise_for_status()
            response_content = r2.content
            print("[fetch_tefas_open_codes] curl_cffi ile basarili", flush=True)
        except Exception as e:
            print(
                f"[fetch_tefas_open_codes] curl_cffi de basarisiz: {type(e).__name__}: {e}",
                file=sys.stderr,
                flush=True,
            )

    # LAST RESORT: repo'daki cache JSON (data/tefas-open-codes.json)
    # Hem Takasbank hem curl_cffi fail olursa bu liste devreye girer.
    # Bu dosya manuel guncellenir (Takasbank Excel'inden cikarilir).
    if response_content is None:
        cache_path = "data/tefas-open-codes.json"
        try:
            with open(cache_path, encoding="utf-8") as f:
                cache_data = json.load(f)
            cache_codes = set(str(c).strip().upper() for c in cache_data.get("codes", []))
            if cache_codes:
                print(
                    f"[fetch_tefas_open_codes] Cache JSON'dan yukleniyor "
                    f"({cache_data.get('updatedAt', 'tarih yok')}): {len(cache_codes)} fon",
                    flush=True,
                )
                for chk in ("EKL", "AAL", "ZA2", "KHP", "KFZ", "CPU", "YHK"):
                    in_list = chk in cache_codes
                    print(f"[fetch_tefas_open_codes] (cache) {chk} listede mi? {in_list}", flush=True)
                return cache_codes
        except Exception as e:
            print(
                f"[fetch_tefas_open_codes] Cache JSON da yok ({e}) - heuristic fallback",
                file=sys.stderr,
                flush=True,
            )
        return set()

    try:
        wb = openpyxl.load_workbook(
            io.BytesIO(response_content), read_only=True, data_only=True,
        )
        ws = wb.active
        codes: set[str] = set()
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0:
                continue  # Header satiri (Fon Adi, Fon Kodu)
            # Sema: row[0]=Fon Adi, row[1]=Fon Kodu - kod 2. kolonda
            if len(row) >= 2:
                code = row[1]
                if code and isinstance(code, str):
                    codes.add(code.strip().upper())
                elif code is not None:
                    codes.add(str(code).strip().upper())
        if not codes:
            raise ValueError("Excel parse 0 kod cikardi - cache fallback")
        print(
            f"[fetch_tefas_open_codes] Takasbank TEFAS listesi: {len(codes)} fon",
            flush=True,
        )
        if codes:
            sample = sorted(codes)[:5]
            print(f"[fetch_tefas_open_codes] Ornek kodlar: {sample}", flush=True)
            for chk in ("EKL", "AAL", "ZA2", "KHP", "KFZ", "CPU", "YHK", "TLY"):
                in_list = chk in codes
                print(f"[fetch_tefas_open_codes] {chk} listede mi? {in_list}", flush=True)
        return codes
    except Exception as e:
        # Excel parse fail (HTML hata sayfasi vs.) - cache JSON'a dus
        print(
            f"[fetch_tefas_open_codes] Excel parse hatasi ({type(e).__name__}: {e}) - cache JSON deneniyor",
            file=sys.stderr,
            flush=True,
        )
        cache_path = "data/tefas-open-codes.json"
        try:
            with open(cache_path, encoding="utf-8") as cf:
                cache_data = json.load(cf)
            cache_codes = set(str(c).strip().upper() for c in cache_data.get("codes", []))
            if cache_codes:
                print(
                    f"[fetch_tefas_open_codes] (excel fail) Cache JSON: "
                    f"{len(cache_codes)} fon ({cache_data.get('updatedAt', '?')})",
                    flush=True,
                )
                for chk in ("EKL", "AAL", "ZA2", "KHP", "KFZ", "CPU", "YHK", "TLY"):
                    print(f"[fetch_tefas_open_codes] (cache) {chk} listede mi? {chk in cache_codes}", flush=True)
                return cache_codes
        except Exception as ce:
            print(f"[fetch_tefas_open_codes] Cache JSON da fail ({ce})", file=sys.stderr, flush=True)
        return set()


def get_open_codes() -> "set[str]":
    """Cached accessor - ilk cagrida fetch, sonrasinda set."""
    global _OPEN_CODES_CACHE, _OPEN_CODES_FETCH_ATTEMPTED
    if not _OPEN_CODES_FETCH_ATTEMPTED:
        _OPEN_CODES_FETCH_ATTEMPTED = True
        _OPEN_CODES_CACHE = fetch_tefas_open_codes()
    return _OPEN_CODES_CACHE or set()


def fmt_tr_date(d: datetime) -> str:
    return d.strftime("%d.%m.%Y")


def previous_business_day(d: datetime) -> datetime:
    """Verilen tarih hafta sonuysa cuma'ya çek (verilen tarih iş günüyse aynen döner)."""
    while d.weekday() >= 5:  # 0=Mon, 5=Sat, 6=Sun
        d -= timedelta(days=1)
    return d


def strictly_prior_business_day(d: datetime) -> datetime:
    """Verilen tarihten KESİNLİKLE önceki iş günü.
    Cuma verilirse Perşembe, Pazartesi verilirse Cuma, Pazar verilirse Cuma'dan
    bir önceki iş günü (Perşembe) döner. 1d/1w anchor'ları için kritik —
    aksi halde Pazar günü last=Cuma, prev=Cuma aynı çıkıyor → fark=0.
    """
    d = d - timedelta(days=1)
    return previous_business_day(d)


_ALLOCATION_SESSION = None


def _get_alloc_session():
    """curl_cffi Session (chrome131 impersonation) - TEFAS bot korumasi asma icin.
    GitHub Actions IP'lerinden requests kutuphanesi ile timeout aliyoruz, curl_cffi
    chrome imitasyonu ile calisan bir session olusturup reuse ediyoruz."""
    global _ALLOCATION_SESSION
    if _ALLOCATION_SESSION is None:
        try:
            from curl_cffi import requests as cr
            _ALLOCATION_SESSION = cr.Session(impersonate="chrome131")
            print("[allocation] curl_cffi session (chrome131) hazir", flush=True)
        except ImportError:
            print("[allocation] curl_cffi YOK - requests fallback", file=sys.stderr, flush=True)
            _ALLOCATION_SESSION = False  # tekrar denememek icin flag
    return _ALLOCATION_SESSION if _ALLOCATION_SESSION else None


def fetch_fund_allocation(code: str, timeout: int = 30) -> "list[dict] | None":
    """TEFAS'in BindFonPortfoyDagilimi endpoint'inden fon varlik dagilimini ceker.

    POST https://www.tefas.gov.tr/api/DB/BindFonPortfoyDagilimi
    Body: fonkodu=STI (form-encoded)
    Response: [{"VARLIK_ADI": "Hisse Senedi", "ORAN": 59.03}, ...]

    curl_cffi (chrome131 impersonation) kullanir — GitHub Actions'tan direkt requests
    ile timeout aliniyordu, TLS fingerprint korumasi. 30s timeout uzun tolerans.
    """
    session = _get_alloc_session()
    headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': f'https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod={code.strip().upper()}',
        'Origin': 'https://www.tefas.gov.tr',
        'X-Requested-With': 'XMLHttpRequest',
    }
    try:
        if session:
            r = session.post(
                'https://www.tefas.gov.tr/api/DB/BindFonPortfoyDagilimi',
                data={'fonkodu': code.strip().upper()},
                headers=headers,
                timeout=timeout,
            )
        else:
            r = requests.post(
                'https://www.tefas.gov.tr/api/DB/BindFonPortfoyDagilimi',
                data={'fonkodu': code.strip().upper()},
                headers={
                    **headers,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                },
                timeout=timeout,
            )
        if r.status_code != 200:
            return None
        data = r.json()
        if not isinstance(data, list) or len(data) == 0:
            return None
        # Format: [{"VARLIK_ADI": "...", "ORAN": 0.0}, ...]
        result = []
        for item in data:
            if not isinstance(item, dict):
                continue
            label = str(item.get('VARLIK_ADI') or item.get('varlik_adi') or '').strip()
            oran = item.get('ORAN') or item.get('oran')
            try:
                pct = float(oran) if oran is not None else None
            except (ValueError, TypeError):
                pct = None
            if label and pct is not None and pct > 0:
                result.append({'label': label, 'pct': pct})
        # % desc siraliyalim - en buyuk ilk
        result.sort(key=lambda x: x['pct'], reverse=True)
        return result if result else None
    except Exception as e:
        print(f"[allocation] {code} fetch fail: {type(e).__name__}: {e}", file=sys.stderr)
        return None


def pct_change(latest: float, past: float | None) -> float | None:
    if past is None or past == 0 or latest is None:
        return None
    return round(((latest - past) / past) * 100, 2)


def fetch_snapshot(ftype: str, target_date: datetime, max_back: int = 5) -> pd.DataFrame | None:
    """Tek bir tarih için tüm fonların verisini çek; iş günü değilse max_back gün geriye dön.
    Long-term anchorlar (3m/6m/1y/ytd) için max_back=20 ile çağırın — uzun tatil/bayramları
    kapsasın. Aksi halde 1994 fonun 3m kolonu hep null gelir."""
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


def fetch_history_range(ftype: str, end_date: datetime, days_back: int = 14) -> pd.DataFrame | None:
    """
    Range fetch — son N is gunu icin tum fonlarin gunluk NAV history'sini tek call'da cek.
    Anchor approach yerine bunu kullanarak 1d/1w'yi guvenilir hesapla + history field'ini doldur.
    """
    end = previous_business_day(end_date)
    # Takvim olarak 14*1.5 = 21 gun geriye git ki hafta sonu ve tatilleri kapsayabilelim
    start = end - timedelta(days=int(days_back * 1.6))
    start = previous_business_day(start)
    try:
        df = get_funds(
            fund_type=ftype,
            start_date=fmt_tr_date(start),
            end_date=fmt_tr_date(end),
        )
        if df is not None and not df.empty:
            return df
    except Exception as e:
        print(f"    ! history range {fmt_tr_date(start)}-{fmt_tr_date(end)}: {type(e).__name__}: {e}", flush=True)
    return None


def is_tefas_open(name: str, category: str, code: str = '', tefas_status_value=None) -> bool:
    """Fonun TEFAS uzerinden alinip alinamayacagini doner.

    KARAR MANTIGI (sirali, en kesin -> en zayif):
      0. EN ONCELIK: tefasfon DataFrame'den dogrudan gelen 'TEFAS durumu' alani
         (varsa). Tek tek isim yakalamaya gerek kalmaz, TEFAS'in resmi statusudur.
      1. TEFAS resmi BindComparisonFundReturns endpoint listesi (cron baslangici)
      2. FALLBACK: isim/kategori heuristic
    """
    # 0) EN ONCELIK - tefasfon DataFrame'den gelen direkt status
    if tefas_status_value is not None:
        s = str(tefas_status_value).strip().upper()
        # Bos / nan / None kontrolu
        if s and s not in ('NAN', 'NONE', 'NULL'):
            # Pozitif (TEFAS'ta acik)
            if s in ('ACIK', 'AÇIK', 'AKTIF', 'AKTİF', 'TRUE', '1',
                     'YES', 'EVET', 'ISLEMDE', 'İŞLEMDE', 'I', 'İ'):
                return True
            # Negatif (TEFAS'ta kapali)
            if s in ('KAPALI', 'PASIF', 'PASİF', 'FALSE', '0',
                     'NO', 'HAYIR', 'K', 'P'):
                return False
            # Bilinmeyen ifade -> bir sonraki kademeye dus

    # 1) TEFAS resmi liste (BindComparisonFundReturns)
    open_codes = get_open_codes()
    if open_codes:
        return (code or '').strip().upper() in open_codes

    # 2) FALLBACK - MINIMAL heuristic
    # KALDIRILAN kalıplar: SERBEST/SEPET/PAYLASIM/OZEL/YABANCI MENKUL/
    # NITELIKLI YATIRIMCI/GARANTILI/KORUMA AMACLI. Takasbank otorite listesinde
    # bu kelimeleri iceren onlarca gercek TEFAS-acik fon var (TLY/CAH/AUV/BS1).
    # KALAN kalıplar (gercekten TEFAS sistemi disi):
    #   - EMEKLILIK (BES) - BEFAS'tan alinir
    #   - GIRISIM SERMAYESI YF + GAYRIMENKUL YF - nitelikli yatirimci
    n = (name or '').upper()
    c = (category or '').upper()

    if 'EMEKLİLİK' in n or 'EMEKLILIK' in n:
        return False
    if 'EMEKLİLİK' in c or 'EMEKLILIK' in c:
        return False
    # 8: Girisim sermayesi + Gayrimenkul
    if 'GİRİŞİM SERMAYESİ' in n or 'GIRISIM SERMAYESI' in n:
        return False
    if 'GAYRİMENKUL YATIRIM' in n or 'GAYRIMENKUL YATIRIM' in n:
        return False
    if 'GAYRİMENKUL' in c or 'GAYRIMENKUL' in c:
        return False

    return True


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
            'portfoyBuyukluk',  # tefasfon 0.x son sürümü bu isimle donuyor (u eksik)
            'fon_portfoy_degeri', 'portfoy_degeri',
        ] if c in df.columns), None),
        'investors':  next((c for c in [
            'yatirimci_sayisi', 'kisi_sayisi', 'number_of_investors',
            'yatirimciSayisi', 'kisiSayisi',  # tefasfon 0.x son sürümü
            'kisi', 'investor_count',
        ] if c in df.columns), None),
        'shares':     next((c for c in [
            'ted_pay_sayisi', 'pay_sayisi', 'number_of_shares', 'tedPaySayisi',
            'pay_adedi', 'share_count',
        ] if c in df.columns), None),
        # TEFAS islem durumu — tefasfon paketi gerek varsa donduruyor.
        # Olasi isimler: tefas_durumu, TEFASDurumu, islem_durumu, durum,
        # platform_durumu, tefasIslemDurumu, alimDurumu, satimDurumu, alim_satim.
        # Geniş bir liste arayalim; bulunursa toptan TEFAS Acik/Kapali kararini
        # heuristic yerine bu kolondan veririz.
        'tefas_status': next((c for c in df.columns if any(
            kw in c.lower().replace('_', '').replace(' ', '')
            for kw in ('tefasdurumu', 'tefasislem', 'islemdurumu', 'platformdurumu',
                       'alimdurumu', 'alimsatim', 'fonisleme', 'tefasacik')
        )), None),
    }


def main() -> int:
    os.makedirs("data", exist_ok=True)
    today = datetime.now(timezone.utc).replace(tzinfo=None)

    # 'last' anchor: son yayınlanan iş günü NAV (Pazar→Cuma, Pazartesi→Cuma).
    last_anchor = previous_business_day(today - timedelta(days=1))

    anchors = {
        'last':  last_anchor,
        # 'prev' = last_anchor'dan KESİN bir iş günü önce (Cuma → Perşembe).
        # Önceden today - timedelta(days=2) idi; Pazar günü last ve prev aynı Cuma'ya
        # çekiliyordu → 1d = 0. Şimdi garanti farklı bir iş günü.
        'prev':  strictly_prior_business_day(last_anchor),
        # '1w' = last_anchor'dan 7 takvim günü önceki iş günü
        '1w':    previous_business_day(last_anchor - timedelta(days=7)),
        '1m':    today - timedelta(days=31),
        '3m':    today - timedelta(days=92),
        '6m':    today - timedelta(days=183),
        '1y':    today - timedelta(days=366),
        'ytd':   datetime(today.year, 1, 2),
    }

    print(f"\nAnchor tarihleri:", flush=True)
    for k, d in anchors.items():
        print(f"  {k}: {fmt_tr_date(d)} (weekday={d.weekday()})", flush=True)

    # Önce 'last' (bugün) ile fund_type doğrula — SEC önce, sonra YAT fallback
    snapshots: dict[str, pd.DataFrame] = {}
    working_ftype: str | None = None
    for ftype in ('SEC', 'YAT'):
        print(f"\nDeniyor: fund_type={ftype!r} for 'last' anchor", flush=True)
        df = fetch_snapshot(ftype, anchors['last'])
        if df is not None and not df.empty:
            print(f"  ✓ {ftype} ile başarılı: {len(df)} satır", flush=True)
            print(f"  DEBUG: TUM kolonlar ({len(df.columns)} adet) = {list(df.columns)}", flush=True)
            tefas_like = [c for c in df.columns if any(
                kw in c.lower().replace('_', '').replace(' ', '')
                for kw in ('tefas','durum','islem','platform','alim','satim')
            )]
            print(f"  DEBUG: TEFAS/durum iceren kolonlar = {tefas_like}", flush=True)
            if tefas_like and len(df) > 0:
                # Ornek deger goster
                sample = df[tefas_like].iloc[0].to_dict()
                print(f"  DEBUG: Ilk satir TEFAS-iliskli degerler = {sample}", flush=True)
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

    # Uzun donem anchor'lari + prev + 1w (history range desteklenmediği için
    # her zaman snapshot anchor approach'la fetch et — 1d=0 ve 1w=null sorununun
    # asıl çözümü bu).
    # max_back dinamik: kisa-vadeli icin 5 yeter, uzun-vadeli icin 20 (tatil/bayram
    # kapsasin). Onceden hepsi 5'ti -> 3m/ytd hep null geliyordu.
    max_back_by_key = {
        'prev': 5, '1w': 7, '1m': 10,
        '3m': 20, '6m': 20, '1y': 25, 'ytd': 20,
    }
    for key in ['prev', '1w', '1m', '3m', '6m', '1y', 'ytd']:
        print(f"\n{key} anchor çekiliyor (max_back={max_back_by_key.get(key, 5)})...", flush=True)
        t0 = time.time()
        df = fetch_snapshot(working_ftype, anchors[key], max_back=max_back_by_key.get(key, 5))
        elapsed = time.time() - t0
        if df is not None and not df.empty:
            print(f"  ✓ {key}: {len(df)} satır ({elapsed:.1f}s)", flush=True)
            snapshots[key] = df
        else:
            print(f"  ✗ {key}: veri yok ({elapsed:.1f}s)", flush=True)
            snapshots[key] = pd.DataFrame()
        time.sleep(0.3)

    # Son ~14 ay (400 gun) history RANGE fetch — hem 1d/1w hem simulator icin uzun history
    # 400 gun = ~13 ay: kullanicilar 6-12 aylik backtest yapabilir. TEFAS tek call'da
    # 400+ gun destekliyor. File size etkisi: ~1-2 MB gzipped (kabul edilebilir CDN).
    # Fallback: 400 fail olursa 90'a, 90 fail olursa 14'e dus.
    HISTORY_DAYS_TRY = [400, 90, 14]
    print(f"\nHistory range cekiliyor (hedef: {HISTORY_DAYS_TRY[0]} gun)...", flush=True)
    t0 = time.time()
    history_df = None
    for db in HISTORY_DAYS_TRY:
        try:
            history_df = fetch_history_range(working_ftype, anchors['last'], days_back=db)
            if history_df is not None and not history_df.empty:
                print(f"  ✓ {db} gun history basarili", flush=True)
                break
        except Exception as e:
            print(f"  ! {db} gun history fail: {type(e).__name__}: {e} — daha kisa deneniyor", flush=True)
            history_df = None
    elapsed = time.time() - t0
    if history_df is not None and not history_df.empty:
        print(f"  ✓ history range: {len(history_df)} satır ({elapsed:.1f}s)", flush=True)
    else:
        print(f"  ✗ history range: veri yok / paket desteklemiyor ({elapsed:.1f}s) — prev/1w zaten ana akışta çekildi", flush=True)
        history_df = pd.DataFrame()
        # NOT: prev ve 1w artık ana anchor loop'ta çekiliyor — eski fallback
        # kaldırıldı. Aşağıdaki for [('prev', 2)...] bloğu sadece overwrite olmasın
        # diye boş tutuluyor.
        for key, days_back_val in [('_skip_', 2), ('_skip_', 8)]:
            t0 = time.time()
            anchor_date = today - timedelta(days=days_back_val)
            df = fetch_snapshot(working_ftype, anchor_date)
            elapsed = time.time() - t0
            if df is not None and not df.empty:
                print(f"  ✓ {key}: {len(df)} satır ({elapsed:.1f}s)", flush=True)
                snapshots[key] = df
            else:
                snapshots[key] = pd.DataFrame()
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

    # History df'yi kod -> [(date, price), ...] dict'e cevir (sıralı)
    history_by_code: dict[str, list[tuple[str, float]]] = {}
    if not history_df.empty and cols['code'] and cols['date'] and cols['price']:
        try:
            for _, row in history_df.iterrows():
                code = str(row[cols['code']])
                try:
                    iso = pd.to_datetime(row[cols['date']]).strftime('%Y-%m-%d')
                    price = float(row[cols['price']])
                except Exception:
                    continue
                if price <= 0:
                    continue
                history_by_code.setdefault(code, []).append((iso, price))
            # Her kod icin tarihe gore sirala (eski → yeni)
            for code in history_by_code:
                history_by_code[code].sort(key=lambda x: x[0])
        except Exception as e:
            print(f"  ⚠️ history parsing hatası: {e}", flush=True)

    funds = []
    for code, latest_nav in last_nav.items():
        # 'last' df'ten son satırı bul
        last_rows = last_df[last_df[cols['code']] == code]
        if last_rows.empty:
            continue
        last_row = last_rows.iloc[-1]

        def get_past(key: str) -> float | None:
            return nav_maps.get(key, {}).get(code)

        # History'den 1d ve 1w hesabi (oncelik) — anchor approach guvenilmez (hafta sonu collapse)
        hist = history_by_code.get(code, [])
        # 1d: history'den son 2 nokta, yoksa anchor 'prev'
        h_1d = None
        if len(hist) >= 2:
            h_1d = pct_change(hist[-1][1], hist[-2][1])
        if h_1d is None:
            h_1d = pct_change(latest_nav, get_past('prev'))
        # 1w: history'den 7+ gun once, yoksa anchor '1w'
        h_1w = None
        if len(hist) >= 2:
            last_date_str = hist[-1][0]
            try:
                last_date = datetime.strptime(last_date_str, '%Y-%m-%d')
                target = last_date - timedelta(days=7)
                best = None
                for d, p in hist[:-1]:
                    try:
                        if datetime.strptime(d, '%Y-%m-%d') <= target:
                            best = p
                    except Exception:
                        continue
                if best is not None:
                    h_1w = pct_change(hist[-1][1], best)
            except Exception:
                pass
        if h_1w is None:
            h_1w = pct_change(latest_nav, get_past('1w'))

        returns = {
            "1d":  h_1d,
            "1w":  h_1w,
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
        # History array — frontend fallback'i besler, FundDetailPage chart kullanir
        history_arr = [
            {"date": d, "price": p} for d, p in hist
        ]

        funds.append({
            "code": str(code),
            "name": fund_name,
            "category": fund_category,
            "tefasOpen": is_tefas_open(
                fund_name, fund_category, str(code),
                tefas_status_value=(last_row.get(cols['tefas_status'])
                                    if cols.get('tefas_status') else None),
            ),
            "nav": latest_nav,
            "date": iso_date,
            "marketCap": float(last_row.get(cols['mcap'], 0) or 0) if cols['mcap'] else None,
            "investorCount": int(last_row.get(cols['investors'], 0) or 0) if cols['investors'] else None,
            "shareCount": int(last_row.get(cols['shares'], 0) or 0) if cols['shares'] else None,
            "returns": returns,
            "history": history_arr,
            # allocation asagida top-N icin doldurulacak
            "allocation": None,
        })

    # 1Y getiriye göre desc sırala
    funds.sort(key=lambda f: (f["returns"].get("1y") or -9999), reverse=True)

    # ---------- Allocation fetch (top N by marketCap + tefasOpen) ----------
    # TEFAS BindFonPortfoyDagilimi endpoint'i her fon icin ayri POST — rate limit
    # koruma icin sadece TEFAS'a acik + market cap'i buyuk fonlara sinirlariz.
    # Kucuk fonlar Worker fallback kaldi (dinamik fetch), buradan allocation almaz.
    ALLOC_TOP_N = int(os.environ.get('TEFAS_ALLOC_TOP_N', '500'))
    ALLOC_DELAY_MS = int(os.environ.get('TEFAS_ALLOC_DELAY_MS', '300'))
    # marketCap kolonu tefasfon'dan gelmiyor (hep null) — shareCount * nav ile
    # yaklasik portfoy buyuklugu hesapla, buna gore sirala.
    def _size_proxy(f: dict) -> float:
        mc = f.get('marketCap')
        if mc and mc > 0:
            return float(mc)
        sc = f.get('shareCount') or 0
        nav = f.get('nav') or 0
        try:
            return float(sc) * float(nav)
        except (ValueError, TypeError):
            return 0.0
    alloc_candidates = [f for f in funds if f.get('tefasOpen')]
    alloc_candidates.sort(key=_size_proxy, reverse=True)
    alloc_targets = alloc_candidates[:ALLOC_TOP_N]
    print(f"[allocation] {len(alloc_candidates)} tefasOpen aday -> top {len(alloc_targets)} secildi", flush=True)
    print(f"\n[allocation] {len(alloc_targets)} fon icin varlik dagilimi cekiliyor...", flush=True)
    alloc_ok, alloc_fail = 0, 0
    for i, f in enumerate(alloc_targets):
        alloc = fetch_fund_allocation(f['code'])
        if alloc:
            f['allocation'] = alloc
            alloc_ok += 1
        else:
            alloc_fail += 1
        # Rate limit protection
        time.sleep(ALLOC_DELAY_MS / 1000.0)
        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(alloc_targets)} — ok:{alloc_ok} fail:{alloc_fail}", flush=True)
    print(f"[allocation] Tamamlandi: {alloc_ok} basarili, {alloc_fail} basarisiz", flush=True)

    # ---------- BES (BEFAS) fetch — 3 strateji sirayla ----------
    # 1. TAKASBANK BEFAS Excel (fon listesi: kod + isim + ihraccı) — TEFAS Excel
    #    ile ayni pattern, kesin calisir (biz TEFAS ac.k kodlari icin de kullaniyoruz)
    # 2. TEFAS BindComparisonFundReturns (calismatipi=2, fontip=EMK) — toplu fiyat+getiri
    # 3. Ikisi de fail -> statik empty
    # Strateji 1 fon listesini garantiler; 2 fiyat/getirileri getirir. 2 fail olursa
    # sadece kod+isim ile listelemis oluruz (kullanici en azindan fon adlarini gorur).
    print(f"\n[bes] Adim 1: TAKASBANK BEFAS Excel indiriliyor...", flush=True)
    bes_fund_list: list[dict] = []
    try:
        befas_excel_url = (
            "https://www.takasbank.com.tr/plugins/"
            "ExcelExportBefasFundsTradingInvestmentPlatform?language=tr"
        )
        excel_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "*/*",
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        }
        excel_content = None
        try:
            r_excel = requests.get(befas_excel_url, headers=excel_headers, timeout=30)
            if r_excel.status_code == 200:
                excel_content = r_excel.content
        except Exception as e:
            print(f"[bes] Takasbank requests fail: {e}", flush=True)
        # Fallback curl_cffi
        if excel_content is None:
            try:
                from curl_cffi import requests as cr
                session = cr.Session(impersonate="chrome131")
                r_excel = session.get(befas_excel_url, headers=excel_headers, timeout=30)
                if r_excel.status_code == 200:
                    excel_content = r_excel.content
            except Exception as e:
                print(f"[bes] Takasbank curl_cffi fail: {e}", flush=True)
        if excel_content:
            try:
                import io, openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(excel_content), read_only=True, data_only=True)
                ws = wb.active
                for i, row in enumerate(ws.iter_rows(values_only=True)):
                    if i == 0:
                        continue  # header
                    if len(row) < 2:
                        continue
                    # BEFAS Excel format: [Fon Adi, Fon Kodu, ...] veya [Fon Kodu, Fon Adi, ...]
                    # Genelde row[1]=kod, row[0]=isim (TEFAS pattern ayni)
                    fund_name = row[0]
                    fund_code = row[1] if len(row) > 1 else None
                    if not fund_code or not isinstance(fund_code, str):
                        # bazen sirasi ters olabilir
                        if isinstance(fund_name, str) and len(fund_name.strip()) == 3:
                            fund_code = fund_name
                            fund_name = row[1] if len(row) > 1 else fund_code
                    if fund_code and isinstance(fund_code, str):
                        code = fund_code.strip().upper()
                        name = str(fund_name or code).strip()
                        # Ihraccı: isimden cikar (genelde "AK EMEKLİLİK...", "AVIVASA EMEKLİLİK...")
                        issuer = name.split(' ')[0].title() if name else ''
                        bes_fund_list.append({'code': code, 'name': name, 'issuer': issuer})
                print(f"[bes] Takasbank BEFAS Excel: {len(bes_fund_list)} fon", flush=True)
            except Exception as e:
                print(f"[bes] Excel parse fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        else:
            print(f"[bes] Takasbank BEFAS Excel indirilemedi", flush=True)
    except Exception as e:
        print(f"[bes] BEFAS Excel fetch exception: {e}", file=sys.stderr, flush=True)

    # Adim 2: TEFAS BindComparisonFundReturns ile fiyat+getiri (opsiyonel)
    print(f"[bes] Adim 2: TEFAS BindComparisonFundReturns (BEFAS/EMK) fiyat+getiri...", flush=True)
    bes_added = 0
    try:
        bittarih = anchors['last'].strftime('%d.%m.%Y')
        bastarih = (anchors['last'] - timedelta(days=1)).strftime('%d.%m.%Y')
        bes_payload = {
            'calismatipi': '2',
            'fontip': 'EMK',
            'bastarih': bastarih,
            'bittarih': bittarih,
            'strperiod': '1,1,1,1,1,1,1',
            'islemdurum': '1',
            'fongrup': '',
            'kurucukod': '',
            'fonturkod': '',
            'fonunvantip': '',
        }
        bes_headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Referer': 'https://www.tefas.gov.tr/FonKarsilastirma.aspx',
            'Origin': 'https://www.tefas.gov.tr',
            'X-Requested-With': 'XMLHttpRequest',
        }
        bes_url = 'https://www.tefas.gov.tr/api/DB/BindComparisonFundReturns'
        bes_data = None
        # curl_cffi chrome131 impersonation - TEFAS bot koruma
        try:
            from curl_cffi import requests as cr
            with cr.Session(impersonate="chrome131") as session:
                r = session.post(bes_url, data=bes_payload, headers=bes_headers, timeout=60)
                if r.status_code == 200:
                    bes_data = r.json()
                else:
                    print(f"[bes] curl_cffi HTTP {r.status_code}", flush=True)
        except Exception as e:
            print(f"[bes] curl_cffi fail ({type(e).__name__}: {e}) - requests fallback", flush=True)
        # Fallback: dogrudan requests
        if bes_data is None:
            r = requests.post(bes_url, data=bes_payload, headers=bes_headers, timeout=60)
            if r.status_code == 200:
                bes_data = r.json()
        if bes_data and isinstance(bes_data, dict):
            bes_list = bes_data.get('data') or bes_data.get('Data') or []
            print(f"[bes] Response: {len(bes_list)} BES fonu", flush=True)
            existing_codes = {f['code'] for f in funds}
            for item in bes_list:
                try:
                    if not isinstance(item, dict):
                        continue
                    code = str(item.get('FONKODU') or item.get('fonkodu') or '').strip().upper()
                    if not code or code in existing_codes:
                        continue
                    name = str(item.get('FONUNVAN') or item.get('fonunvan') or code).strip()
                    nav = item.get('SONFIYAT') or item.get('sonfiyat') or 0
                    try:
                        nav_f = float(nav)
                    except (ValueError, TypeError):
                        nav_f = 0
                    if nav_f <= 0:
                        continue
                    def get_ret(*keys):
                        for k in keys:
                            v = item.get(k)
                            if v is not None:
                                try:
                                    fv = float(v)
                                    if fv != 0 or v != 0:  # 0 valid ama None dondurme
                                        return round(fv, 2)
                                except (ValueError, TypeError):
                                    pass
                        return None
                    returns_obj = {
                        "1d":  get_ret('GETIRIGUNLUK', 'getirigunluk', 'GETIRI_GUNLUK'),
                        "1w":  None,  # TEFAS bu endpoint'te 1w yok, 1m'den kucuk
                        "1m":  get_ret('GETIRI1AY', 'getiri1ay', 'GETIRI_1AY'),
                        "3m":  get_ret('GETIRI3AY', 'getiri3ay'),
                        "6m":  get_ret('GETIRI6AY', 'getiri6ay'),
                        "1y":  get_ret('GETIRI1YIL', 'GETIRI1YL', 'getiri1yil'),
                        "ytd": get_ret('GETIRIYILBASI', 'getirivilbasi', 'GETIRI_YILBASI'),
                    }
                    kategori = str(item.get('KATEGORI') or item.get('kategori') or 'Emeklilik').strip() or 'Emeklilik'
                    funds.append({
                        "code": code,
                        "name": name,
                        "category": 'Emeklilik',  # frontend BES sayfasi bunu bekliyor
                        "besKategori": kategori,  # TEFAS'tan gelen alt kategori (Değişken/Hisse vs)
                        "tefasOpen": False,       # BES = TEFAS degil
                        "befasOpen": True,        # BEFAS'ta islem gorur
                        "nav": nav_f,
                        "date": anchors['last'].strftime('%Y-%m-%d'),
                        "marketCap": None,
                        "investorCount": None,
                        "shareCount": None,
                        "returns": returns_obj,
                        "history": [],
                        "allocation": None,
                    })
                    bes_added += 1
                    existing_codes.add(code)
                except Exception as e:
                    print(f"[bes] item parse fail: {e}", flush=True)
            print(f"[bes] TEFAS'tan {bes_added} BES fonu fiyat+getiri ile eklendi", flush=True)
        else:
            print(f"[bes] TEFAS response bos veya format hatasi", flush=True)
    except Exception as e:
        print(f"[bes] BES TEFAS fetch fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)

    # Adim 3: Takasbank BEFAS listesinde olan ama TEFAS'tan gelmemis fonlari da
    # ekle (nav=null, returns bos). Kullanici en azindan fon adlarini gorur.
    existing_codes_final = {f['code'] for f in funds}
    takasbank_added = 0
    for bes_fund in bes_fund_list:
        if bes_fund['code'] in existing_codes_final:
            continue
        funds.append({
            "code": bes_fund['code'],
            "name": bes_fund['name'],
            "category": 'Emeklilik',
            "besIssuer": bes_fund.get('issuer', ''),
            "tefasOpen": False,
            "befasOpen": True,
            "nav": None,
            "date": anchors['last'].strftime('%Y-%m-%d'),
            "marketCap": None,
            "investorCount": None,
            "shareCount": None,
            "returns": {},
            "history": [],
            "allocation": None,
        })
        takasbank_added += 1
        existing_codes_final.add(bes_fund['code'])
    if takasbank_added > 0:
        print(f"[bes] Takasbank listesinden ek {takasbank_added} BES fonu (fiyat/getiri henuz yok)", flush=True)

    # ---------- BES metadata enrichment (EGM/BEFAS raporu benzeri) ----------
    # TEFAS BindHistoryInfo endpoint'i her BES fonu icin:
    #   - Kurucu, Yonetici, ISIN, SPK Kodu
    #   - Risk Degeri, Halka Arz Tarihi, Faiz Iceigi
    #   - Yonetim Ucreti (yillik), Toplam Gider Kesintisi
    #   - Karsilastirma Olcutu (BIST KATILIM 100 %90 + ...)
    # Rate limit: her fon icin 400ms bekle → 300 fon ~2 dk
    print(f"\n[bes-meta] Metadata enrichment (BindHistoryInfo)...", flush=True)
    bes_target_indices = [i for i, f in enumerate(funds) if f.get('category') == 'Emeklilik']
    print(f"[bes-meta] {len(bes_target_indices)} BES fonu icin metadata cekilecek", flush=True)

    meta_url = 'https://www.tefas.gov.tr/api/DB/BindHistoryInfo'
    meta_headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': 'https://www.tefas.gov.tr/FonAnaliz.aspx',
        'Origin': 'https://www.tefas.gov.tr',
        'X-Requested-With': 'XMLHttpRequest',
    }
    meta_ok = 0
    meta_fail = 0
    meta_session = None
    try:
        from curl_cffi import requests as cr
        meta_session = cr.Session(impersonate="chrome131")
    except Exception:
        meta_session = None

    def _fetch_bes_meta(code: str) -> dict | None:
        payload_m = {
            'fonkod': code,
            'fontip': 'EMK',
            'bastarih': (anchors['last'] - timedelta(days=7)).strftime('%d.%m.%Y'),
            'bittarih': anchors['last'].strftime('%d.%m.%Y'),
        }
        try:
            if meta_session:
                r_m = meta_session.post(meta_url, data=payload_m, headers=meta_headers, timeout=25)
            else:
                r_m = requests.post(meta_url, data=payload_m, headers=meta_headers, timeout=25)
            if r_m.status_code != 200:
                return None
            j = r_m.json()
            # Response yapisi: { fonInfo: [...], fonInfo2: [...], ... }
            info_list = j.get('fonInfo') or j.get('fonInfoList') or j.get('data') or []
            if isinstance(info_list, list) and info_list:
                return info_list[0] if isinstance(info_list[0], dict) else None
            if isinstance(j, dict) and any(k for k in j.keys() if 'KURUCU' in k.upper() or 'YONETICI' in k.upper()):
                return j
            return None
        except Exception:
            return None

    def _first_str(d: dict, *keys) -> str | None:
        for k in keys:
            v = d.get(k)
            if v is None:
                continue
            s = str(v).strip()
            if s and s.lower() not in ('null', 'none', '-'):
                return s
        return None

    def _first_float(d: dict, *keys) -> float | None:
        for k in keys:
            v = d.get(k)
            if v is None:
                continue
            try:
                return float(str(v).replace(',', '.'))
            except (ValueError, TypeError):
                continue
        return None

    def _parse_tefas_date(s: str | None) -> str | None:
        if not s:
            return None
        # Tipik formatlar: "16.07.2014", "2014-07-16T00:00:00", "16/07/2014"
        for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%dT%H:%M:%S'):
            try:
                return datetime.strptime(s[:19] if 'T' in s else s, fmt).strftime('%Y-%m-%d')
            except (ValueError, TypeError):
                continue
        return None

    for idx in bes_target_indices:
        code = funds[idx]['code']
        info = _fetch_bes_meta(code)
        if info:
            funds[idx]['founder']      = _first_str(info, 'KURUCU', 'FONKURUCU', 'kurucu')
            funds[idx]['manager']      = _first_str(info, 'YONETICI', 'FONYONETICI', 'yonetici')
            funds[idx]['isin']         = _first_str(info, 'ISIN', 'ISINKODU', 'isin')
            funds[idx]['spkCode']      = _first_str(info, 'SPKKODU', 'SPK_KODU', 'spkkodu')
            risk = _first_float(info, 'RISK_DEGERI', 'RISKDEGERI', 'RISK', 'riskdegeri')
            if risk is not None and 1 <= risk <= 7:
                funds[idx]['riskValue'] = int(risk)
            funds[idx]['benchmark']    = _first_str(info, 'KARSILASTIRMA_OLCUTU', 'KARSILASTIRMAOLCUTU', 'benchmark')
            funds[idx]['managementFeeYearly'] = _first_float(info, 'YONETIM_UCRETI_YILLIK', 'YONETIM_UCRETI', 'YIL_YONETIM_UCRETI')
            funds[idx]['totalExpenseRatio']   = _first_float(info, 'TOPLAM_GIDER_KESINTISI', 'FONTOPLAMGIDER', 'TOPLAM_GIDER')
            hat = _first_str(info, 'HALKA_ARZ_TARIHI', 'HALKAARZTARIHI', 'ILK_ISLEM_TARIHI')
            po_date = _parse_tefas_date(hat)
            if po_date:
                funds[idx]['publicOfferDate'] = po_date
            faiz = _first_str(info, 'FAIZ_ICERIGI', 'FAIZICERIK', 'FAIZ')
            if faiz:
                funds[idx]['isInterestFree'] = 'içermez' in faiz.lower() or 'icermez' in faiz.lower()
            meta_ok += 1
        else:
            meta_fail += 1
        time.sleep(0.4)
        if (meta_ok + meta_fail) % 50 == 0:
            print(f"  [bes-meta] {meta_ok + meta_fail}/{len(bes_target_indices)} — ok:{meta_ok} fail:{meta_fail}", flush=True)
    print(f"[bes-meta] Tamamlandi: {meta_ok} basarili, {meta_fail} basarisiz", flush=True)

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
        print(f"\n❌ Yakalanmamis hata: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
