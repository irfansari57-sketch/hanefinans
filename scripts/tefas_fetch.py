"""
TEFAS fon verilerini çeker → data/tefas.json yazar.

Hızlı anchor-snapshot stratejisi (saatlik cron için):
  - 7 anchor tarihte (bugün, 1h/1a/3a/6a/1y önce, yılbaşı) ayrı sorgu
  - Her sorgu o günkü tüm 1000+ fonun NAV'ını döner (tefasfon get_funds)
  - Period getiri = (bugün NAV - anchor NAV) / anchor NAV × 100
  - Toplam ~7 POST, ~30-60 saniye (önceki 400 günlük all-history 18+ dk sürüyordu)

Çıktı: data/tefas.json — src/data/api/tefasGithub.ts şemasıyla uyumlu
Ek çıktı (22 Eki 2026): data/bes.json — BES (Emeklilik) fonları, aynı {updatedAt,count,funds}
şeması; tefasfon fund_type='PEN' (+ get_returns RB, Takasbank BEFAS Excel). BES adımı
başarısızsa tefas.json yazımı etkilenmez; bes.json 0 fonla üzerine yazılmaz.
Log etiketleri: [allocation] [bes] [bes-meta] [risk]
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
_ALLOC_FAIL_LOGGED = 0  # eski per-fon endpoint icin ilk 3 hatanin detayi loglanir


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
    global _ALLOC_FAIL_LOGGED
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
            if _ALLOC_FAIL_LOGGED < 3:
                _ALLOC_FAIL_LOGGED += 1
                print(f"[allocation] {code} HTTP {r.status_code}, {len(r.content)} B, ilk200={r.text[:200]!r}", flush=True)
            return None
        try:
            data = r.json()
        except Exception:
            if _ALLOC_FAIL_LOGGED < 3:
                _ALLOC_FAIL_LOGGED += 1
                print(f"[allocation] {code} JSON degil (HTTP 200, {len(r.content)} B): ilk200={r.text[:200]!r}", flush=True)
            return None
        if not isinstance(data, list) or len(data) == 0:
            if _ALLOC_FAIL_LOGGED < 3:
                _ALLOC_FAIL_LOGGED += 1
                print(f"[allocation] {code} bos/beklenmedik yanit: {str(data)[:200]!r}", flush=True)
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
        # Timeout dahil her hata burada; GitHub Actions'ta eski endpoint 30 s timeout veriyordu.
        if _ALLOC_FAIL_LOGGED < 3:
            _ALLOC_FAIL_LOGGED += 1
            print(f"[allocation] {code} fetch fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
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


# ============================================================================
# 22 Eki 2026 — BES (Emeklilik) + toplu allocation yardimcilari
# ============================================================================
#
# BULGU 1 (BES neden 0 satir): tefasfon 1.1.0'da fund_type yalnizca
#   SEC / PEN / ETF / RE / VC kabul eder ("EMK" -> ValueError "Invalid fund type").
#   get_funds(fund_type='EMK') her kosuda ValueError firlatiyor, except blogu
#   stderr'e tek satir yazip Adim 1'e geciyordu. Dogru deger: 'PEN' (tefasfon
#   icerde fonTipi=EMK'ye cevirir). Ayni sebeple main()'deki ('SEC','YAT')
#   denemesinde 'YAT' de gecersizdir; SEC ilk sirada oldugu icin fark edilmedi.
# BULGU 2 (BES Adim 2 ve allocation neden bos): www.tefas.gov.tr/api/DB/* (eski
#   ASP.NET: BindComparisonFundReturns, BindFonPortfoyDagilimi, BindHistoryInfo)
#   endpoint'leri yeni portal (/api/funds/*) sonrasi GitHub Actions'tan yanit
#   vermiyor; her cagri timeout (30 s) ile dusuyor ve None donuyor — hata loglanmiyor.
#   500 fon x 30 s = ~4 saat; canli kosunun 16:30 cron -> 20:32 updatedAt suresi
#   bununla birebir uyusuyor. Allocation icin artik tefasfon.get_portfolio
#   (yeni /api/funds/dagilimSiraliGetirT, TEK toplu istek) kullanilir; eski yol
#   yalnizca yedek ve ardisik 10 hatada kesilir.
# BULGU 3: Adim 0 basarili olsa bile BES fonlarina returns={} yaziliyordu
#   (hic hesaplanmiyordu). Simdi 1d/1w history'den, 1m..3y tefasfon.get_returns
#   ('PEN', 'RB' = getiri bazli karsilastirma) ile doldurulur.
#
# BES ciktisi ayri dosyaya (data/bes.json) yazilir; tefas.json'a karismaz ve
# BES adimindaki herhangi bir hata tefas.json yazimini etkilemez.

BES_OUTPUT_PATH = "data/bes.json"


def _norm_col(c) -> str:
    return str(c).strip().lower().replace('_', '').replace(' ', '').replace('ı', 'i')


def _find_col(df: pd.DataFrame, *keywords: str, exclude: tuple = ()) -> "str | None":
    """Kolon adinda (normalize) anahtar kelimelerden biri gecen ilk kolon."""
    for c in df.columns:
        n = _norm_col(c)
        if any(k in n for k in keywords) and not any(x in n for x in exclude):
            return c
    return None


def _head(obj, n: int = 200) -> str:
    try:
        s = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        s = str(obj)
    return s[:n].replace('\n', ' ')


def _to_float(v) -> "float | None":
    if v is None:
        return None
    try:
        if isinstance(v, str):
            v = v.strip().replace('%', '').replace(',', '.')
            if not v or v.lower() in ('null', 'none', '-', 'nan'):
                return None
        f = float(v)
        return f if f == f else None  # NaN filtre
    except (ValueError, TypeError):
        return None


# TEFAS varlik kisaltmalari -> okunur etiket (yeni API kolon adlari dogrulanmadi;
# eslesmeyen kolon adi oldugu gibi etiket olur, ilk kosuda [allocation] logu gosterir)
ALLOC_LABELS = {
    'HS': 'Hisse Senedi', 'YHS': 'Yabancı Hisse Senedi', 'DT': 'Devlet Tahvili', 'HB': 'Hazine Bonosu',
    'OST': 'Özel Sektör Tahvili', 'FB': 'Finansman Bonosu', 'BB': 'Banka Bonosu', 'VDB': 'Varlığa Dayalı Menkul Kıymet',
    'R': 'Repo', 'TR': 'Ters Repo', 'TPP': 'Takasbank Para Piyasası', 'VM': 'Vadeli Mevduat', 'VDM': 'Vadeli Mevduat (Döviz)',
    'KH': 'Katılım Hesabı', 'KKS': 'Kamu Kira Sertifikası', 'OSKS': 'Özel Sektör Kira Sertifikası',
    'KKA': 'Kamu Kira Sertifikası (Döviz)', 'OSKA': 'Özel Sektör Kira Sertifikası (Döviz)', 'YKS': 'Yabancı Kira Sertifikası',
    'KM': 'Kıymetli Maden', 'KMKS': 'Kıymetli Maden Kira Sertifikası', 'KMKBA': 'Kıymetli Maden Kamu Borçlanma Aracı',
    'EUT': 'Eurobond', 'DÖT': 'Döviz Ödemeli Tahvil', 'DOT': 'Döviz Ödemeli Tahvil', 'DB': 'Döviz Ödemeli Bono',
    'KBA': 'Kamu Dış Borçlanma Aracı', 'YBA': 'Yabancı Borçlanma Aracı', 'YYF': 'Yabancı Yatırım Fonu',
    'YMK': 'Yabancı Menkul Kıymet', 'BYF': 'Borsa Yatırım Fonu', 'YBYF': 'Yabancı Borsa Yatırım Fonu',
    'FKB': 'Fon Katılma Belgesi', 'GSYF': 'Girişim Sermayesi Yatırım Fonu', 'GYF': 'Gayrimenkul Yatırım Fonu',
    'GSE': 'Gayrimenkul Sertifikası', 'VİOP': 'VİOP Nakit Teminatı', 'VIOP': 'VİOP Nakit Teminatı',
    'T': 'Türev Araçlar', 'D': 'Diğer', 'DİĞER': 'Diğer', 'DIGER': 'Diğer',
}
# Allocation df'inde yuzde OLMAYAN kolonlar (normalize ad icinde gecen parcalar)
_ALLOC_SKIP_HINTS = ('kod', 'unvan', 'tarih', 'date', 'fiyat', 'pay', 'kisi', 'yatirimci', 'buyukluk',
                     'toplam', 'tur', 'kategori', 'semsiye', 'kurucu', 'rn', 'sira', 'isin', 'ad')


def _alloc_label(col) -> str:
    key = str(col).strip()
    return ALLOC_LABELS.get(key) or ALLOC_LABELS.get(key.upper()) or key


def parse_bulk_allocation(df: pd.DataFrame) -> "dict[str, list[dict]]":
    """tefasfon.get_portfolio df'ini kod -> [{label, pct}] haritasina cevirir.

    Iki olasi bicim desteklenir:
      - GENIS: her varlik sinifi ayri kolon (HS, DT, KH, ...), satir=fon-gun
      - UZUN:  (fonKodu, varlikAdi, oran) satirlari
    Ayni kod icin birden fazla tarih varsa en son tarih alinir.
    """
    out: dict[str, list[dict]] = {}
    if df is None or df.empty:
        return out
    cols = detect_columns(df)
    code_col = cols['code'] or _find_col(df, 'fonkod', 'kod')
    date_col = cols['date'] or _find_col(df, 'tarih', 'date')
    if not code_col:
        print(f"[allocation] kod kolonu bulunamadi; kolonlar={list(df.columns)[:40]}", flush=True)
        return out
    label_col = _find_col(df, 'varlikadi', 'varliktur', 'varlik', 'kalem', 'dagilimadi')
    pct_col = _find_col(df, 'oran', 'yuzde', 'pct', 'agirlik')
    work = df
    if date_col:
        try:
            work = df.assign(_d=pd.to_datetime(df[date_col], errors='coerce'))
            latest = work.groupby(code_col)['_d'].transform('max')
            work = work[work['_d'] == latest]
        except Exception as e:
            print(f"[allocation] tarih filtresi atlandi: {e}", flush=True)
            work = df

    if label_col and pct_col:
        # UZUN bicim
        for _, row in work.iterrows():
            code = str(row.get(code_col, '')).strip().upper()
            pct = _to_float(row.get(pct_col))
            label = str(row.get(label_col, '') or '').strip()
            if code and label and pct is not None and pct > 0:
                out.setdefault(code, []).append({'label': _alloc_label(label), 'pct': round(pct, 2)})
    else:
        # GENIS bicim
        skip = {code_col, date_col, cols.get('name'), cols.get('price'), cols.get('category'),
                cols.get('mcap'), cols.get('investors'), cols.get('shares'), '_d'}
        pct_cols = []
        for c in work.columns:
            if c in skip:
                continue
            n = _norm_col(c)
            if any(h in n for h in _ALLOC_SKIP_HINTS) and len(str(c)) > 5:
                continue
            if pd.api.types.is_numeric_dtype(work[c]) or work[c].map(lambda v: _to_float(v) is not None).mean() > 0.8:
                pct_cols.append(c)
        print(f"[allocation] genis bicim: {len(pct_cols)} yuzde kolonu = {[str(c) for c in pct_cols][:40]}", flush=True)
        for _, row in work.iterrows():
            code = str(row.get(code_col, '')).strip().upper()
            if not code:
                continue
            items = []
            for c in pct_cols:
                pct = _to_float(row.get(c))
                if pct is not None and pct > 0:
                    items.append({'label': _alloc_label(c), 'pct': pct})
            if not items:
                continue
            total = sum(i['pct'] for i in items)
            if 0.9 <= total <= 1.1:  # 0-1 araligi ise yuzdeye cevir
                for i in items:
                    i['pct'] = i['pct'] * 100
            for i in items:
                i['pct'] = round(i['pct'], 2)
            out[code] = items
    for code in out:
        out[code].sort(key=lambda x: x['pct'], reverse=True)
    return out


def fetch_bulk_allocation(ftype: str, target_date: datetime, max_back: int = 5) -> "dict[str, list[dict]]":
    """tefasfon.get_portfolio ile TUM fonlarin varlik dagilimi — tek toplu istek.
    Is gunu degilse / bos donerse max_back gun geriye gider."""
    try:
        from tefasfon import get_portfolio
    except ImportError as e:
        print(f"[allocation] tefasfon.get_portfolio yok ({e}) — toplu yol atlandi", flush=True)
        return {}
    d = previous_business_day(target_date)
    for _ in range(max_back):
        t0 = time.time()
        try:
            df = get_portfolio(fund_type=ftype, start_date=fmt_tr_date(d), end_date=fmt_tr_date(d))
            n = 0 if df is None else len(df)
            print(f"[allocation] get_portfolio({ftype}, {fmt_tr_date(d)}): {n} satir ({time.time()-t0:.1f}s)", flush=True)
            if df is not None and not df.empty:
                print(f"[allocation] kolonlar ({len(df.columns)}): {list(df.columns)[:60]}", flush=True)
                print(f"[allocation] ornek satir: {_head(df.iloc[0].to_dict(), 300)}", flush=True)
                parsed = parse_bulk_allocation(df)
                # Denetim (22 Eki 2026): toplam %95-105 araliginda degilse kolon sezgisi yanlis demektir
                # -> o fonun dagilimini at; kullaniciya hatali "varlik sinifi" gosterilmesin.
                bad = 0
                for code in list(parsed.keys()):
                    tot = sum(float(x.get('pct') or 0) for x in parsed[code])
                    if not (95.0 <= tot <= 105.0):
                        bad += 1
                        del parsed[code]
                print(f"[allocation] toplu parse: {len(parsed)} fon gecerli, {bad} fon toplam-kontrolunden elendi", flush=True)
                if parsed:
                    return parsed
        except Exception as e:
            print(f"[allocation] get_portfolio {fmt_tr_date(d)} fail: {type(e).__name__}: {e}", flush=True)
        d = previous_business_day(d - timedelta(days=1))
    return {}


# ---------------------------------------------------------------------------
# BES (Emeklilik) — tefasfon 'PEN'
# ---------------------------------------------------------------------------
_RET_KEY_MAP = [
    # (normalize kolon sonu/parcasi, cikti anahtari)
    (('getiri1a', 'getiri1ay', 'donemgetiri1a', '1aylik'), '1m'),
    (('getiri3a', 'getiri3ay', 'donemgetiri3a', '3aylik'), '3m'),
    (('getiri6a', 'getiri6ay', 'donemgetiri6a', '6aylik'), '6m'),
    (('getiri1y', 'getiri1yil', 'donemgetiri1y', '1yillik'), '1y'),
    (('getiriyb', 'getiriyilbasi', 'donemgetiriyb', 'yilbasi', 'ytd'), 'ytd'),
    (('getiri3y', 'getiri3yil', 'donemgetiri3y', '3yillik'), '3y'),
    (('getiri5y', 'getiri5yil', 'donemgetiri5y', '5yillik'), '5y'),
    (('getirigunluk', 'gunlukgetiri', 'getiri1g', 'donemgetiri1g'), '1d'),
    (('getiri1h', 'haftalik', 'getiri1hafta'), '1w'),
]


def _returns_columns(df: pd.DataFrame) -> "dict[str, str]":
    """get_returns df kolonlarini {'1m': kolon, ...} eslemesine cevirir."""
    found: dict[str, str] = {}
    for c in df.columns:
        n = _norm_col(c)
        for keys, out_key in _RET_KEY_MAP:
            if out_key in found:
                continue
            if any(n == k or n.endswith(k) for k in keys):
                found[out_key] = c
                break
    return found


def fetch_bes_returns(last: datetime) -> "dict[str, dict]":
    """tefasfon.get_returns('PEN','RB') — tum BES fonlari icin 1m/3m/6m/1y/ytd/3y/5y
    (TEFAS FonKarsilastirma 'getiri bazli', calismaTipi=2). Kod -> {returns, name, category}."""
    try:
        from tefasfon import get_returns
    except ImportError as e:
        print(f"[bes] tefasfon.get_returns yok ({e})", flush=True)
        return {}
    t0 = time.time()
    df = None
    try:
        df = get_returns(fund_type='PEN', basis='RB')  # tarihsiz: TEFAS'in guncel donem getirileri
    except Exception as e:
        print(f"[bes] get_returns(PEN,RB) fail: {type(e).__name__}: {e}", flush=True)
    if df is None or df.empty:
        # Tarihli varyant (calismaTipi=1): son 1 yil
        try:
            df = get_returns(fund_type='PEN', basis='RB',
                             start_date=fmt_tr_date(last - timedelta(days=366)), end_date=fmt_tr_date(last))
        except Exception as e:
            print(f"[bes] get_returns(PEN,RB,tarihli) fail: {type(e).__name__}: {e}", flush=True)
    n = 0 if df is None else len(df)
    print(f"[bes] get_returns(PEN,RB): {n} satir ({time.time()-t0:.1f}s)", flush=True)
    if df is None or df.empty:
        return {}
    print(f"[bes] get_returns kolonlar ({len(df.columns)}): {list(df.columns)[:60]}", flush=True)
    print(f"[bes] get_returns ornek satir: {_head(df.iloc[0].to_dict(), 300)}", flush=True)
    cols = detect_columns(df)
    code_col = cols['code'] or _find_col(df, 'fonkod', 'kod')
    name_col = cols['name'] or _find_col(df, 'unvan', 'fonad')
    cat_col = cols['category'] or _find_col(df, 'turaciklama', 'fontur', 'kategori', 'semsiye', exclude=('kod',))
    rcols = _returns_columns(df)
    print(f"[bes] get_returns getiri kolon eslemesi: {rcols} (kod={code_col}, tur={cat_col})", flush=True)
    if not code_col or not rcols:
        print(f"[bes] get_returns: kod veya getiri kolonu yok — getiriler bos kalacak", flush=True)
        return {}
    out: dict[str, dict] = {}
    for _, row in df.iterrows():
        code = str(row.get(code_col, '')).strip().upper()
        if not code:
            continue
        rets = {k: (lambda v: None if v is None else round(v, 2))(_to_float(row.get(c))) for k, c in rcols.items()}
        out[code] = {
            'returns': rets,
            'name': str(row.get(name_col, '') or '').strip() if name_col else '',
            'category': str(row.get(cat_col, '') or '').strip() if cat_col else '',
        }
    return out


def fetch_befas_list() -> "list[dict]":
    """Takasbank BEFAS Excel (functions/api/befas/funds.ts'deki Takasbank kaynagi ile ayni
    kurum): kod + ad + kurucu. Hata -> bos liste (loglanir)."""
    url = ("https://www.takasbank.com.tr/plugins/"
           "ExcelExportBefasFundsTradingInvestmentPlatform?language=tr")
    headers = {
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
        "Accept": "*/*",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }
    content = None
    try:
        r = requests.get(url, headers=headers, timeout=30)
        print(f"[bes] Takasbank BEFAS Excel (requests): HTTP {r.status_code}, {len(r.content)} B, ilk200={_head(r.content[:200].decode('latin-1', 'replace'))}", flush=True)
        if r.status_code == 200 and r.content[:2] == b'PK':
            content = r.content
    except Exception as e:
        print(f"[bes] Takasbank requests fail: {type(e).__name__}: {e}", flush=True)
    if content is None:
        try:
            from curl_cffi import requests as cr
            with cr.Session(impersonate="chrome131") as s:
                r = s.get(url, headers=headers, timeout=30)
            print(f"[bes] Takasbank BEFAS Excel (curl_cffi): HTTP {r.status_code}, {len(r.content)} B", flush=True)
            if r.status_code == 200 and r.content[:2] == b'PK':
                content = r.content
        except Exception as e:
            print(f"[bes] Takasbank curl_cffi fail: {type(e).__name__}: {e}", flush=True)
    if not content:
        print("[bes] Takasbank BEFAS Excel indirilemedi (xlsx degil veya HTTP hata)", flush=True)
        return []
    try:
        import io, re as _re
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        header = next(rows_iter, None)
        if not header:
            raise ValueError("header satiri yok")

        def _n(h):
            return str(h or '').strip().lower().replace('ı', 'i').replace('ü', 'u').replace('ö', 'o')

        hn = [_n(h) for h in header]
        idx_code = idx_name = idx_founder = idx_type = -1
        for i, h in enumerate(hn):
            if idx_code < 0 and ('fon kodu' in h or h in ('kod', 'kodu')):
                idx_code = i
            if idx_name < 0 and ('fon adi' in h or 'unvan' in h):
                idx_name = i
            if idx_founder < 0 and ('kurucu' in h or 'sirket' in h or 'ihracci' in h):
                idx_founder = i
            if idx_type < 0 and (h in ('tip', 'tur') or 'segment' in h):
                idx_type = i
        print(f"[bes] Excel header={list(header)[:8]} -> code={idx_code} name={idx_name} founder={idx_founder} type={idx_type}", flush=True)
        if idx_code < 0: idx_code = 0
        if idx_type < 0: idx_type = 1
        if idx_founder < 0: idx_founder = 2
        if idx_name < 0: idx_name = 3
        code_pat = _re.compile(r'^[A-ZÇĞİÖŞÜ0-9]{3,5}$')
        out: list[dict] = []
        for row in rows_iter:
            if not row or len(row) <= max(idx_code, idx_name):
                continue
            code = str(row[idx_code] or '').strip().upper()
            if not code_pat.match(code) or code in ('BES', 'DK', 'OKS', 'DKS', 'DKM'):
                continue
            founder = str(row[idx_founder] or '').strip() if 0 <= idx_founder < len(row) else ''
            out.append({'code': code, 'name': str(row[idx_name] or code).strip(), 'founder': founder,
                        'type': str(row[idx_type] or '').strip() if 0 <= idx_type < len(row) else ''})
        print(f"[bes] Takasbank BEFAS Excel: {len(out)} gecerli fon; ornek={_head(out[:2])}", flush=True)
        return out
    except Exception as e:
        print(f"[bes] Excel parse fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        return []


def fetch_bes_legacy_comparison(last: datetime) -> "list[dict]":
    """YEDEK: eski /api/DB/BindComparisonFundReturns (calismatipi=2, fontip=EMK).
    Yeni portal sonrasi buyuk olasilikla yanit vermiyor; HTTP durumu ve ilk 200
    karakter loglanir, 20 s timeout ile sinirli."""
    url = 'https://www.tefas.gov.tr/api/DB/BindComparisonFundReturns'
    payload = {
        'calismatipi': '2', 'fontip': 'EMK',
        'bastarih': (last - timedelta(days=1)).strftime('%d.%m.%Y'), 'bittarih': last.strftime('%d.%m.%Y'),
        'strperiod': '1,1,1,1,1,1,1', 'islemdurum': '1',
        'fongrup': '', 'kurucukod': '', 'fonturkod': '', 'fonunvantip': '',
    }
    headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': 'https://www.tefas.gov.tr/FonKarsilastirma.aspx',
        'Origin': 'https://www.tefas.gov.tr',
        'X-Requested-With': 'XMLHttpRequest',
    }
    data = None
    try:
        from curl_cffi import requests as cr
        with cr.Session(impersonate="chrome131") as s:
            r = s.post(url, data=payload, headers=headers, timeout=20)
        print(f"[bes] legacy BindComparisonFundReturns: HTTP {r.status_code}, {len(r.content)} B, ilk200={_head(r.text)}", flush=True)
        if r.status_code == 200:
            data = r.json()
    except Exception as e:
        print(f"[bes] legacy BindComparisonFundReturns fail: {type(e).__name__}: {e}", flush=True)
    if not isinstance(data, dict):
        return []
    items = data.get('data') or data.get('Data') or []
    print(f"[bes] legacy response: {len(items)} satir", flush=True)
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        code = str(it.get('FONKODU') or it.get('fonkodu') or '').strip().upper()
        nav = _to_float(it.get('SONFIYAT') or it.get('sonfiyat'))
        if not code or not nav or nav <= 0:
            continue
        out.append({
            'code': code,
            'name': str(it.get('FONUNVAN') or it.get('fonunvan') or code).strip(),
            'category': str(it.get('KATEGORI') or it.get('kategori') or '').strip(),
            'nav': nav,
            'returns': {
                '1d': _to_float(it.get('GETIRIGUNLUK')), '1w': None,
                '1m': _to_float(it.get('GETIRI1AY')), '3m': _to_float(it.get('GETIRI3AY')),
                '6m': _to_float(it.get('GETIRI6AY')), 'ytd': _to_float(it.get('GETIRIYILBASI')),
                '1y': _to_float(it.get('GETIRI1YIL')), '3y': _to_float(it.get('GETIRI3YIL')),
            },
        })
    return out


def build_bes_funds(anchors: dict) -> "list[dict]":
    """BES fon listesini uretir (data/bes.json icin). Her adim bagimsiz loglanir;
    hicbir adim istisna firlatmaz (caller ayrica try/except ile sarar)."""
    last = anchors['last']
    bes: dict[str, dict] = {}

    # ---- Adim 0: tefasfon get_funds('PEN') — NAV + kisa history (1d/1w) ----
    print(f"\n[bes] Adim 0: tefasfon get_funds(fund_type='PEN') (eski kod 'EMK' gonderiyordu -> ValueError)", flush=True)
    emk_end = previous_business_day(last)
    emk_start = previous_business_day(emk_end - timedelta(days=21))
    t0 = time.time()
    pen_df = None
    try:
        pen_df = get_funds(fund_type='PEN', start_date=fmt_tr_date(emk_start), end_date=fmt_tr_date(emk_end))
    except Exception as e:
        print(f"[bes] get_funds(PEN) fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    n = 0 if pen_df is None else len(pen_df)
    print(f"[bes] get_funds(PEN, {fmt_tr_date(emk_start)}-{fmt_tr_date(emk_end)}): {n} satir ({time.time()-t0:.1f}s)", flush=True)
    if pen_df is not None and not pen_df.empty:
        print(f"[bes] PEN kolonlar ({len(pen_df.columns)}): {list(pen_df.columns)[:60]}", flush=True)
        print(f"[bes] PEN ornek satir: {_head(pen_df.iloc[0].to_dict(), 300)}", flush=True)
        pc = detect_columns(pen_df)
        pc_cat = pc['category'] or _find_col(pen_df, 'turaciklama', 'fontur', 'kategori', 'semsiye', exclude=('kod',))
        pc_founder = _find_col(pen_df, 'kurucuunvan', 'kurucuadi', 'kurucuad', 'kurucu', exclude=('kod',))
        print(f"[bes] PEN kolon eslemesi: {pc} | tur={pc_cat} kurucu={pc_founder}", flush=True)
        if pc['code'] and pc['price']:
            df = pen_df
            if pc['date']:
                try:
                    df = df.assign(_d=pd.to_datetime(df[pc['date']], errors='coerce')).sort_values('_d')
                except Exception:
                    df = pen_df
            hist: dict[str, list[tuple[str, float]]] = {}
            for _, row in df.iterrows():
                code = str(row.get(pc['code'], '')).strip().upper()
                price = _to_float(row.get(pc['price']))
                if not code or price is None or price <= 0:
                    continue
                iso = None
                if pc['date']:
                    try:
                        iso = pd.to_datetime(row.get(pc['date'])).strftime('%Y-%m-%d')
                    except Exception:
                        iso = None
                ent = bes.setdefault(code, {
                    'code': code, 'name': code, 'category': 'Emeklilik', 'besKategori': '', 'founder': '',
                    'tefasOpen': False, 'befasOpen': True, 'nav': None, 'date': None,
                    'marketCap': None, 'investorCount': None, 'shareCount': None,
                    'returns': {}, 'history': [],
                })
                ent['nav'] = price
                ent['date'] = iso or emk_end.strftime('%Y-%m-%d')
                if pc['name']:
                    ent['name'] = str(row.get(pc['name'], '') or '').strip() or code
                if pc_cat:
                    ent['besKategori'] = str(row.get(pc_cat, '') or '').strip()
                if pc_founder:
                    ent['founder'] = str(row.get(pc_founder, '') or '').strip()
                mc = _to_float(row.get(pc['mcap'])) if pc['mcap'] else None
                inv = _to_float(row.get(pc['investors'])) if pc['investors'] else None
                sh = _to_float(row.get(pc['shares'])) if pc['shares'] else None
                ent['marketCap'] = mc if mc and mc > 0 else None
                ent['investorCount'] = int(inv) if inv and inv > 0 else None
                ent['shareCount'] = int(sh) if sh and sh > 0 else None
                if iso:
                    hist.setdefault(code, []).append((iso, price))
            for code, ent in bes.items():
                h = sorted(set(hist.get(code, [])))
                ent['history'] = [{'date': d, 'price': p} for d, p in h]
                r1d = pct_change(h[-1][1], h[-2][1]) if len(h) >= 2 else None
                r1w = None
                if len(h) >= 2:
                    try:
                        target = datetime.strptime(h[-1][0], '%Y-%m-%d') - timedelta(days=7)
                        best = None
                        for d, p in h[:-1]:
                            if datetime.strptime(d, '%Y-%m-%d') <= target:
                                best = p
                        if best is not None:
                            r1w = pct_change(h[-1][1], best)
                    except Exception:
                        r1w = None
                ent['returns'] = {'1d': r1d, '1w': r1w}
            no_kw = sum(1 for e in bes.values()
                        if 'EMEKL' not in e['name'].upper().replace('İ', 'I'))
            print(f"[bes] Adim 0 sonucu: {len(bes)} fon (adinda EMEKLİLİK gecmeyen: {no_kw})", flush=True)
        else:
            print(f"[bes] PEN df'inde kod/fiyat kolonu bulunamadi — Adim 0 atlandi", flush=True)
    else:
        print(f"[bes] get_funds(PEN) bos — Adim 0 sonuc yok", flush=True)

    # ---- Adim 1: tefasfon get_returns('PEN','RB') — 1m..3y getiriler ----
    print(f"\n[bes] Adim 1: tefasfon get_returns(PEN, RB) donem getirileri", flush=True)
    ret_map = {}
    try:
        ret_map = fetch_bes_returns(last)
    except Exception as e:
        print(f"[bes] Adim 1 fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    matched = 0
    for code, info in ret_map.items():
        ent = bes.get(code)
        if ent is None:
            # Adim 0 bos kaldiysa getiri tablosundan iskelet olustur (NAV yok)
            ent = bes.setdefault(code, {
                'code': code, 'name': info.get('name') or code, 'category': 'Emeklilik',
                'besKategori': info.get('category') or '', 'founder': '',
                'tefasOpen': False, 'befasOpen': True, 'nav': None, 'date': emk_end.strftime('%Y-%m-%d'),
                'marketCap': None, 'investorCount': None, 'shareCount': None, 'returns': {}, 'history': [],
            })
        else:
            matched += 1
        for k, v in info['returns'].items():
            if k in ('1d', '1w') and ent['returns'].get(k) is not None:
                continue  # history'den gelen daha guvenilir
            ent['returns'][k] = v
        if not ent['besKategori'] and info.get('category'):
            ent['besKategori'] = info['category']
    print(f"[bes] Adim 1 sonucu: {len(ret_map)} getiri satiri, {matched} fon ile eslesti", flush=True)

    # ---- Adim 2: Takasbank BEFAS Excel — kurucu + listede olup TEFAS'ta olmayanlar ----
    print(f"\n[bes] Adim 2: Takasbank BEFAS Excel (kurucu)", flush=True)
    befas = []
    try:
        befas = fetch_befas_list()
    except Exception as e:
        print(f"[bes] Adim 2 fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    added = enriched = 0
    for bf in befas:
        ent = bes.get(bf['code'])
        if ent is None:
            bes[bf['code']] = {
                'code': bf['code'], 'name': bf['name'], 'category': 'Emeklilik', 'besKategori': bf.get('type') or '',
                'founder': bf.get('founder') or '', 'tefasOpen': False, 'befasOpen': True,
                'nav': None, 'date': emk_end.strftime('%Y-%m-%d'),
                'marketCap': None, 'investorCount': None, 'shareCount': None, 'returns': {}, 'history': [],
            }
            added += 1
        elif not ent.get('founder') and bf.get('founder'):
            ent['founder'] = bf['founder']
            enriched += 1
    print(f"[bes] Adim 2 sonucu: {len(befas)} satir; kurucu eklenen={enriched}, yalniz-listede={added}", flush=True)

    # ---- Adim 3 (YEDEK): eski BindComparisonFundReturns — yalniz NAV'li fon yoksa ----
    with_nav = sum(1 for e in bes.values() if e.get('nav'))
    if with_nav == 0:
        print(f"\n[bes] Adim 3: NAV'li fon yok — eski BindComparisonFundReturns deneniyor", flush=True)
        try:
            for it in fetch_bes_legacy_comparison(last):
                ent = bes.setdefault(it['code'], {
                    'code': it['code'], 'name': it['name'], 'category': 'Emeklilik', 'besKategori': it['category'],
                    'founder': '', 'tefasOpen': False, 'befasOpen': True, 'nav': None,
                    'date': last.strftime('%Y-%m-%d'), 'marketCap': None, 'investorCount': None,
                    'shareCount': None, 'returns': {}, 'history': [],
                })
                ent['nav'] = it['nav']
                for k, v in it['returns'].items():
                    if ent['returns'].get(k) is None:
                        ent['returns'][k] = v
        except Exception as e:
            print(f"[bes] Adim 3 fail: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    else:
        print(f"[bes] Adim 3 (legacy) atlandi — {with_nav} fonun NAV'i var", flush=True)

    # Returns anahtarlarini tamamla (sema: 1d,1w,1m,3m,6m,ytd,1y,3y)
    for ent in bes.values():
        r = ent['returns']
        ent['returns'] = {k: r.get(k) for k in ('1d', '1w', '1m', '3m', '6m', 'ytd', '1y', '3y')}
        if r.get('5y') is not None:
            ent['returns']['5y'] = r['5y']
        ent.setdefault('allocation', None)

    out = sorted(bes.values(), key=lambda f: (f['returns'].get('1y') is None, -(f['returns'].get('1y') or 0)))
    print(f"\n[bes] TOPLAM {len(out)} BES fonu; NAV'li={sum(1 for f in out if f.get('nav'))}, "
          f"1y getirili={sum(1 for f in out if f['returns'].get('1y') is not None)}, "
          f"kuruculu={sum(1 for f in out if f.get('founder'))}", flush=True)
    return out


def write_bes_json(bes_funds: "list[dict]") -> bool:
    """data/bes.json yazar (sema: tefas.json ile ayni {updatedAt,count,funds}).
    Bos liste ise mevcut dosyaya dokunmaz."""
    if not bes_funds:
        print(f"[bes] 0 fon — {BES_OUTPUT_PATH} DEGISTIRILMEDI", flush=True)
        return False
    # 22 Eki 2026: kurucu bos ise fon adindan tuket — BES fon adlari "KURUCU ... A.S. ... FONU"
    # kalibindadir ("BNP PARIBAS CARDIF EMEKLILIK A.S. OKS ..." -> "BNP PARIBAS CARDIF EMEKLILIK A.S.").
    import re as _re
    filled = 0
    for f in bes_funds:
        if f.get('founder'):
            continue
        name = str(f.get('name') or '')
        m = _re.match(r"^(.{3,80}?\bA\.\s?[SŞ]\.)", name)
        if m:
            f['founder'] = m.group(1).strip()
            filled += 1
    if filled:
        print(f"[bes] kurucu adi fon adindan turetildi: {filled} fon", flush=True)
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(bes_funds),
        "funds": bes_funds,
    }
    with open(BES_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"✅ {BES_OUTPUT_PATH} yazildi ({os.path.getsize(BES_OUTPUT_PATH) // 1024} KB, {len(bes_funds)} fon)", flush=True)
    return True


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

    # ---------- Allocation fetch ----------
    # 22 Eki 2026: Oncelik tefasfon.get_portfolio (yeni /api/funds/dagilimSiraliGetirT,
    # TEK toplu istek, tum fonlar). Eski per-fon BindFonPortfoyDagilimi yolu
    # GitHub Actions'tan timeout'a dusuyordu (500 x 30 s ~ 4 saat, hepsi None) —
    # artik yalnizca toplu yol bos donerse ve ardisik 10 hatada kesilerek denenir.
    print(f"\n[allocation] Adim A: tefasfon get_portfolio({working_ftype}) toplu dagilim...", flush=True)
    alloc_ok, alloc_fail = 0, 0
    bulk_alloc: dict[str, list[dict]] = {}
    try:
        bulk_alloc = fetch_bulk_allocation(working_ftype, anchors['last'])
    except Exception as e:
        print(f"[allocation] toplu yol beklenmedik hata: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    if bulk_alloc:
        for f in funds:
            a = bulk_alloc.get(f['code'])
            if a:
                f['allocation'] = a
                alloc_ok += 1
        sample = next((f for f in funds if f.get('allocation')), None)
        print(f"[allocation] Adim A: {alloc_ok}/{len(funds)} fona dagilim yazildi; ornek "
              f"{sample['code'] if sample else '-'}: {_head(sample['allocation'] if sample else None)}", flush=True)
    else:
        print(f"[allocation] Adim A sonuc yok — Adim B (eski per-fon endpoint, devre kesicili)", flush=True)
        ALLOC_TOP_N = int(os.environ.get('TEFAS_ALLOC_TOP_N', '500'))
        ALLOC_DELAY_MS = int(os.environ.get('TEFAS_ALLOC_DELAY_MS', '300'))
        ALLOC_MAX_CONSEC_FAIL = int(os.environ.get('TEFAS_ALLOC_MAX_CONSEC_FAIL', '10'))

        def _size_proxy(f: dict) -> float:
            mc = f.get('marketCap')
            if mc and mc > 0:
                return float(mc)
            try:
                return float(f.get('shareCount') or 0) * float(f.get('nav') or 0)
            except (ValueError, TypeError):
                return 0.0
        alloc_candidates = [f for f in funds if f.get('tefasOpen')]
        alloc_candidates.sort(key=_size_proxy, reverse=True)
        alloc_targets = alloc_candidates[:ALLOC_TOP_N]
        print(f"[allocation] {len(alloc_candidates)} tefasOpen aday -> top {len(alloc_targets)} secildi", flush=True)
        consec_fail = 0
        for i, f in enumerate(alloc_targets):
            alloc = fetch_fund_allocation(f['code'], timeout=15)
            if alloc:
                f['allocation'] = alloc
                alloc_ok += 1
                consec_fail = 0
            else:
                alloc_fail += 1
                consec_fail += 1
                if consec_fail >= ALLOC_MAX_CONSEC_FAIL:
                    print(f"[allocation] ardisik {consec_fail} hata — eski endpoint yanit vermiyor, dongu kesildi "
                          f"({i+1}/{len(alloc_targets)} denendi)", flush=True)
                    break
            time.sleep(ALLOC_DELAY_MS / 1000.0)
            if (i + 1) % 50 == 0:
                print(f"  {i+1}/{len(alloc_targets)} — ok:{alloc_ok} fail:{alloc_fail}", flush=True)
    print(f"[allocation] Tamamlandi: {alloc_ok} basarili, {alloc_fail} basarisiz; "
          f"allocation dolu fon={sum(1 for f in funds if f.get('allocation'))}", flush=True)

    # ---------- BES (Emeklilik) — AYRI dosya: data/bes.json ----------
    # tefas.json'a karismaz; buradaki herhangi bir hata tefas.json yazimini etkilemez.
    bes_funds: list[dict] = []
    try:
        bes_funds = build_bes_funds(anchors)
    except Exception as e:
        print(f"[bes] BES adimi beklenmedik hata (tefas.json etkilenmez): {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        traceback.print_exc()
        bes_funds = []

    # ---------- Ortak meta yardimcilari (BES meta + asagidaki [risk] blogu kullanir) ----------
    meta_url = 'https://www.tefas.gov.tr/api/DB/BindHistoryInfo'
    meta_headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': 'https://www.tefas.gov.tr/FonAnaliz.aspx',
        'Origin': 'https://www.tefas.gov.tr',
        'X-Requested-With': 'XMLHttpRequest',
    }
    meta_session = None
    try:
        from curl_cffi import requests as cr
        meta_session = cr.Session(impersonate="chrome131")
    except Exception:
        meta_session = None

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
        for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%dT%H:%M:%S'):
            try:
                return datetime.strptime(s[:19] if 'T' in s else s, fmt).strftime('%Y-%m-%d')
            except (ValueError, TypeError):
                continue
        return None

    # ---------- BES metadata enrichment (BindHistoryInfo — eski endpoint, devre kesicili) ----------
    # Kurucu/yonetici/ISIN/risk/ucret. Eski /api/DB yolu buyuk olasilikla yanit vermiyor;
    # ilk hatada HTTP durumu + ilk 200 karakter loglanir, ardisik 5 hatada dongu kesilir.
    # BES_META=0 ile tamamen kapatilabilir.
    if bes_funds and os.environ.get('BES_META', '1') != '0':
        print(f"\n[bes-meta] {len(bes_funds)} BES fonu icin BindHistoryInfo (fontip=EMK)...", flush=True)
        meta_ok = meta_fail = 0
        meta_consec_fail = 0
        meta_logged = 0

        def _fetch_bes_meta(code: str) -> dict | None:
            nonlocal meta_logged
            payload_m = {
                'fonkod': code,
                'fontip': 'EMK',
                'bastarih': (anchors['last'] - timedelta(days=7)).strftime('%d.%m.%Y'),
                'bittarih': anchors['last'].strftime('%d.%m.%Y'),
            }
            try:
                if meta_session:
                    r_m = meta_session.post(meta_url, data=payload_m, headers=meta_headers, timeout=15)
                else:
                    r_m = requests.post(meta_url, data=payload_m, headers=meta_headers, timeout=15)
                if meta_logged < 2:
                    meta_logged += 1
                    print(f"[bes-meta] {code}: HTTP {r_m.status_code}, {len(r_m.content)} B, ilk200={_head(r_m.text)}", flush=True)
                if r_m.status_code != 200:
                    return None
                j = r_m.json()
                info_list = j.get('fonInfo') or j.get('fonInfoList') or j.get('data') or []
                if isinstance(info_list, list) and info_list:
                    return info_list[0] if isinstance(info_list[0], dict) else None
                if isinstance(j, dict) and any(k for k in j.keys() if 'KURUCU' in k.upper() or 'YONETICI' in k.upper()):
                    return j
                return None
            except Exception as e:
                if meta_logged < 2:
                    meta_logged += 1
                    print(f"[bes-meta] {code}: HATA {type(e).__name__}: {e}", flush=True)
                return None

        for fund in bes_funds:
            info = _fetch_bes_meta(fund['code'])
            if info:
                meta_consec_fail = 0
                fund['founder'] = _first_str(info, 'KURUCU', 'FONKURUCU', 'kurucu') or fund.get('founder') or ''
                fund['manager'] = _first_str(info, 'YONETICI', 'FONYONETICI', 'yonetici')
                fund['isin'] = _first_str(info, 'ISIN', 'ISINKODU', 'isin')
                fund['spkCode'] = _first_str(info, 'SPKKODU', 'SPK_KODU', 'spkkodu')
                risk = _first_float(info, 'RISK_DEGERI', 'RISKDEGERI', 'RISK', 'riskdegeri')
                if risk is not None and 1 <= risk <= 7:
                    fund['riskValue'] = int(risk)
                fund['benchmark'] = _first_str(info, 'KARSILASTIRMA_OLCUTU', 'KARSILASTIRMAOLCUTU', 'benchmark')
                fund['managementFeeYearly'] = _first_float(info, 'YONETIM_UCRETI_YILLIK', 'YONETIM_UCRETI', 'YIL_YONETIM_UCRETI')
                fund['totalExpenseRatio'] = _first_float(info, 'TOPLAM_GIDER_KESINTISI', 'FONTOPLAMGIDER', 'TOPLAM_GIDER')
                po_date = _parse_tefas_date(_first_str(info, 'HALKA_ARZ_TARIHI', 'HALKAARZTARIHI', 'ILK_ISLEM_TARIHI'))
                if po_date:
                    fund['publicOfferDate'] = po_date
                faiz = _first_str(info, 'FAIZ_ICERIGI', 'FAIZICERIK', 'FAIZ')
                if faiz:
                    fund['isInterestFree'] = 'içermez' in faiz.lower() or 'icermez' in faiz.lower()
                meta_ok += 1
            else:
                meta_fail += 1
                meta_consec_fail += 1
                if meta_consec_fail >= 5:
                    print(f"[bes-meta] ardisik {meta_consec_fail} hata — eski endpoint yanit vermiyor, dongu kesildi", flush=True)
                    break
            time.sleep(0.4)
            if (meta_ok + meta_fail) % 50 == 0:
                print(f"  [bes-meta] {meta_ok + meta_fail}/{len(bes_funds)} — ok:{meta_ok} fail:{meta_fail}", flush=True)
        print(f"[bes-meta] Tamamlandi: {meta_ok} basarili, {meta_fail} basarisiz", flush=True)
    else:
        print(f"[bes-meta] atlandi (bes_funds={len(bes_funds)}, BES_META={os.environ.get('BES_META', '1')})", flush=True)

    try:
        write_bes_json(bes_funds)
    except Exception as e:
        print(f"[bes] {BES_OUTPUT_PATH} yazilamadi (tefas.json etkilenmez): {type(e).__name__}: {e}", file=sys.stderr, flush=True)

    # ------------------------------------------------------------------
    # 21 Eki 2026 — YAT fonlari icin RISK DEGERI (1-7). Ayni BindHistoryInfo
    # yolu, fontip=YAT. Risk nadiren degisir: data/fund-meta-cache.json'da
    # saklanir, her fon 30 gunde bir yenilenir, kosu basina en fazla
    # RISK_BATCH fon cekilir (toplam sure sinirli kalsin). Kaynak dusukse
    # cache'teki eski deger kullanilir; hic yoksa alan yazilmaz (UI "—").
    # VARSAYIM: fonInfo icinde RISK_DEGERI alani var (BES icin ayni varsayim
    # calisiyor). Ilk kosuda [risk] log satirlari dogrular.
    # ------------------------------------------------------------------
    RISK_CACHE_PATH = "data/fund-meta-cache.json"
    RISK_BATCH = int(os.environ.get("RISK_BATCH", "200"))
    RISK_TTL_DAYS = 30
    try:
        with open(RISK_CACHE_PATH, encoding="utf-8") as cf:
            risk_cache = json.load(cf)
    except Exception:
        risk_cache = {}
    now_iso = datetime.now(timezone.utc).isoformat()

    def _fetch_yat_meta(code: str) -> dict | None:
        payload_y = {
            'fonkod': code,
            'fontip': 'YAT',
            'bastarih': (anchors['last'] - timedelta(days=7)).strftime('%d.%m.%Y'),
            'bittarih': anchors['last'].strftime('%d.%m.%Y'),
        }
        try:
            if meta_session:
                r_y = meta_session.post(meta_url, data=payload_y, headers=meta_headers, timeout=25)
            else:
                r_y = requests.post(meta_url, data=payload_y, headers=meta_headers, timeout=25)
            if r_y.status_code != 200:
                return None
            j = r_y.json()
            info_list = j.get('fonInfo') or j.get('fonInfoList') or j.get('data') or []
            if isinstance(info_list, list) and info_list:
                return info_list[0] if isinstance(info_list[0], dict) else None
            return j if isinstance(j, dict) else None
        except Exception:
            return None

    yat_indices = [i for i, f in enumerate(funds) if f.get('category') != 'Emeklilik']
    due = []
    for i in yat_indices:
        code = funds[i]['code']
        ent = risk_cache.get(code)
        if ent and ent.get('riskValue') is not None:
            funds[i]['riskValue'] = int(ent['riskValue'])
        fresh = False
        if ent and ent.get('at'):
            try:
                fresh = (datetime.now(timezone.utc) - datetime.fromisoformat(ent['at'])).days < RISK_TTL_DAYS
            except Exception:
                fresh = False
        if not fresh:
            due.append(i)
    print(f"[risk] {len(yat_indices)} YAT fonu; cache'ten dolu: {sum(1 for i in yat_indices if funds[i].get('riskValue') is not None)}; bu kosuda cekilecek: {min(len(due), RISK_BATCH)}", flush=True)
    r_ok = r_fail = r_norisk = 0
    for i in due[:RISK_BATCH]:
        code = funds[i]['code']
        info = _fetch_yat_meta(code)
        if info:
            risk = _first_float(info, 'RISK_DEGERI', 'RISKDEGERI', 'RISK', 'riskdegeri')
            if risk is not None and 1 <= risk <= 7:
                funds[i]['riskValue'] = int(risk)
                risk_cache[code] = {'riskValue': int(risk), 'at': now_iso}
                r_ok += 1
            else:
                r_norisk += 1
                if r_norisk == 1:
                    print(f"[risk] ORNEK fonInfo anahtarlari ({code}): {sorted(list(info.keys()))[:40]}", flush=True)
                risk_cache[code] = {'riskValue': risk_cache.get(code, {}).get('riskValue'), 'at': now_iso}
        else:
            r_fail += 1
        time.sleep(0.3)
    print(f"[risk] Tamamlandi: ok={r_ok} alan-yok={r_norisk} fail={r_fail}", flush=True)
    try:
        with open(RISK_CACHE_PATH, "w", encoding="utf-8") as cf:
            json.dump(risk_cache, cf, ensure_ascii=False, separators=(",", ":"))
    except Exception as e:
        print(f"[risk] cache yazilamadi: {e}", flush=True)

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
