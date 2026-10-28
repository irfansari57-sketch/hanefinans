#!/usr/bin/env python3
"""
KAP aylık "Portföy Dağılım Raporu" → hisse/varlık bazlı fon dağılımı.

Kaynak zinciri (24 Eki 2026'da keşfedildi; tümü anonim, kimlik/token yok):
  1) POST https://kap.org.tr/tr/api/disclosure/funds/byCriteria
       {fromDate, toDate, fundTypeList:["YF"|"EYF"], ...}  → bildirim listesi (gün başına ≤2000)
       subject == "Portföy Dağılım Raporu" olanlar: fundCode, disclosureIndex, publishDate, year, period
  2) GET  https://kap.org.tr/tr/Bildirim/{disclosureIndex}  (SSR HTML) → "api/file/download/{fileId}"
  3) GET  https://kap.org.tr/tr/api/file/download/{fileId}
       Gövde Java-serialize başlığıyla gelir (AC ED 00 05 ...); "%PDF" ofsetinden itibaren kesilir.
  4) PDF "III-FON PORTFÖY DEĞERİ TABLOSU": satır = KOD | DÖVİZ | ... | TOPLAM DEĞER | GRUP% | FPD% | FTD%
       Kullanılan ağırlık: FTD (Fon Toplam Değerine göre) — FVT ile birebir doğrulandı (KTJ Eyl-2026:
       ASELS 4,50 / MSFT 9,77 / KSV 8,28).

Çıktı: data/holdings/{KOD}.json
  { code, updatedAt, current:{period:"2026-09", publishDate, disclosureIndex, fileId, items:[...]},
    previous:{period, items:[{kod,pct}]} | null }
  item: {kod, ad, isin, cur, tur, adet, fiyat, deger, pct, pctFpd}
    tur: hisse | yabanci_hisse | fon | yabanci_fon | borclanma | kira | repo | doviz | kiymetli_maden | diger
  data/holdings/index.json: { updatedAt, funds: { KOD: {period, disclosureIndex, itemCount} } }

Güvenlik: yalnız yayınlanmış KAP bildirimleri; hız sınırı (0.4 sn/istek), 3 deneme, toplam süre bütçesi.
Veri doğruluğu: pct toplamı makul değilse (hisse+fon+... toplamı > 130) fon atlanır ve loglanır.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

try:
    from curl_cffi import requests as creq  # TLS parmak izi; KAP WAF için
    def _session():
        return creq.Session(impersonate="chrome")
except Exception:  # pragma: no cover
    import requests as creq  # type: ignore
    def _session():
        return creq.Session()

import pdfplumber

BASE = "https://kap.org.tr"
OUT_DIR = "data/holdings"
INDEX_PATH = os.path.join(OUT_DIR, "index.json")
DAYS_BACK = int(os.environ.get("KAP_DAYS_BACK", "40"))
FUND_TYPES = os.environ.get("KAP_FUND_TYPES", "YF,EYF").split(",")
ONLY_CODES = {c.strip().upper() for c in os.environ.get("KAP_ONLY", "").split(",") if c.strip()}
MAX_FUNDS = int(os.environ.get("KAP_MAX_FUNDS", "2500"))
TIME_BUDGET = int(os.environ.get("KAP_TIME_BUDGET_SEC", "4800"))  # 80 dk
SLEEP = 0.3
WORKERS = int(os.environ.get("KAP_WORKERS", "4"))
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "tr-TR,tr;q=0.9",
    "Referer": BASE + "/tr/bildirim-sorgu",
    "Origin": BASE,
}

# Alternatif taşıma: GitHub Actions IP'si KAP'ta engelliyse Cloudflare Pages proxy'si (functions/api/kap/proxy.ts).
# KAP_PROXY_URL=https://investliq.com/api/kap/proxy  KAP_PROXY_KEY=<Pages secret>  KAP_TRANSPORT=auto|direct|proxy
PROXY_URL = os.environ.get("KAP_PROXY_URL", "").rstrip("/")
PROXY_KEY = os.environ.get("KAP_PROXY_KEY", "")
TRANSPORT = os.environ.get("KAP_TRANSPORT", "auto").lower()
_use_proxy = TRANSPORT == "proxy"


class _Resp:
    def __init__(self, status: int, content: bytes):
        self.status_code = status
        self.content = content

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", "replace")

    def json(self):
        return json.loads(self.text)


def kap_request(sess, method: str, path: str, *, body: dict | None = None, accept: str = "*/*", timeout: int = 60) -> _Resp:
    """KAP'a doğrudan ya da proxy üzerinden istek. auto: doğrudan başarısızsa (≠200 / hata) proxy'ye geçer ve orada kalır."""
    global _use_proxy
    hdrs = {**HEADERS, "Accept": accept}

    def direct() -> _Resp:
        if method == "POST":
            r = sess.post(BASE + path, json=body, headers=hdrs, timeout=timeout)
        else:
            r = sess.get(BASE + path, headers=hdrs, timeout=timeout)
        return _Resp(r.status_code, r.content)

    def via_proxy() -> _Resp:
        if not PROXY_URL or not PROXY_KEY:
            raise RuntimeError("proxy yapılandırılmamış (KAP_PROXY_URL/KAP_PROXY_KEY)")
        ph = {"X-Proxy-Key": PROXY_KEY}
        u = f"{PROXY_URL}?path={path}"
        if method == "POST":
            r = sess.post(u, json=body, headers=ph, timeout=timeout + 30)
        else:
            r = sess.get(u, headers=ph, timeout=timeout + 30)
        up = r.headers.get("X-Upstream-Status")
        return _Resp(int(up) if up else r.status_code, r.content)

    if _use_proxy:
        return via_proxy()
    try:
        r = direct()
        if r.status_code == 200 or TRANSPORT == "direct" or not (PROXY_URL and PROXY_KEY):
            return r
        log(f"doğrudan {method} {path}: HTTP {r.status_code} → proxy'ye geçiliyor")
    except Exception as e:  # noqa: BLE001
        if TRANSPORT == "direct" or not (PROXY_URL and PROXY_KEY):
            raise
        log(f"doğrudan {method} {path}: {e} → proxy'ye geçiliyor")
    _use_proxy = True
    return via_proxy()


NUM_RE = re.compile(r"^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$")
ISIN_RE = re.compile(r"\b([A-Z]{2}[A-Z0-9]{9}\d)\b")
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{2}$")
CUR_SET = {"TL", "USD", "EUR", "GBP", "CHF", "JPY", "XAU", "XAG", "CNY", "AUD", "CAD", "SEK", "NOK", "DKK"}

# Bölüm başlıkları: yalnız KISA (≤4 kelime), sayısız satırlarda ve satır BAŞINDA aranır.
# (Sayfa başında tekrarlanan sütun başlığı "DÖVİZ | İHRAÇCI | VADE" ve "Altınay" gibi isim
#  parçaları yanlış eşleşmesin diye kelime sınırı + satır başı kullanılır.)
SECTION_MAP = [  # (regex, tur)
    (re.compile(r"^Hisse\s+Yabanc", re.I), "yabanci_hisse"),
    (re.compile(r"^(Hisse\s+Türk|HİSSE SENETLERİ|HISSE SENETLERI)", re.I), "hisse"),
    (re.compile(r"^(Y\.?\s?Fonu\s+Yabanc|Yabancı\s+(Yatırım|Borsa)\s+Fon)", re.I), "yabanci_fon"),
    (re.compile(r"^(Y\.?\s?Fonu\s+Türk|Yatırım\s+Fonu|Borsa\s+Yatırım\s+Fonu|BYF)", re.I), "fon"),
    (re.compile(r"^(Kira\s+Sertifika|KİRA SERTİFİKA|Sukuk)", re.I), "kira"),
    (re.compile(r"^(Taahhüt|TAAHHÜT|Repo|REPO|Ters\s+Repo)", re.I), "repo"),
    (re.compile(r"^(Devlet\s+Tahvil|DEVLET TAHVİL|Hazine\s+Bono|HAZİNE BONO|Özel\s+Sektör|ÖZEL SEKTÖR|Finansman\s+Bono|Borçlanma|BORÇLANMA|Eurobond|Tahvil|Bono)", re.I), "borclanma"),
    (re.compile(r"^(Döviz|DÖVİZ)$", re.I), "doviz"),
    (re.compile(r"^(Kıymetli\s+Maden|KIYMETLİ MADEN|Değerli\s+Maden|Altın|ALTIN|Gümüş)\b", re.I), "kiymetli_maden"),
    (re.compile(r"^(Mevduat|MEVDUAT|Katılım\s+Hesab)", re.I), "mevduat"),
    (re.compile(r"^(Vadeli|VADELİ|Opsiyon|Varant|Türev)", re.I), "turev"),
    (re.compile(r"^(DİĞER|Diğer)$", re.I), "diger"),
]
COLUMN_HEADER = re.compile(r"İHRAÇCI|MENKUL KIYMET|ISIN KODU|KUPON|TOPLAM DEĞER|GÖRE\)|CİNSİ|KURUM|TARİHİ|FİYATI|TUTARI", re.I)
STOP_MARKERS = re.compile(r"FON PORTFÖY DEĞERİ\s*$|IV-FON TOPLAM|V-AY İÇİNDE", re.I)


def log(msg: str) -> None:
    print(f"[kap] {msg}", flush=True)


def tr_num(s: str) -> float | None:
    s = s.strip()
    if not NUM_RE.match(s):
        return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


# ---------------------------------------------------------------- KAP listesi
def list_pdr(sess, d: date, fund_type: str) -> list[dict]:
    body = {
        "fromDate": d.isoformat(), "toDate": d.isoformat(), "fundTypeList": [fund_type],
        "mkkMemberOidList": [], "fundOidList": [], "passiveFundOidList": [],
        "disclosureClass": "", "isLate": "", "subjectList": [], "discIndex": [],
        "fromSrc": False, "srcCategory": "",
    }
    for attempt in range(3):
        try:
            r = kap_request(sess, "POST", "/tr/api/disclosure/funds/byCriteria", body=body, accept="application/json, text/plain, */*")
            if r.status_code == 200:
                arr = r.json()
                if isinstance(arr, list):
                    if len(arr) >= 2000:
                        log(f"UYARI {d} {fund_type}: 2000 sınırına takıldı (bazı bildirimler eksik olabilir)")
                    return [x for x in arr if str(x.get("subject") or "").strip() == "Portföy Dağılım Raporu"]
            log(f"liste {d} {fund_type}: HTTP {r.status_code} (deneme {attempt+1})")
        except Exception as e:  # noqa: BLE001
            log(f"liste {d} {fund_type}: {e} (deneme {attempt+1})")
        time.sleep(2 + attempt * 2)
    return []


def file_id_for(sess, idx: int) -> str | None:
    for attempt in range(3):
        try:
            r = kap_request(sess, "GET", f"/tr/Bildirim/{idx}", accept="text/html")
            if r.status_code == 200:
                m = re.search(r"api/file/download/([0-9a-fA-F]{16,40})", r.text)
                return m.group(1) if m else None
            log(f"bildirim {idx}: HTTP {r.status_code}")
        except Exception as e:  # noqa: BLE001
            log(f"bildirim {idx}: {e}")
        time.sleep(2 + attempt * 2)
    return None


def download_pdf(sess, file_id: str) -> bytes | None:
    for attempt in range(3):
        try:
            r = kap_request(sess, "GET", f"/tr/api/file/download/{file_id}", accept="*/*", timeout=120)
            if r.status_code == 200 and r.content:
                b = r.content
                off = b.find(b"%PDF")
                if off < 0:
                    log(f"dosya {file_id}: %PDF bulunamadı ({len(b)} bayt)")
                    return None
                return b[off:]
            log(f"dosya {file_id}: HTTP {r.status_code}")
        except Exception as e:  # noqa: BLE001
            log(f"dosya {file_id}: {e}")
        time.sleep(2 + attempt * 2)
    return None


# ---------------------------------------------------------------- PDF ayrıştırma
def page_lines(page) -> list[list[tuple[float, str]]]:
    """Kelimeleri satırlara (top ±3pt) grupla; her satır x'e göre sıralı (x, metin) listesi."""
    words = page.extract_words(keep_blank_chars=False, use_text_flow=False, x_tolerance=1.5, y_tolerance=2)
    rows: dict[int, list[tuple[float, str]]] = {}
    for w in words:
        key = int(round(w["top"] / 3.0))
        rows.setdefault(key, []).append((w["x0"], w["text"]))
    out = []
    for k in sorted(rows):
        out.append(sorted(rows[k], key=lambda t: t[0]))
    return out


def classify_section(text: str) -> str | None:
    for rx, tur in SECTION_MAP:
        if rx.search(text):
            return tur
    return None


def parse_pdf(pdf_bytes: bytes) -> tuple[list[dict], dict]:
    """
    Satır kuralı: ilk hücre KOD (3-8 büyük harf/rakam, ' US' gibi borsa eki olabilir), 2. hücre para birimi,
    son 3 sayı = GRUP%, FPD%, FTD%; sondan 4. sayı = TOPLAM DEĞER. 'GRUP TOPLAMI' satırları atlanır.
    Bölüm başlıkları (Hisse Türk / Hisse Yabancı / Y.Fonu Türk / ...) tur'u belirler.
    """
    items: list[dict] = []
    meta: dict = {}
    cur_tur = "diger"
    in_table = False
    pending_name: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for line in page_lines(page):
                texts = [t for _, t in line]
                joined = " ".join(texts)
                if not in_table:
                    if "FON PORTFÖY DEĞERİ TABLOSU" in joined or "FON PORTFOY DEGERI TABLOSU" in joined:
                        in_table = True
                    continue
                if STOP_MARKERS.search(joined) and "GRUP" not in joined:
                    # "FON PORTFÖY DEĞERİ  1.550.813.164,58  100,00" → tablo sonu
                    if "FON PORTFÖY DEĞERİ" in joined or "IV-FON" in joined:
                        in_table = False
                        continue
                if COLUMN_HEADER.search(joined):
                    continue  # sayfa başında tekrarlanan sütun başlığı
                has_num = any(tr_num(t) is not None for t in texts)
                if not has_num and len(texts) <= 4:
                    sec = classify_section(joined)
                    if sec:
                        cur_tur = sec
                        pending_name = []
                        continue
                if joined.startswith("GRUP TOPLAMI"):
                    pending_name = []
                    continue
                # sayısal kuyruk
                nums = []
                for t in reversed(texts):
                    v = tr_num(t)
                    if v is None:
                        break
                    nums.append(v)
                nums.reverse()
                # kod + döviz
                kod = texts[0].strip()
                kod2 = None
                if len(texts) > 1 and texts[1] in ("US", "GR", "LN", "FP", "GY", "HK", "JP", "NA", "SW", "IM", "SM", "CN", "KS", "TT", "AU") and kod.isupper():
                    kod2 = texts[1]
                cur_idx = 2 if kod2 else 1
                cur = texts[cur_idx] if len(texts) > cur_idx else ""
                is_row = (
                    len(nums) >= 4
                    and re.fullmatch(r"[A-Z0-9][A-Z0-9.\-]{1,11}", kod) is not None
                    and cur in CUR_SET
                )
                if not is_row:
                    # isim parçası olabilir (sayısal değilse)
                    if texts and not any(tr_num(t) is not None for t in texts):
                        frag = " ".join(t for t in texts if not ISIN_RE.fullmatch(t))
                        if frag and len(pending_name) < 6:
                            pending_name.append(frag)
                    continue
                pct_ftd, pct_fpd, pct_grp = nums[-1], nums[-2], nums[-3]
                deger = nums[-4]
                # adet: kod/döviz'den sonraki ilk sayı; fiyat: birim fiyat (deger'den önceki sayı)
                mid = texts[cur_idx + 1:len(texts) - 4]
                mid_nums = [tr_num(t) for t in mid]
                mid_nums = [v for v in mid_nums if v is not None]
                adet = mid_nums[0] if mid_nums else None
                fiyat = mid_nums[-1] if len(mid_nums) >= 2 else None
                isin = None
                m = ISIN_RE.search(joined)
                if m:
                    isin = m.group(1)
                # İsim: yalnız satır içi (MSFT US | USD | Microsoft | US594...). Çok satırlı hücre parçaları
                # (üst/alt satırlara dağılan "ASELSAN / ELEKTRON / IK SANAYI") güvenilir birleşmiyor → boş
                # bırakılır; UI kod gösterir, BIST isimleri API tarafında zenginleştirilebilir.
                inline_name = [t for t in mid if tr_num(t) is None and not ISIN_RE.fullmatch(t) and not DATE_RE.match(t)
                               and t not in CUR_SET and not re.fullmatch(r"\d{6,10}|[0-9A-F]{8}", t)]
                name = re.sub(r"\s+", " ", " ".join(inline_name)).strip()[:80]
                pending_name = []
                full_kod = f"{kod} {kod2}" if kod2 else kod
                items.append({
                    "kod": full_kod, "ad": name, "isin": isin, "cur": cur, "tur": cur_tur,
                    "adet": adet, "fiyat": fiyat, "deger": deger,
                    "pct": round(pct_ftd, 2), "pctFpd": round(pct_fpd, 2), "pctGrup": round(pct_grp, 2),
                })
    # Aynı kod + tür birden çok satırdaysa (ör. iki ayrı repo sözleşmesi, aynı ISIN) ağırlıklar toplanır
    merged: dict[tuple[str, str], dict] = {}
    for it in items:
        k = (it["kod"], it["tur"])
        if k in merged:
            m = merged[k]
            m["pct"] = round(m["pct"] + it["pct"], 2)
            m["pctFpd"] = round((m.get("pctFpd") or 0) + (it.get("pctFpd") or 0), 2)
            m["pctGrup"] = round((m.get("pctGrup") or 0) + (it.get("pctGrup") or 0), 2)
            m["deger"] = (m.get("deger") or 0) + (it.get("deger") or 0)
            if it.get("adet") and m.get("adet") is not None:
                m["adet"] = m["adet"] + it["adet"]
            if not m.get("ad") and it.get("ad"):
                m["ad"] = it["ad"]
            if not m.get("isin") and it.get("isin"):
                m["isin"] = it["isin"]
        else:
            merged[k] = dict(it)
    return list(merged.values()), meta


def sanity(items: list[dict]) -> tuple[bool, str]:
    if not items:
        return False, "satır yok"
    tot = sum(i["pct"] for i in items)
    if tot > 130 or tot < 1:
        return False, f"pct toplamı anormal: {tot:.1f}"
    return True, f"{len(items)} satır, toplam %{tot:.1f}"


# ---------------------------------------------------------------- ana akış
def build_by_stock() -> None:
    """Ters indeks: hisse → bu hisseyi tutan fonlar (BIST + yabancı hisse + fon payı). data/holdings/by-stock.json
    { updatedAt, funds: N, stocks: { "ASELS": [{"f":"KTJ","n":"KUVEYT TÜRK…","p":4.5,"per":"2026-09"}, …] } }  (p = fon toplam değerine göre %)"""
    stocks: dict[str, list] = {}
    nfund = 0
    for fn in os.listdir(OUT_DIR):
        if not fn.endswith(".json") or fn in ("index.json", "by-stock.json"):
            continue
        try:
            j = json.load(open(os.path.join(OUT_DIR, fn), encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        cur = j.get("current") or {}
        nfund += 1
        for it in cur.get("items", []):
            if it.get("tur") not in ("hisse", "yabanci_hisse", "fon", "yabanci_fon"):
                continue
            kod = str(it.get("kod") or "").split(" ")[0].upper()  # "MSFT US" → MSFT
            if not kod or not (it.get("pct") or 0) > 0:
                continue
            stocks.setdefault(kod, []).append({"f": j.get("code"), "n": (j.get("name") or "")[:70], "p": it["pct"], "per": cur.get("period"), "t": it.get("tur")})
    for k in stocks:
        stocks[k].sort(key=lambda x: -x["p"])
    out = {"updatedAt": datetime.now(timezone.utc).isoformat(), "funds": nfund, "stocks": stocks}
    with open(os.path.join(OUT_DIR, "by-stock.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log(f"by-stock.json: {len(stocks)} enstrüman, {nfund} fon")


def main() -> int:
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)
    index = {"updatedAt": None, "funds": {}}
    if os.path.exists(INDEX_PATH):
        try:
            index = json.load(open(INDEX_PATH, encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    sess = _session()

    # 1) bildirim listesi — gün gün (2000 sınırı)
    today = date.today()
    found: dict[str, dict] = {}  # code -> en yeni PDR bildirimi
    for back in range(DAYS_BACK, -1, -1):
        d = today - timedelta(days=back)
        if d.weekday() >= 5:
            continue
        for ft in FUND_TYPES:
            rows = list_pdr(sess, d, ft)
            for x in rows:
                code = str(x.get("fundCode") or "").upper()
                if not code or (ONLY_CODES and code not in ONLY_CODES):
                    continue
                idx = int(x.get("disclosureIndex") or 0)
                if not idx:
                    continue
                prev = found.get(code)
                if not prev or idx > prev["idx"]:
                    found[code] = {"idx": idx, "publishDate": x.get("publishDate"), "year": x.get("year"),
                                   "period": x.get("period"), "fundType": ft, "kapTitle": x.get("kapTitle")}
            time.sleep(SLEEP)
        if time.time() - t0 > TIME_BUDGET * 0.3:
            log("liste aşaması süre bütçesini aştı; eldekiyle devam")
            break
    log(f"PDR bildirimi bulunan fon: {len(found)}")

    # 2-4) her fon için PDF — 4 paralel işçi (25 Eki: tek iş parçacığında 90 dk'da 515 fon; bütçe doldu)
    import threading
    from concurrent.futures import ThreadPoolExecutor, as_completed
    lock = threading.Lock()
    counters = {"done": 0, "skipped": 0, "failed": 0}
    todo = []
    for code, info in sorted(found.items()):
        ent = index["funds"].get(code)
        if ent and int(ent.get("disclosureIndex") or 0) >= info["idx"]:
            counters["skipped"] += 1
            continue
        todo.append((code, info))
    todo = todo[:MAX_FUNDS]
    log(f"indirilecek: {len(todo)} fon ({counters['skipped']} güncel)")

    def period_of(info) -> str | None:
        yr, per = info.get("year"), info.get("period")
        if not (yr and per):
            return None
        per = int(per)
        # KAP: aylık raporlarda period = ay (1-12); haftalık raporlarda (serbest fonlar) = hafta no (13-53) → "2026-W41"
        return f"{yr}-W{per:02d}" if per > 12 else f"{yr}-{per:02d}"

    def work(code, info):
        if time.time() - t0 > TIME_BUDGET:
            return ("budget", code)
        wsess = _session()
        period = period_of(info)
        fid = file_id_for(wsess, info["idx"])
        time.sleep(SLEEP)
        if not fid:
            log(f"{code}: dosya id yok (bildirim {info['idx']})")
            return ("fail", code)
        pdf = download_pdf(wsess, fid)
        time.sleep(SLEEP)
        if not pdf:
            return ("fail", code)
        try:
            items, _meta = parse_pdf(pdf)
        except Exception as e:  # noqa: BLE001
            log(f"{code}: PDF ayrıştırma hatası: {e}")
            return ("fail", code)
        ok, why = sanity(items)
        if not ok:
            log(f"{code}: ATLANDI — {why}")
            return ("fail", code)
        path = os.path.join(OUT_DIR, f"{code}.json")
        previous = None
        if os.path.exists(path):
            try:
                old = json.load(open(path, encoding="utf-8"))
                oc = old.get("current") or {}
                if oc.get("period") and oc.get("period") != period:
                    previous = {"period": oc["period"], "items": [{"kod": i["kod"], "pct": i["pct"]} for i in oc.get("items", [])]}
                else:
                    previous = old.get("previous")
            except Exception:  # noqa: BLE001
                previous = None
        coverage = round(sum(i["pct"] for i in items), 2)
        payload = {
            "code": code, "name": info.get("kapTitle"), "fundType": info["fundType"],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "source": f"{BASE}/tr/Bildirim/{info['idx']}",
            "current": {"period": period, "publishDate": info.get("publishDate"), "disclosureIndex": info["idx"],
                        "fileId": fid, "coverage": coverage, "items": items},
            "previous": previous,
        }
        with lock:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            index["funds"][code] = {"period": period, "disclosureIndex": info["idx"], "itemCount": len(items),
                                    "coverage": coverage, "publishDate": info.get("publishDate")}
            counters["done"] += 1
            if counters["done"] % 25 == 0:
                log(f"ilerleme: {counters['done']} yazıldı, {counters['failed']} hata ({int(time.time()-t0)} sn)")
                index["updatedAt"] = datetime.now(timezone.utc).isoformat()
                json.dump(index, open(INDEX_PATH, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        return ("ok", code)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = [ex.submit(work, c, i) for c, i in todo]
        for fu in as_completed(futs):
            try:
                st, _ = fu.result()
            except Exception as e:  # noqa: BLE001
                log(f"işçi hatası: {e}"); st = "fail"
            if st == "fail":
                with lock:
                    counters["failed"] += 1
    done, skipped, failed = counters["done"], counters["skipped"], counters["failed"]
    if time.time() - t0 > TIME_BUDGET:
        log("süre bütçesi doldu — kalanlar bir sonraki çalışmada (index artımlı)")

    build_by_stock()
    index["updatedAt"] = datetime.now(timezone.utc).isoformat()
    json.dump(index, open(INDEX_PATH, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log(f"BİTTİ: {done} yazıldı, {skipped} güncel, {failed} hata, {len(found)} bulunan, {int(time.time()-t0)} sn")
    if done == 0 and failed > 0 and skipped == 0:
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--parse":  # yerel test: python kap_holdings_fetch.py --parse dosya.pdf
        b = open(sys.argv[2], "rb").read()
        b = b[b.find(b"%PDF"):]
        its, _ = parse_pdf(b)
        print(json.dumps(its, ensure_ascii=False, indent=1))
        print(sanity(its))
        sys.exit(0)
    sys.exit(main())
