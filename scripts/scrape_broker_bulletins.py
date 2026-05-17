"""
Aracı kurum günlük bültenlerini scrape eder, metin özetini JSON olarak kaydeder.

Şu an desteklenenler:
  - Osmanlı Menkul Değerler — sabit PDF URL (Gunluk_Bulten.pdf) + pdfplumber ile metin çıkarma
  - KT Yatırım — site JS-rendered olduğu için sadece link tutuluyor (excerpt boş)

Output: data/broker-bulletins.json
{
  "fetchedAt": "2026-05-17T08:35:12Z",
  "bulletins": {
    "osmanli-yatirim": {
      "id": "osmanli-yatirim",
      "title": "Günlük Piyasa Bülteni",
      "pdfUrl": "https://www.osmanlimenkul.com.tr/upload/CmsBulletin/Gunluk_Bulten.pdf",
      "date": "17.05.2026",   // PDF içinden parse
      "excerpt": "...ilk 700 karakter...",
      "ok": true
    },
    "kt-yatirim": { "id": "kt-yatirim", "ok": false, "error": "JS-rendered, scrape edilemiyor" }
  }
}
"""

from __future__ import annotations

import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

try:
    import pdfplumber
except ImportError:
    print("pdfplumber gerekli: pip install pdfplumber", file=sys.stderr)
    sys.exit(1)


OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "broker-bulletins.json"
EXCERPT_MAX_CHARS = 800
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 HaneFinans/1.0",
    "Accept": "application/pdf,*/*",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
}

DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2})[./\s-](\d{1,2})[./\s-](20\d{2})\b"),
    re.compile(r"\b(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|"
               r"Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(20\d{2})\b", re.IGNORECASE),
]
TR_MONTHS = {
    "ocak": "01", "şubat": "02", "mart": "03", "nisan": "04",
    "mayıs": "05", "haziran": "06", "temmuz": "07", "ağustos": "08",
    "eylül": "09", "ekim": "10", "kasım": "11", "aralık": "12",
}


def extract_date(text: str) -> str | None:
    """PDF metninden tarih parse — DD.MM.YYYY formatında döner."""
    head = text[:600]
    for pat in DATE_PATTERNS:
        m = pat.search(head)
        if not m:
            continue
        g = m.groups()
        if g[1].isdigit():
            d, mo, y = g
        else:
            d, mon_name, y = g
            mo = TR_MONTHS.get(mon_name.lower())
            if not mo:
                continue
        try:
            return f"{int(d):02d}.{int(mo):02d}.{y}"
        except ValueError:
            continue
    return None


def clean_text(raw: str) -> str:
    """PDF metninde fazla boşluk, kırık satır, header/footer temizliği."""
    lines = []
    for ln in raw.splitlines():
        s = ln.strip()
        if not s:
            continue
        if re.fullmatch(r"[\d/.\s-]+", s):  # sayfa numarası vb.
            continue
        if len(s) < 3:
            continue
        lines.append(s)
    text = " ".join(lines)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


# Osmanlı bülten bölüm başlıkları — pdfplumber soldan sağa okuduğu için
# "Borsa Günlük" ile "Yorum ve Strateji" arasında tablo header'ları çıkıyor;
# bu yüzden esnek regex kullanılıyor.
SECTION_PATTERNS = [
    (re.compile(r"Borsa\s+Günlük.{0,250}?Yorum\s+ve\s+Strateji", re.DOTALL), "Borsa Günlük Yorum ve Strateji"),
    (re.compile(r"\bGünlük\s+Haberler\b"), "Günlük Haberler"),
    (re.compile(r"\bEkonomi\s+Haberleri\b"), "Ekonomi Haberleri"),
    (re.compile(r"\bŞirket\s+Haberleri\b"), "Şirket Haberleri"),
    (re.compile(r"\bSektör\s+Haberleri\b"), "Sektör Haberleri"),
    (re.compile(r"\bVeri\s+Takvimi\b"), "Veri Takvimi"),
    (re.compile(r"\bGünün\s+Verileri\b"), "Günün Verileri"),
]


TR_CHARS = set("şŞçÇğĞüÜıİöÖâîû")
SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÇĞIİÖŞÜ])")
TABLE_CHUNK_RE = re.compile(r"(?:[A-Z]{2,5}\s+[-+]?\d+(?:[.,]\d+)?\s*%?\s*){2,}|\b\d{1,2}[.,]\d{2}\b\s+[-+]?\d+(?:[.,]\d+)?\s*%?\b")


def clean_section_body(body: str) -> str:
    """
    İki aşamalı temizlik:
      1) Tüm metni tek satıra getir + inline tablo bloklarını sil
         (örn "DAX 24,549.56 1.42 3.19 1.55 23.31" gibi spread number listeleri).
      2) Cümlelere böl, düzgün Türkçe cümle olanları seç.
    """
    # 1) Satır kırılmalarını boşluğa çevir
    text = re.sub(r"[\n\r]+", " ", body)
    text = re.sub(r"\s{2,}", " ", text).strip()

    # Inline tablo bloklarını çıkar (ardışık sayı kümeleri)
    text = TABLE_CHUNK_RE.sub(" ", text)
    text = re.sub(r"\s{2,}", " ", text).strip()

    # 2) Cümlelere böl
    sentences = SENTENCE_END_RE.split(text)
    keep = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(s) < 25:  # çok kısa parçalar tablo cell
            continue
        # Türkçe karakter içermeli (saf İngilizce/tablo değil)
        if not any(c in TR_CHARS for c in s) and not re.search(r"\b(ve|bir|olan|gibi|için|ile|olarak)\b", s):
            continue
        # Sayı yoğunluğu > %30 ise tablo satırı
        digit_count = sum(1 for c in s if c.isdigit())
        if len(s) > 0 and digit_count / len(s) > 0.30:
            continue
        # Ardışık 4+ sayı/% kümesi varsa tablo
        if re.search(r"(?:[-+]?\d+(?:[.,]\d+)?\s*%?\s+){3,}[-+]?\d+(?:[.,]\d+)?", s):
            continue
        keep.append(s)

    result = " ".join(keep)
    return re.sub(r"\s{2,}", " ", result).strip()


def extract_sections(text: str) -> list:
    """Bilinen başlıklara göre PDF metnini bölümlere ayır."""
    matches = []
    for pattern, label in SECTION_PATTERNS:
        for m in pattern.finditer(text):
            matches.append((m.start(), m.end(), label))
    if not matches:
        return []

    matches.sort(key=lambda x: x[0])
    # Aynı başlığın birden fazla geçtiği durumda ilkini kullan
    deduped = []
    seen = set()
    for start, end, label in matches:
        if label in seen:
            continue
        seen.add(label)
        deduped.append((start, end, label))

    sections = []
    for i, (_, end, label) in enumerate(deduped):
        next_start = deduped[i + 1][0] if i + 1 < len(deduped) else len(text)
        body = text[end:next_start]
        body = clean_section_body(body)
        if body and len(body) > 30:
            # Section başına max 1200 karakter
            if len(body) > 1200:
                last_space = body[:1200].rfind(" ")
                body = (body[:last_space] if last_space > 1000 else body[:1200]).rstrip(" .,;:") + "…"
            sections.append({"title": label, "content": body})
    return sections


def fetch_osmanli() -> dict:
    """Osmanlı Menkul günlük bülten PDF'ini indir + ilk sayfa metnini çıkar."""
    pdf_url = "https://www.osmanlimenkul.com.tr/upload/CmsBulletin/Gunluk_Bulten.pdf"
    result = {
        "id": "osmanli-yatirim",
        "name": "Osmanlı Yatırım",
        "pdfUrl": pdf_url,
        "sourceUrl": "https://www.osmanlimenkul.com.tr/finansal-planlama/egitim/bulten-talep",
        "ok": False,
    }
    try:
        r = requests.get(pdf_url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        if not r.content or len(r.content) < 1000:
            result["error"] = "PDF içeriği boş veya çok küçük"
            return result

        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            if not pdf.pages:
                result["error"] = "PDF sayfa içermiyor"
                return result
            # TÜM sayfaları çıkar — sections cross-page olabilir (haberler 2-3. sayfada)
            raw_pages = [(p.extract_text() or "") for p in pdf.pages[:5]]
            all_raw = "\n".join(raw_pages)

        if not all_raw.strip():
            result["error"] = "PDF'ten metin çıkarılamadı"
            return result

        # Bölümleri parse et (ham metinden — başlıkları satır kırılma olmadan bulmak için)
        sections = extract_sections(all_raw)

        # Geriye uyumlu excerpt (sections boşsa fallback için)
        cleaned = clean_text(all_raw)
        date = extract_date(cleaned)
        excerpt = cleaned[:EXCERPT_MAX_CHARS]
        if len(cleaned) > EXCERPT_MAX_CHARS:
            last_space = excerpt.rfind(" ")
            if last_space > EXCERPT_MAX_CHARS - 100:
                excerpt = excerpt[:last_space]
            excerpt = excerpt.rstrip(" .,;:") + "…"

        result.update({
            "ok": True,
            "title": "Günlük Piyasa Bülteni",
            "date": date,
            "excerpt": excerpt,
            "sections": sections,
            "fullLength": len(cleaned),
        })
        return result

    except requests.RequestException as e:
        result["error"] = f"İndirme hatası: {e}"
        return result
    except Exception as e:
        result["error"] = f"Parse hatası: {e}"
        return result


def fetch_kt() -> dict:
    """KT Yatırım — listing sayfasından en yeni gunluk-bulten_DDMMYYYY.pdf URL'sini bul + parse et."""
    base = "https://kuveytturkyatirim.com.tr"
    listing_url = f"{base}/arastirma-raporlari/"
    result = {
        "id": "kt-yatirim",
        "name": "KT Yatırım",
        "sourceUrl": f"{listing_url}?category=G%C3%BCnl%C3%BCk+B%C3%BClten&search=&date=&page=1",
        "ok": False,
    }
    try:
        r = requests.get(listing_url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        html = r.text

        # /media/[hash]/gunluk-bulten_DDMMYYYY.pdf pattern
        pdf_pattern = re.compile(r'(/media/[a-z0-9]+/gunluk-bulten_(\d{2})(\d{2})(\d{4})\.pdf)', re.IGNORECASE)
        matches = pdf_pattern.findall(html)
        if not matches:
            result["error"] = "Listing'de gunluk-bulten PDF bulunamadı (sayfa yapısı değişmiş olabilir)"
            return result

        # En yeni tarihi seç
        latest = max(matches, key=lambda m: (m[3], m[2], m[1]))  # (yıl, ay, gün)
        pdf_path, dd, mm, yyyy = latest
        pdf_url = base + pdf_path
        bulletin_date = f"{dd}.{mm}.{yyyy}"
        result["pdfUrl"] = pdf_url

        # PDF indir + parse
        pr = requests.get(pdf_url, headers=HEADERS, timeout=30)
        pr.raise_for_status()
        if not pr.content or len(pr.content) < 1000:
            result["error"] = f"PDF içeriği boş ({len(pr.content)} byte)"
            return result

        with pdfplumber.open(io.BytesIO(pr.content)) as pdf:
            if not pdf.pages:
                result["error"] = "PDF sayfa içermiyor"
                return result
            first_page_text = pdf.pages[0].extract_text() or ""
            if len(first_page_text) < 400 and len(pdf.pages) > 1:
                second = pdf.pages[1].extract_text() or ""
                first_page_text = first_page_text + "\n" + second

        cleaned = clean_text(first_page_text)
        if not cleaned:
            result["error"] = "PDF'ten metin çıkarılamadı"
            return result

        excerpt = cleaned[:EXCERPT_MAX_CHARS]
        if len(cleaned) > EXCERPT_MAX_CHARS:
            last_space = excerpt.rfind(" ")
            if last_space > EXCERPT_MAX_CHARS - 100:
                excerpt = excerpt[:last_space]
            excerpt = excerpt.rstrip(" .,;:") + "…"

        result.update({
            "ok": True,
            "title": "Günlük Bülten",
            "date": bulletin_date,
            "excerpt": excerpt,
            "fullLength": len(cleaned),
        })
        return result

    except requests.RequestException as e:
        result["error"] = f"İndirme hatası: {e}"
        return result
    except Exception as e:
        result["error"] = f"Parse hatası: {e}"
        return result


def main() -> int:
    print("Aracı kurum bültenleri scrape başlıyor (v1.0.1)…")

    bulletins = {
        "osmanli-yatirim": fetch_osmanli(),
    }

    for bid, b in bulletins.items():
        if b.get("ok"):
            date = b.get("date") or "?"
            print(f"  ✓ {bid}: {date} — {b.get('fullLength', 0)} karakter çıkarıldı")
        else:
            print(f"  ✗ {bid}: {b.get('error', 'bilinmeyen hata')}")

    payload = {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "bulletins": bulletins,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ {OUTPUT_PATH.relative_to(OUTPUT_PATH.parent.parent)} yazıldı")
    return 0


if __name__ == "__main__":
    sys.exit(main())
