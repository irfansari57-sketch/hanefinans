"""
Aracı kurum hisse önerilerini günlük PDF bültenlerinden Claude Haiku ile çıkarır.

Akış:
  1. Her broker için PDF URL'sini bul (sabit ya da listing scrape)
  2. PDF'i indir + metnini çıkar (pdfplumber)
  3. Claude API'ye yolla, JSON formatında öneri listesi döner
  4. data/broker-recommendations.json'a yaz

Şu an desteklenenler:
  - Osmanlı Menkul (sabit PDF URL)
  - KT Yatırım (listing scrape ile en yeni günlük bülten URL'i)

Diğer brokerlar (İş, Garanti, Halk, Ziraat) Playwright gerektiriyor (JS-rendered);
bunlar şimdilik static frontend datasında kalır.

Env (GH Actions secret):
  ANTHROPIC_API_KEY — Claude API key
"""

from __future__ import annotations

import io
import json
import os
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

try:
    import anthropic  # type: ignore[import-not-found]
except ImportError:
    print("anthropic gerekli: pip install anthropic", file=sys.stderr)
    sys.exit(1)


OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "broker-recommendations.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 HaneFinans/1.0",
    "Accept": "application/pdf,*/*",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
}

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    print("ANTHROPIC_API_KEY env tanımlı değil", file=sys.stderr)
    sys.exit(1)

CLIENT = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
MODEL = "claude-haiku-4-5-20251001"

EXTRACTION_PROMPT = """Aşağıdaki Türk aracı kurum günlük bülteni / araştırma raporundan öne çıkarılan HİSSE ÖNERİLERİNİ çıkar.

KURALLAR:
- Sadece bugün/güncel hisse önerilerini al, geçmiş raporları dahil etme
- BIST kodlarını UPPERCASE yaz (THYAO, AKBNK gibi)
- Rating yoksa "AL" varsay (broker'ın bültene aldığı zaten "olumlu" demek)
- Rating değerleri: "AL" | "GÜÇLÜ AL" | "TUT" | "BIRIKIM YAP" | "NÖTR"
- thesis: 1 cümlelik yatırım gerekçesi (max 150 karakter)
- targetPrice: TL cinsinden hedef fiyat (sayısal); yoksa null
- stopLoss: stop seviyesi varsa (sayısal); yoksa null
- Maksimum 8 öneri çıkar

YALNIZCA bu JSON formatında dön (başka metin yok):
{
  "recommendations": [
    {
      "symbol": "THYAO",
      "rating": "AL",
      "targetPrice": 320,
      "stopLoss": null,
      "thesis": "Trafik toparlanma + güçlü yaz sezonu, ücret marjı korunuyor."
    }
  ]
}

Eğer bültende açık hisse önerisi YOKSA boş array dön: {"recommendations": []}

BÜLTEN İÇERİĞİ:
"""


def extract_pdf_text(pdf_bytes: bytes, max_pages: int = 5) -> str:
    """PDF'in ilk N sayfasını text'e çevir."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        if not pdf.pages:
            return ""
        texts = [(p.extract_text() or "") for p in pdf.pages[:max_pages]]
        return "\n".join(texts)


def parse_with_claude(broker_name: str, text: str) -> list[dict]:
    """Claude'a bülteni yolla, hisse önerisi JSON listesi al."""
    if not text or len(text) < 200:
        print(f"  ! {broker_name}: metin çok kısa ({len(text)} chars), atlanıyor")
        return []

    truncated = text[:12000]  # token sınırı için
    try:
        response = CLIENT.messages.create(
            model=MODEL,
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": EXTRACTION_PROMPT + truncated,
            }],
        )
        content = response.content[0].text  # type: ignore[union-attr]
        # JSON bloku bul
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            print(f"  ! {broker_name}: JSON bulunamadı in Claude yanıtı")
            return []
        data = json.loads(match.group(0))
        recs = data.get("recommendations", [])
        if not isinstance(recs, list):
            return []
        # Validate her bir öneri
        cleaned = []
        for r in recs:
            sym = str(r.get("symbol", "")).strip().upper()
            rating = str(r.get("rating", "AL")).strip().upper()
            if not sym or len(sym) > 8:
                continue
            if rating not in {"AL", "GÜÇLÜ AL", "TUT", "BIRIKIM YAP", "NÖTR"}:
                rating = "AL"
            tp = r.get("targetPrice")
            sl = r.get("stopLoss")
            thesis = str(r.get("thesis", "")).strip()[:200]
            cleaned.append({
                "symbol": sym,
                "rating": rating,
                "targetPrice": float(tp) if tp is not None else None,
                "stopLoss": float(sl) if sl is not None else None,
                "thesis": thesis,
                "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            })
        return cleaned[:8]
    except Exception as e:
        print(f"  ! {broker_name}: Claude hatası: {type(e).__name__}: {e}")
        return []


def fetch_osmanli() -> dict:
    """Osmanlı Menkul — sabit PDF URL."""
    pdf_url = "https://www.osmanlimenkul.com.tr/upload/CmsBulletin/Gunluk_Bulten.pdf"
    result = {
        "brokerId": "osmanli-yatirim",
        "brokerName": "Osmanlı Yatırım",
        "initials": "OY",
        "colorSeed": "#10b981",
        "sourceUrl": "https://www.osmanlimenkul.com.tr/finansal-planlama/egitim/bulten-talep",
        "lastUpdate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "recommendations": [],
        "ok": False,
    }
    print(f"Osmanlı Yatırım scrape başlıyor...")
    try:
        r = requests.get(pdf_url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        text = extract_pdf_text(r.content)
        print(f"  PDF: {len(text)} karakter çıkarıldı")
        recs = parse_with_claude("Osmanlı Yatırım", text)
        result["recommendations"] = recs
        result["ok"] = len(recs) > 0
        print(f"  ✓ {len(recs)} öneri")
    except Exception as e:
        print(f"  ✗ Hata: {type(e).__name__}: {e}")
        result["error"] = str(e)
    return result


def fetch_isyatirim() -> dict:
    """
    İş Yatırım — is-yatirimin-onerileri.aspx sayfasında 'encokoneri' tablosunu
    server-rendered HTML'den parse eder. Tek sayfada hem öneriler hem model
    portföy ağırlıkları geliyor.

    Tablo kolonları:
      0: Hisse (link içinde sembol)
      1: Öneri Tarihi (DD.MM.YYYY)
      2: Kapanış (TL)
      3: Hedef Fiyat (TL)
      4: Potansiyel (%)
      5-7: Getiriler
      8-9: Hacim
      10: Ağırlık (%) → model portföy
    """
    url = "https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/is-yatirimin-onerileri.aspx"
    result = {
        "brokerId": "is-yatirim",
        "brokerName": "İş Yatırım",
        "initials": "İY",
        "colorSeed": "#0ea5e9",
        "sourceUrl": url,
        "lastUpdate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "recommendations": [],
        "portfolio": [],
        "ok": False,
    }
    print(f"İş Yatırım scrape başlıyor...")
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        html = r.text

        # encokoneri tablosunu bul + tbody içeriğini al
        m = re.search(r'data-csvname="encokoneri"[^>]*>.*?<tbody>(.*?)</tbody>', html, re.DOTALL)
        if not m:
            result["error"] = "encokoneri tablosu bulunamadı"
            print(f"  ✗ Tablo bulunamadı")
            return result

        tbody = m.group(1)
        rows = re.findall(r'<tr>(.*?)</tr>', tbody, re.DOTALL)
        print(f"  ✓ {len(rows)} satır bulundu")

        for row in rows:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
            if len(cells) < 11:
                continue
            # Sembol kodu — <a>SYMBOL</a> içinden
            sym_match = re.search(r'>\s*([A-Z]{3,6})\s*</a>', cells[0])
            if not sym_match:
                continue
            symbol = sym_match.group(1).strip()

            # Tarih
            date_str = cells[1].strip()  # 14.04.2026
            try:
                d, mo, y = date_str.split('.')
                iso_date = f"{y}-{mo}-{d}"
            except Exception:
                iso_date = result["lastUpdate"]

            # Float parse helper (TR format: 1.234,56)
            def parse_tr_float(s: str) -> float | None:
                s = re.sub(r'<[^>]+>', '', s).strip()
                if not s or s == '-':
                    return None
                s = s.replace('.', '').replace(',', '.')
                try:
                    return float(s)
                except ValueError:
                    return None

            close_tl = parse_tr_float(cells[2])
            target_tl = parse_tr_float(cells[3])
            potential = parse_tr_float(cells[4])
            weight = parse_tr_float(cells[10])

            # Recommendation: AL (encokoneri tablosu zaten "en çok önerilen" demek)
            rating = "AL"
            if potential is not None and potential >= 30:
                rating = "GÜÇLÜ AL"

            thesis = ''
            if target_tl and close_tl and potential:
                thesis = f"Mevcut {close_tl:.2f}₺ → hedef {target_tl:.2f}₺ (%{potential:.0f} potansiyel)"

            result["recommendations"].append({
                "symbol": symbol,
                "rating": rating,
                "targetPrice": target_tl,
                "stopLoss": None,
                "thesis": thesis,
                "updatedAt": iso_date,
            })

            if weight and weight > 0:
                result["portfolio"].append({
                    "symbol": symbol,
                    "weight": weight,
                })

        # Önerileri potansiyel sırasına göre top 8
        result["recommendations"].sort(key=lambda x: x.get("targetPrice") or 0, reverse=True)
        result["recommendations"] = result["recommendations"][:8]

        result["ok"] = len(result["recommendations"]) > 0
        print(f"  ✓ {len(result['recommendations'])} öneri, {len(result['portfolio'])} portföy hissesi")
    except Exception as e:
        print(f"  ✗ Hata: {type(e).__name__}: {e}")
        result["error"] = str(e)
    return result


def fetch_kt() -> dict:
    """KT Yatırım — listing'den en yeni gunluk-bulten PDF'i bul."""
    base = "https://kuveytturkyatirim.com.tr"
    listing_url = f"{base}/arastirma-raporlari/"
    result = {
        "brokerId": "kt-yatirim",
        "brokerName": "KT Yatırım",
        "initials": "KT",
        "colorSeed": "#ec4899",
        "sourceUrl": f"{listing_url}?category=G%C3%BCnl%C3%BCk+B%C3%BClten",
        "lastUpdate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "recommendations": [],
        "ok": False,
    }
    print(f"KT Yatırım scrape başlıyor...")
    try:
        r = requests.get(listing_url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        html = r.text
        pdf_pattern = re.compile(
            r'(/media/[a-z0-9]+/gunluk-bulten_(\d{2})(\d{2})(\d{4})\.pdf)',
            re.IGNORECASE,
        )
        matches = pdf_pattern.findall(html)
        if not matches:
            result["error"] = "Listing'de gunluk-bulten PDF bulunamadı"
            print(f"  ✗ PDF link bulunamadı")
            return result
        latest = max(matches, key=lambda m: (m[3], m[2], m[1]))
        pdf_url = base + latest[0]
        print(f"  Latest PDF: {latest[0]}")
        pr = requests.get(pdf_url, headers=HEADERS, timeout=30)
        pr.raise_for_status()
        text = extract_pdf_text(pr.content)
        print(f"  PDF: {len(text)} karakter çıkarıldı")
        recs = parse_with_claude("KT Yatırım", text)
        result["recommendations"] = recs
        result["ok"] = len(recs) > 0
        print(f"  ✓ {len(recs)} öneri")
    except Exception as e:
        print(f"  ✗ Hata: {type(e).__name__}: {e}")
        result["error"] = str(e)
    return result


def main() -> int:
    print("=" * 60)
    print(f"Aracı Kurum Hisse Önerileri Scraper — {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    brokers = [fetch_isyatirim(), fetch_osmanli(), fetch_kt()]

    success_count = sum(1 for b in brokers if b.get("ok"))
    total_recs = sum(len(b.get("recommendations", [])) for b in brokers)

    payload = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL,
        "brokers": brokers,
        "summary": {
            "total_brokers": len(brokers),
            "successful": success_count,
            "total_recommendations": total_recs,
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ {OUTPUT_PATH.relative_to(OUTPUT_PATH.parent.parent)} yazıldı")
    print(f"  {success_count}/{len(brokers)} broker başarılı, {total_recs} öneri toplam")

    return 0 if success_count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
