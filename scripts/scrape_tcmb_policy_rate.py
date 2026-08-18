"""
TCMB Politika Faizi Scraper
============================

TCMB'nin Para Politikası Kurulu (PPK) kararlarını içeren sayfayı çekip
en güncel politika faizini (haftalık repo faizi) tespit eder.

Kaynak: https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb+tr/main+menu/temel+faaliyetler/para+politikasi/pp+kurulu+kararlari

Çıktı: data/tcmb-policy-rate.json

Kullanım:
    python scripts/scrape_tcmb_policy_rate.py

Not: TCMB PPK ayda bir toplanır (bazen istisnai kararlar dışında). Bu yüzden
cron aylık çalışır. Değişiklik yoksa JSON güncellenmez (commit atlanır).
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.request import Request, urlopen

TCMB_PPK_URL = (
    "https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb+tr/main+menu/"
    "temel+faaliyetler/para+politikasi/pp+kurulu+kararlari"
)

OUTPUT_FILE = Path(__file__).parent.parent / "data" / "tcmb-policy-rate.json"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# TCMB sayfasında politika faizi genelde "%X" veya "yüzde X" olarak geçer.
# Fallback regex'ler — sırayla dene, ilk match kazanır.
RATE_PATTERNS = [
    # "politika faizini (bir hafta vadeli repo ihale faiz oranını) %37"
    r"politika faizi[a-zçğıöşü\s\(\)]*?%\s*(\d{1,2}(?:[,.]\d{1,2})?)",
    # "haftalik repo faiz orani %37"
    r"haftalık?\s+repo[a-zçğıöşü\s]*?%\s*(\d{1,2}(?:[,.]\d{1,2})?)",
    # "yuzde 37"
    r"yüzde\s+(\d{1,2}(?:[,.]\d{1,2})?)",
]


def fetch_html(url: str, timeout: int = 30) -> str:
    """TCMB sayfasını HTML olarak çeker. Basit fetch — JS gerektirmez."""
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "tr-TR,tr"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def extract_rate(html: str) -> float | None:
    """
    HTML içinden politika faizini regex ile çıkarır. Türkçe ondalık ayracı
    (virgül) noktaya çevrilir. Bulunamazsa None döner.
    """
    lower = html.lower()
    for pattern in RATE_PATTERNS:
        m = re.search(pattern, lower)
        if m:
            raw = m.group(1).replace(",", ".")
            try:
                val = float(raw)
                # Sanity check — politika faizi %5-%100 aralığında olmalı
                if 5 <= val <= 100:
                    return val
            except ValueError:
                continue
    return None


def read_current() -> dict:
    """Mevcut JSON'u oku (yoksa boş dict)."""
    if not OUTPUT_FILE.exists():
        return {}
    try:
        return json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def write_new(rate: float) -> None:
    """Yeni değeri JSON'a yaz (2 decimal)."""
    payload = {
        "rate": round(rate, 2),
        "lastUpdate": date.today().isoformat(),
        "source": "TCMB Para Politikası Kurulu Kararı",
        "note": (
            "Aylık cron ile otomatik güncellenir "
            "(scripts/scrape_tcmb_policy_rate.py). Manuel güncelleme "
            "gerekirse: rate + lastUpdate alanlarını değiştir."
        ),
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    print(f"[{datetime.now().isoformat()}] TCMB politika faizi scraper başladı")
    try:
        html = fetch_html(TCMB_PPK_URL)
    except Exception as e:
        print(f"HATA: TCMB sayfası çekilemedi: {e}", file=sys.stderr)
        return 2

    rate = extract_rate(html)
    if rate is None:
        print("UYARI: HTML'den politika faizi çıkarılamadı — regex match yok", file=sys.stderr)
        # Debug için ilk 2KB kaydet
        debug_path = OUTPUT_FILE.parent / "tcmb-policy-rate-debug.html"
        debug_path.write_text(html[:20000], encoding="utf-8")
        print(f"Debug HTML: {debug_path}", file=sys.stderr)
        return 3

    current = read_current()
    current_rate = current.get("rate")
    if current_rate == round(rate, 2):
        print(f"Değişiklik yok — mevcut oran: %{rate}")
        return 0

    print(f"Politika faizi güncellendi: %{current_rate} → %{rate}")
    write_new(rate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
