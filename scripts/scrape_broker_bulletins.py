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
            first_page_text = pdf.pages[0].extract_text() or ""
            # 2. sayfa varsa onu da ekle (kısa bültenler için)
            if len(first_page_text) < 400 and len(pdf.pages) > 1:
                second = pdf.pages[1].extract_text() or ""
                first_page_text = first_page_text + "\n" + second

        cleaned = clean_text(first_page_text)
        if not cleaned:
            result["error"] = "PDF'ten metin çıkarılamadı"
            return result

        date = extract_date(cleaned)
        excerpt = cleaned[:EXCERPT_MAX_CHARS]
        if len(cleaned) > EXCERPT_MAX_CHARS:
            # Son kelimeyi yarım kesme
            last_space = excerpt.rfind(" ")
            if last_space > EXCERPT_MAX_CHARS - 100:
                excerpt = excerpt[:last_space]
            excerpt = excerpt.rstrip(" .,;:") + "…"

        result.update({
            "ok": True,
            "title": "Günlük Piyasa Bülteni",
            "date": date,
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


def fetch_kt() -> dict:
    """KT Yatırım — site JS-rendered, sadece link tutuyoruz şimdilik."""
    return {
        "id": "kt-yatirim",
        "name": "KT Yatırım",
        "sourceUrl": "https://kuveytturkyatirim.com.tr/arastirma-raporlari/?category=G%C3%BCnl%C3%BCk+B%C3%BClten&search=&date=&page=1",
        "ok": False,
        "error": "KT sitesi JS-rendered; bülten metni server-side scrape edilemiyor. Link aktif.",
    }


def main() -> int:
    print("Aracı kurum bültenleri scrape başlıyor (v1.0.1)…")

    bulletins = {
        "osmanli-yatirim": fetch_osmanli(),
        "kt-yatirim": fetch_kt(),
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
