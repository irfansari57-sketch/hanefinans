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
    ANTHROPIC_AVAILABLE = True
except ImportError:
    print("anthropic yok — Claude-bağımlı brokerlar (Osmanlı, KT) atlanır", file=sys.stderr)
    ANTHROPIC_AVAILABLE = False


OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "broker-recommendations.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 HaneFinans/1.0",
    "Accept": "application/pdf,*/*",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
}

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
HAS_CLAUDE = ANTHROPIC_AVAILABLE and bool(ANTHROPIC_API_KEY)

if HAS_CLAUDE:
    CLIENT = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    MODEL = "claude-haiku-4-5-20251001"
    print(f"✓ Claude AI aktif — Osmanlı + KT için PDF parse")
else:
    CLIENT = None  # type: ignore[assignment]
    MODEL = ""
    print("⚠ ANTHROPIC_API_KEY yok — sadece İş Yatırım (HTML scrape) dinamik olacak")

PORTFOLIO_PROMPT = """Aşağıdaki Türk aracı kurum MODEL PORTFÖY raporundan hisse ağırlıklarını çıkar.

KURALLAR:
- Sadece hisse kodu + ağırlık (%) çıkar — başka metrik yok
- BIST kodları UPPERCASE (THYAO, AKBNK gibi)
- Ağırlıklar sayısal (% işareti olmadan), toplam yaklaşık 100 olmalı
- Maksimum 15 hisse

YALNIZCA bu JSON formatında dön:
{
  "holdings": [
    {"symbol": "THYAO", "weight": 15},
    {"symbol": "AKBNK", "weight": 12}
  ]
}

Eğer portföy bulunamazsa: {"holdings": []}

PORTFÖY İÇERİĞİ:
"""


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


def parse_with_claude(broker_name: str, text: str) -> tuple[list[dict], str | None]:
    """Claude'a bülteni yolla, hisse önerisi JSON listesi al.

    Returns (recommendations, error_msg). error_msg is None on success.
    """
    if not HAS_CLAUDE or CLIENT is None:
        return [], "Claude API not available (ANTHROPIC_API_KEY yok)"
    if not text or len(text) < 200:
        msg = f"PDF text too short ({len(text)} chars)"
        print(f"  ! {broker_name}: {msg}")
        return [], msg

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
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            msg = f"JSON not found in Claude response (first 200 chars: {content[:200]!r})"
            print(f"  ! {broker_name}: {msg}")
            return [], msg
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError as je:
            msg = f"Claude JSON parse failed: {je}"
            print(f"  ! {broker_name}: {msg}")
            return [], msg
        recs = data.get("recommendations", [])
        if not isinstance(recs, list):
            return [], f"Claude returned 'recommendations' as {type(recs).__name__}, not list"
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
        if not cleaned:
            return [], f"Claude returned {len(recs)} items but all were filtered out (invalid symbol/format)"
        return cleaned[:8], None
    except Exception as e:
        msg = f"Claude exception: {type(e).__name__}: {e}"
        print(f"  ! {broker_name}: {msg}")
        return [], msg


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
    result["debugLog"] = []
    log = result["debugLog"]
    print(f"Osmanlı Yatırım scrape başlıyor...")
    try:
        log.append(f"GET {pdf_url}")
        r = requests.get(pdf_url, headers=HEADERS, timeout=30)
        log.append(f"HTTP {r.status_code}, {len(r.content)} bytes, type={r.headers.get('Content-Type','?')}")
        print(f"  PDF: HTTP {r.status_code}, {len(r.content)} bytes")
        r.raise_for_status()
        text = extract_pdf_text(r.content)
        log.append(f"PDF text: {len(text)} chars")
        print(f"  PDF: {len(text)} karakter çıkarıldı")
        if len(text) < 200:
            log.append(f"Text too short. First 200 chars: {text[:200]!r}")
        recs, err = parse_with_claude("Osmanlı Yatırım", text)
        result["recommendations"] = recs
        result["ok"] = len(recs) > 0
        if err:
            log.append(f"Claude: {err}")
            result["error"] = err
        log.append(f"Result: {len(recs)} recommendations")
        print(f"  {'✓' if recs else '✗'} {len(recs)} öneri")
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        log.append(f"Exception: {msg}")
        result["error"] = msg
        print(f"  ✗ Hata: {msg}")
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


def parse_portfolio_with_claude(broker_name: str, text: str) -> list[dict]:
    """Claude'a model portföy PDF metnini yolla, holdings JSON listesi al."""
    if not HAS_CLAUDE or CLIENT is None:
        return []
    if not text or len(text) < 200:
        print(f"  ! {broker_name} portföy: metin çok kısa ({len(text)} chars)")
        return []
    truncated = text[:12000]
    try:
        response = CLIENT.messages.create(
            model=MODEL,
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": PORTFOLIO_PROMPT + truncated,
            }],
        )
        content = response.content[0].text  # type: ignore[union-attr]
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            print(f"  ! {broker_name} portföy: JSON bulunamadı")
            return []
        data = json.loads(match.group(0))
        holdings = data.get("holdings", [])
        if not isinstance(holdings, list):
            return []
        cleaned = []
        for h in holdings:
            sym = str(h.get("symbol", "")).strip().upper()
            w = h.get("weight")
            if not sym or len(sym) > 8 or w is None:
                continue
            try:
                weight = float(w)
            except (TypeError, ValueError):
                continue
            if weight <= 0 or weight > 100:
                continue
            cleaned.append({"symbol": sym, "weight": round(weight, 2)})
        return cleaned[:15]
    except Exception as e:
        print(f"  ! {broker_name} portföy: Claude hatası: {type(e).__name__}: {e}")
        return []


def fetch_kt() -> dict:
    """
    KT Yatırım — iki kaynak:
      1. gunluk-bulten_DDMMYYYY.pdf → recommendations (Günlük Bülten kategorisi)
      2. model-portfoey-guencelleme.pdf → portfolio (Model Portföy Güncelleme kategorisi)
    Her ikisi de aynı listing'den (?category=...) PDF link'leri ile bulunur.
    """
    base = "https://kuveytturkyatirim.com.tr"
    result = {
        "brokerId": "kt-yatirim",
        "brokerName": "KT Yatırım",
        "initials": "KT",
        "colorSeed": "#ec4899",
        "sourceUrl": f"{base}/arastirma-raporlari/?category=G%C3%BCnl%C3%BCk+B%C3%BClten",
        "lastUpdate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "recommendations": [],
        "portfolio": [],
        "ok": False,
        "debugLog": [],
    }
    log = result["debugLog"]
    print("KT Yatırım scrape başlıyor...")

    # 1) Günlük Bülten — recommendations
    try:
        listing_url = f"{base}/arastirma-raporlari/"
        log.append(f"GET listing: {listing_url}")
        r = requests.get(listing_url, headers=HEADERS, timeout=20)
        log.append(f"Listing HTTP {r.status_code}, html size={len(r.text)} chars")
        r.raise_for_status()
        html = r.text
        pdf_pattern = re.compile(
            r'(/media/[a-z0-9]+/gunluk-bulten_(\d{2})(\d{2})(\d{4})\.pdf)',
            re.IGNORECASE,
        )
        matches = pdf_pattern.findall(html)
        log.append(f"Found {len(matches)} 'gunluk-bulten' PDF pattern matches in listing")
        if matches:
            latest = max(matches, key=lambda m: (m[3], m[2], m[1]))
            pdf_url = base + latest[0]
            log.append(f"Latest PDF: {latest[0]}")
            print(f"  Bülten PDF: {latest[0]}")
            pr = requests.get(pdf_url, headers=HEADERS, timeout=30)
            log.append(f"PDF HTTP {pr.status_code}, {len(pr.content)} bytes")
            pr.raise_for_status()
            text = extract_pdf_text(pr.content)
            log.append(f"PDF text: {len(text)} chars")
            recs, err = parse_with_claude("KT Yatırım", text)
            result["recommendations"] = recs
            if err:
                log.append(f"Bülten Claude: {err}")
                result["error"] = err
            log.append(f"Recommendations: {len(recs)}")
            print(f"  {'✓' if recs else '!'} {len(recs)} öneri")
        else:
            msg = "Günlük bülten PDF pattern matched none — listing layout may have changed"
            log.append(msg)
            result["error"] = msg
            print(f"  ! {msg}")
    except Exception as e:
        msg = f"Bülten exception: {type(e).__name__}: {e}"
        log.append(msg)
        result["error"] = (result.get("error", "") + f"; {msg}").strip("; ")
        print(f"  ✗ {msg}")

    # 2) Model Portföy Güncelleme — portfolio
    try:
        mp_listing_url = f"{base}/arastirma-raporlari/?category=Model+Portf%C3%B6y+G%C3%BCncelleme&search=&date=&page=1"
        r = requests.get(mp_listing_url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        html = r.text
        # model-portfoey-guencelleme.pdf veya 2026-model-portfoey.pdf
        mp_pattern = re.compile(
            r'(/media/[a-z0-9]+/[^"]*model-portfoey[^"]*\.pdf)',
            re.IGNORECASE,
        )
        mp_matches = mp_pattern.findall(html)
        # HTML entities decode (haftal&#x131;k → haftalık vb.)
        mp_matches = [m.replace('&#x131;', 'i').replace('&amp;', '&') for m in mp_matches]
        # Tekrarları çıkar, ilk eşleşmeyi al (en yeni listing'in başında)
        seen = set()
        unique_pdfs = [m for m in mp_matches if not (m in seen or seen.add(m))]
        if unique_pdfs:
            pdf_url = base + unique_pdfs[0]
            print(f"  Portföy PDF: {unique_pdfs[0]}")
            pr = requests.get(pdf_url, headers=HEADERS, timeout=30)
            pr.raise_for_status()
            text = extract_pdf_text(pr.content)
            holdings = parse_portfolio_with_claude("KT Yatırım", text)
            result["portfolio"] = holdings
            print(f"  ✓ {len(holdings)} portföy hissesi")
        else:
            print("  ! Model portföy PDF bulunamadı")
    except Exception as e:
        print(f"  ✗ Portföy hata: {type(e).__name__}: {e}")

    result["ok"] = len(result["recommendations"]) > 0 or len(result["portfolio"]) > 0
    return result


def main() -> int:
    print("=" * 60)
    print(f"Aracı Kurum Hisse Önerileri Scraper — {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    brokers = [fetch_isyatirim()]  # Claude gerekmez (HTML scrape)
    if HAS_CLAUDE:
        brokers.extend([fetch_osmanli(), fetch_kt()])
    else:
        print("\n⚠ Osmanlı + KT atlanıyor (ANTHROPIC_API_KEY yok)")

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

    # Sadece İş Yatırım bile başarılıysa OK (Claude key olmasa bile pipeline çalışır)
    return 0


if __name__ == "__main__":
    sys.exit(main())
