"""
BIST Katılım endeksi üyeliklerini açık kaynaklardan çeker → data/katilim.json yazar.

Arka plan (22 Eki 2026): fvt.com.tr API'si kapandı (401/429); erişim kontrolünü
aşmıyoruz. /api/bist/katilim endpoint'i artık bu dosyayı jsDelivr'dan sunar.

Kaynak sırası (ilkinden ≥ eşik sembol gelmezse sıradakine geçilir, hepsi loglanır):
  1. katilimendeksi.org  — "Endeks Bileşenleri" sayfaları (XKTUM/XK030/XK050/XK100)
  2. borsaistanbul.com   — "Endeks Dosyaları" (Endeks şirketleri xlsx/csv) + HTML
  3. kap.org.tr          — Endeksler sayfası
  4. (yedek) mevcut data/katilim.json'daki üyelikler korunur; hiçbir kaynak yoksa
     dosya DEĞİŞTİRİLMEZ ve exit 1.

Hiçbir kaynak doğrulanamadı (dış ağ yok); parse mantığı kasıtlı olarak
format-bağımsız yazıldı: HTML/xlsx/csv içinden BIST sembol deseni (^[A-Z0-9]{3,6}$)
ve endeks kodu deseni (X[A-Z0-9]{3,5}) çıkarılır. Hangi adımın ne döndürdüğü
[katilim] log satırlarında (HTTP durum, uzunluk, ilk 200 karakter) görünür.

Kullanım:
  python scripts/katilim_fetch.py                 # kaynaklardan çek
  python scripts/katilim_fetch.py --from-static   # src/data/katilim.ts'den üret (ilk sürüm)

Çıktı şeması (functions/api/bist/katilim.ts yanıtıyla aynı):
  { ok, asOf, source, count, indices: {XKTUM:'BIST Katılım Tüm', ...},
    symbols: {THYAO: ['XKTUM','XK100'], ...} }
"""

from __future__ import annotations

import html
import io
import json
import os
import re
import sys
from datetime import datetime, timezone

OUTPUT_PATH = "data/katilim.json"
STATIC_TS_PATH = "src/data/katilim.ts"
MIN_TOTAL_SYMBOLS = 50

INDEX_NAMES: dict[str, str] = {
    "XKTUM": "BIST Katılım Tüm",
    "XK030": "BIST Katılım 30",
    "XK050": "BIST Katılım 50",
    "XK100": "BIST Katılım 100",
    "XKTMT": "BIST Katılım Temettü",
    "XSRDK": "BIST Sürdürülebilirlik Katılım",
}
INDEX_ORDER = ["XKTUM", "XK100", "XK050", "XK030", "XSRDK", "XKTMT"]

# Endeks başına kabul eşiği (bunun altı "parse yanlış tabloyu yakaladı" sayılır)
MIN_PER_INDEX = {"XKTUM": 150, "XK100": 80, "XK050": 40, "XK030": 25, "XKTMT": 15, "XSRDK": 10}

# Sembol deseni ve endeks adlarıyla karışabilecek yaygın büyük harfli hücreler
SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9]{2,5}$")
INDEX_CODE_RE = re.compile(r"\bX[A-Z0-9]{3,5}\b")
NOT_SYMBOLS = {
    "BIST", "XU100", "XU030", "XU050", "TRY", "USD", "EUR", "TL", "KAP", "ISIN", "KOD",
    "HTML", "HTTP", "HTTPS", "PDF", "XLSX", "CSV", "JSON", "TRUE", "FALSE", "NULL",
    "SEANS", "FON", "BYF", "VIOP", "GYO", "GSYO",
} | set(INDEX_NAMES.keys())

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
BASE_HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
}


def log(msg: str, err: bool = False) -> None:
    print(f"[katilim] {msg}", file=sys.stderr if err else sys.stdout, flush=True)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
_SESSION = None


def _session():
    """curl_cffi (chrome impersonate) varsa onu, yoksa requests kullan."""
    global _SESSION
    if _SESSION is None:
        try:
            from curl_cffi import requests as cr  # type: ignore
            _SESSION = cr.Session(impersonate="chrome131")
            log("HTTP: curl_cffi chrome131 session")
        except Exception as e:  # ImportError dahil
            import requests  # type: ignore
            _SESSION = requests.Session()
            log(f"HTTP: curl_cffi yok ({type(e).__name__}) - requests session")
    return _SESSION


def fetch(url: str, timeout: int = 30) -> tuple[int, bytes, str]:
    """(status, body, content_type). Hata durumunda status=0."""
    try:
        r = _session().get(url, headers=BASE_HEADERS, timeout=timeout, allow_redirects=True)
        body = r.content or b""
        ctype = str(r.headers.get("content-type", "") or "")
        head = body[:200].decode("utf-8", "replace").replace("\n", " ")
        log(f"GET {url} -> HTTP {r.status_code} {len(body)}B [{ctype[:40]}] | {head}")
        return int(r.status_code), body, ctype
    except Exception as e:
        log(f"GET {url} -> HATA {type(e).__name__}: {e}", err=True)
        return 0, b"", ""


# ---------------------------------------------------------------------------
# Parse yardımcıları
# ---------------------------------------------------------------------------
def _strip_tags(s: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s)


def html_symbols(doc: str) -> list[str]:
    """HTML içinden BIST sembolü gibi görünen hücre/bağlantı metinlerini çıkarır.

    Üç yol birden denenir, sonuçlar birleştirilir:
      a) <td>/<th>/<a>/<span> içi tam metin (THYAO)
      b) href'lerde /hisse/THYAO, ?symbol=THYAO, /THYAO.E gibi parçalar
      c) "THYAO.E" / "THYAO.IS" biçimi
    """
    found: dict[str, int] = {}

    def add(sym: str) -> None:
        sym = sym.strip().upper()
        if SYMBOL_RE.match(sym) and sym not in NOT_SYMBOLS and not sym.isdigit():
            found[sym] = found.get(sym, 0) + 1

    for m in re.finditer(r"<(?:td|th|a|span|strong|b|li)[^>]*>\s*([A-Z0-9]{3,6})\s*</", doc):
        add(m.group(1))
    # Ön ek büyük/küçük harf duyarsız, sembol grubu BÜYÜK harf (aksi halde "hisseler" → "LER" gibi hatalar)
    for m in re.finditer(r"(?i:hisse|stock|symbol|sembol|kod|code)[=/_-]([A-Z0-9]{3,6})(?:[\"'/?&.]|$)", doc):
        add(m.group(1))
    for m in re.finditer(r"\b([A-Z][A-Z0-9]{2,5})\.(?:E|IS)\b", doc):
        add(m.group(1))
    return sorted(found.keys())


def table_rows_text(doc: str) -> list[list[str]]:
    """HTML tabloları → hücre metni satırları (basit, regex tabanlı)."""
    rows: list[list[str]] = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", doc, flags=re.S | re.I):
        cells = [
            _strip_tags(c).strip()
            for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S | re.I)
        ]
        if cells:
            rows.append(cells)
    return rows


def rows_to_memberships(rows: list[list[str]]) -> dict[str, set[str]]:
    """Satırlarda bir sembol hücresi + endeks kodları içeren hücre(ler) varsa
    (BIST 'Endeks Şirketleri' formatı: Kod | Şirket | Endeksler) üyelik çıkarır."""
    out: dict[str, set[str]] = {}
    for cells in rows:
        sym = None
        for c in cells:
            cu = c.strip()
            if SYMBOL_RE.match(cu) and cu not in NOT_SYMBOLS and not cu.isdigit():
                sym = cu
                break
        if not sym:
            continue
        joined = " ".join(cells).upper()
        idx = {m for m in INDEX_CODE_RE.findall(joined) if m in INDEX_NAMES}
        if idx:
            out.setdefault(sym, set()).update(idx)
    return out


def xlsx_rows(body: bytes) -> list[list[str]]:
    try:
        import openpyxl  # type: ignore
    except ImportError:
        log("openpyxl yok - xlsx parse atlandı", err=True)
        return []
    try:
        wb = openpyxl.load_workbook(io.BytesIO(body), read_only=True, data_only=True)
    except Exception as e:
        log(f"xlsx açılamadı: {type(e).__name__}: {e}", err=True)
        return []
    rows: list[list[str]] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            cells = ["" if v is None else str(v).strip() for v in row]
            if any(cells):
                rows.append(cells)
    return rows


def csv_rows(text: str) -> list[list[str]]:
    import csv
    sample = text[:4096]
    delim = ";" if sample.count(";") > sample.count(",") else ","
    return [[c.strip() for c in r] for r in csv.reader(io.StringIO(text), delimiter=delim)]


def body_rows(body: bytes, ctype: str, url: str) -> list[list[str]]:
    low = (ctype + " " + url).lower()
    if body[:2] == b"PK" or "spreadsheet" in low or low.endswith(".xlsx"):
        return xlsx_rows(body)
    text = body.decode("utf-8", "replace")
    if "<html" in text[:2000].lower() or "<table" in text.lower():
        return table_rows_text(text)
    if "csv" in low or ";" in text[:500] or "," in text[:500]:
        return csv_rows(text)
    return []


# ---------------------------------------------------------------------------
# Kaynak 1: katilimendeksi.org
# ---------------------------------------------------------------------------
# Sayfa adresleri doğrulanamadı; birkaç olası yol sırayla denenir.
KE_BASE = "https://www.katilimendeksi.org"
KE_PAGES: dict[str, list[str]] = {
    "XK030": [f"{KE_BASE}/endeks/katilim-30/bilesenler", f"{KE_BASE}/katilim-30-endeksi/bilesenler",
              f"{KE_BASE}/endeksler/katilim-30", f"{KE_BASE}/katilim-30"],
    "XK050": [f"{KE_BASE}/endeks/katilim-50/bilesenler", f"{KE_BASE}/katilim-50-endeksi/bilesenler",
              f"{KE_BASE}/endeksler/katilim-50", f"{KE_BASE}/katilim-50"],
    "XK100": [f"{KE_BASE}/endeks/katilim-100/bilesenler", f"{KE_BASE}/katilim-100-endeksi/bilesenler",
              f"{KE_BASE}/endeksler/katilim-100", f"{KE_BASE}/katilim-100"],
    "XKTUM": [f"{KE_BASE}/endeks/katilim-tum/bilesenler", f"{KE_BASE}/katilim-tum-endeksi/bilesenler",
              f"{KE_BASE}/endeksler/katilim-tum", f"{KE_BASE}/katilim-tum", f"{KE_BASE}/endeks-bilesenleri"],
}


def source_katilimendeksi() -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    # Ana sayfadan "bileşen" bağlantılarını da keşfet
    status, body, _ = fetch(KE_BASE)
    discovered: list[str] = []
    if status == 200:
        doc = body.decode("utf-8", "replace")
        for href in re.findall(r"href=[\"']([^\"']+)[\"']", doc, flags=re.I):
            h = html.unescape(href)
            if re.search(r"bilesen|endeks", h, flags=re.I):
                full = h if h.startswith("http") else KE_BASE + ("" if h.startswith("/") else "/") + h
                if full not in discovered and KE_BASE in full:
                    discovered.append(full)
        log(f"katilimendeksi.org: {len(discovered)} aday bağlantı keşfedildi: {discovered[:8]}")

    for code in ("XK030", "XK050", "XK100", "XKTUM"):
        key = code[-3:].lstrip("0") if code != "XKTUM" else "tum"
        cands = KE_PAGES[code] + [u for u in discovered if re.search(rf"(katilim[-_]?{key}|{key}[-_]?katilim)", u, re.I)]
        for url in cands:
            status, body, ctype = fetch(url)
            if status != 200 or not body:
                continue
            doc = body.decode("utf-8", "replace")
            # Önce tablo satırları (daha güvenilir), sonra serbest sembol taraması
            rows = table_rows_text(doc)
            syms = {c.strip().upper() for r in rows for c in r
                    if SYMBOL_RE.match(c.strip().upper()) and c.strip().upper() not in NOT_SYMBOLS}
            if len(syms) < MIN_PER_INDEX[code]:
                syms = set(html_symbols(doc))
            log(f"katilimendeksi.org {code}: {len(syms)} sembol ({url})")
            if len(syms) >= MIN_PER_INDEX[code]:
                result[code] = syms
                break
    return result


# ---------------------------------------------------------------------------
# Kaynak 2: Borsa İstanbul endeks dosyaları
# ---------------------------------------------------------------------------
BIST_CANDIDATES = [
    # "Endeks Şirketleri" / "Endeks Dosyaları" olası adresleri (doğrulanmadı)
    "https://www.borsaistanbul.com/data/endeksler/endeks_sirketleri.xlsx",
    "https://www.borsaistanbul.com/datum/endeks_sirketleri.xlsx",
    "https://www.borsaistanbul.com/files/endeks-sirketleri.xlsx",
    "https://www.borsaistanbul.com/tr/endeks-dosyalari",
    "https://www.borsaistanbul.com/tr/sayfa/2213/endeks-dosyalari",
    "https://www.borsaistanbul.com/tr/sayfa/130/endeksler",
]


def source_borsaistanbul() -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    queue = list(BIST_CANDIDATES)
    seen: set[str] = set()
    while queue:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        status, body, ctype = fetch(url)
        if status != 200 or not body:
            continue
        rows = body_rows(body, ctype, url)
        mem = rows_to_memberships(rows)
        log(f"borsaistanbul {url}: {len(rows)} satır, {len(mem)} sembol-üyelik")
        if len(mem) >= MIN_TOTAL_SYMBOLS:
            for sym, idx in mem.items():
                for i in idx:
                    result.setdefault(i, set()).add(sym)
            break
        # HTML sayfaysa içindeki xlsx/csv bağlantılarını kuyruğa ekle
        if b"<html" in body[:3000].lower() or b"<a " in body:
            doc = body.decode("utf-8", "replace")
            links = re.findall(r"href=[\"']([^\"']+\.(?:xlsx|xls|csv))[\"']", doc, flags=re.I)
            links = [l for l in links if re.search(r"endeks|index|sirket|company|katilim", l, re.I)]
            for l in links[:10]:
                full = l if l.startswith("http") else "https://www.borsaistanbul.com" + ("" if l.startswith("/") else "/") + l
                if full not in seen:
                    queue.append(full)
            if links:
                log(f"borsaistanbul: {len(links)} dosya bağlantısı kuyruğa eklendi")
    return result


# ---------------------------------------------------------------------------
# Kaynak 3: KAP
# ---------------------------------------------------------------------------
KAP_CANDIDATES = [
    "https://www.kap.org.tr/tr/Endeksler",
    "https://www.kap.org.tr/tr/api/endeksler",
    "https://www.kap.org.tr/tr/api/bist-indices",
]


def source_kap() -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for url in KAP_CANDIDATES:
        status, body, ctype = fetch(url)
        if status != 200 or not body:
            continue
        text = body.decode("utf-8", "replace")
        # JSON ise: [{indexCode:'XKTUM', members:[{code:'THYAO'}...]}] benzeri şekiller
        if "json" in ctype.lower() or text.lstrip().startswith(("[", "{")):
            try:
                j = json.loads(text)
            except Exception as e:
                log(f"kap JSON parse hatası: {e}", err=True)
                j = None
            if j is not None:
                _walk_json(j, result, current=None)
        else:
            # HTML: endeks başlığı ardından sembol listesi — bölümlere ayır
            parts = re.split(r"(X[A-Z0-9]{3,5})", text)
            cur = None
            for p in parts:
                if INDEX_CODE_RE.fullmatch(p or ""):
                    cur = p if p in INDEX_NAMES else None
                    continue
                if cur:
                    for s in html_symbols(p):
                        result.setdefault(cur, set()).add(s)
        total = len({s for v in result.values() for s in v})
        log(f"kap {url}: {total} sembol")
        if total >= MIN_TOTAL_SYMBOLS:
            break
    return result


def _walk_json(node, result: dict[str, set[str]], current: str | None) -> None:
    """Gezgin: endeks kodu taşıyan nesnelerin altındaki sembol dizilerini toplar."""
    if isinstance(node, dict):
        idx = current
        for k, v in node.items():
            if isinstance(v, str) and v.upper() in INDEX_NAMES and re.search(r"code|kod|index|endeks", k, re.I):
                idx = v.upper()
        for k, v in node.items():
            if idx and isinstance(v, str) and re.search(r"^(stock|hisse|sembol|symbol|ticker|kod|code)", k, re.I):
                vu = v.strip().upper()
                if SYMBOL_RE.match(vu) and vu not in NOT_SYMBOLS:
                    result.setdefault(idx, set()).add(vu)
            else:
                _walk_json(v, result, idx)
    elif isinstance(node, list):
        for it in node:
            _walk_json(it, result, current)


# ---------------------------------------------------------------------------
# Birleştirme / yazma
# ---------------------------------------------------------------------------
def load_existing() -> dict | None:
    try:
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def build_payload(by_index: dict[str, set[str]], source: str, as_of: str | None = None) -> dict:
    # Alt küme tutarlılığı: XK030 ⊂ XK050 ⊂ XK100 ⊂ XKTUM
    chain = ["XK030", "XK050", "XK100", "XKTUM"]
    acc: set[str] = set()
    for code in chain:
        if code in by_index:
            by_index[code] |= acc
            acc = set(by_index[code])
    symbols: dict[str, list[str]] = {}
    for code in INDEX_ORDER:
        for sym in by_index.get(code, ()):
            symbols.setdefault(sym, []).append(code)
    for sym in symbols:
        symbols[sym].sort(key=INDEX_ORDER.index)
    return {
        "ok": True,
        "asOf": as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "count": len(symbols),
        "indices": INDEX_NAMES,
        "symbols": dict(sorted(symbols.items())),
    }


def write_payload(payload: dict) -> None:
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    log(f"{OUTPUT_PATH} yazıldı: {payload['count']} sembol, source={payload['source']}")


def from_static() -> int:
    """src/data/katilim.ts içindeki KATILIM_STATIC'i parse eder."""
    with open(STATIC_TS_PATH, encoding="utf-8") as f:
        ts = f.read()
    m = re.search(r"KATILIM_STATIC[^=]*=\s*\{(.*?)\n\};", ts, flags=re.S)
    if not m:
        log("KATILIM_STATIC bloğu bulunamadı", err=True)
        return 1
    by_index: dict[str, set[str]] = {}
    for sym, arr in re.findall(r"^\s*([A-Z0-9]{3,6}):\s*\[([^\]]*)\]", m.group(1), flags=re.M):
        for code in re.findall(r"'([A-Z0-9]+)'", arr):
            if code in INDEX_NAMES:
                by_index.setdefault(code, set()).add(sym)
    dm = re.search(r"KATILIM_SNAPSHOT_DATE\s*=\s*'(\d{4}-\d{2}-\d{2})'", ts)
    payload = build_payload(by_index, "static:src/data/katilim.ts", dm.group(1) if dm else None)
    if payload["count"] < MIN_TOTAL_SYMBOLS:
        log(f"statik listeden yalnız {payload['count']} sembol çıktı — yazılmadı", err=True)
        return 1
    write_payload(payload)
    return 0


def main(argv: list[str]) -> int:
    if "--from-static" in argv:
        return from_static()

    sources = [
        ("katilimendeksi.org", source_katilimendeksi),
        ("borsaistanbul.com", source_borsaistanbul),
        ("kap.org.tr", source_kap),
    ]
    merged: dict[str, set[str]] = {}
    used: list[str] = []
    for name, fn in sources:
        log(f"=== Kaynak: {name} ===")
        try:
            got = fn()
        except Exception as e:
            log(f"{name} beklenmedik hata: {type(e).__name__}: {e}", err=True)
            got = {}
        got = {k: v for k, v in got.items() if k in INDEX_NAMES and len(v) >= MIN_PER_INDEX.get(k, 10)}
        summary = {k: len(v) for k, v in got.items()}
        log(f"{name} sonucu: {summary or 'yok'}")
        for k, v in got.items():
            if k not in merged:  # ilk başarılı kaynak kazanır
                merged[k] = set(v)
        if got:
            used.append(name)
        total = len({s for v in merged.values() for s in v})
        if "XKTUM" in merged and total >= MIN_TOTAL_SYMBOLS:
            log(f"XKTUM dahil {total} sembol toplandı — kalan kaynaklar atlanıyor")
            break

    total = len({s for v in merged.values() for s in v})
    if total < MIN_TOTAL_SYMBOLS:
        log(f"HİÇBİR kaynaktan ≥{MIN_TOTAL_SYMBOLS} sembol alınamadı (toplam {total}) — {OUTPUT_PATH} değiştirilmedi", err=True)
        return 1

    # Kaynaklardan gelmeyen endeksleri (ör. XKTMT/XSRDK) mevcut dosyadan koru
    existing = load_existing()
    kept: list[str] = []
    if existing and isinstance(existing.get("symbols"), dict):
        for sym, codes in existing["symbols"].items():
            for c in codes or []:
                if c in INDEX_NAMES and c not in merged:
                    merged.setdefault(c, set()).add(str(sym).upper())
                    if c not in kept:
                        kept.append(c)
    if kept:
        log(f"Mevcut dosyadan korunan endeksler: {kept} (kaynaklarda yoktu)")

    # Denetim (22 Eki 2026): sabit büyüklük ve alt-küme tutarlılığı — sağlanmazsa yanlış
    # "Katılım" rozeti riski; dosya değiştirilmez, exit 1.
    EXACT = {"XK030": 30, "XK050": 50, "XK100": 100}
    for code, n in EXACT.items():
        if code in merged and code not in kept and not (n - 2 <= len(merged[code]) <= n + 2):
            log(f"HATA: {code} {len(merged[code])} sembol, beklenen {n}±2 — kaynak reddedildi")
            return 1
    chain = ["XK030", "XK050", "XK100", "XKTUM"]
    for a, b in zip(chain, chain[1:]):
        if a in merged and b in merged and not merged[a].issubset(merged[b]):
            missing = sorted(merged[a] - merged[b])[:10]
            log(f"HATA: {a} ⊄ {b} (örnek: {missing}) — kaynak reddedildi")
            return 1

    payload = build_payload(merged, "+".join(used) + (f" (korunan: {','.join(kept)})" if kept else ""))
    payload["indicesFetched"] = sorted(k for k in merged if k not in kept)
    write_payload(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
