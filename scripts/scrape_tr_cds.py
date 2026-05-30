"""
TR 5Y CDS spread'i + history extraction — Playwright headless Chromium ile.

worldgovernmentbonds.com sayfası JS-rendered olduğu için requests/BeautifulSoup
çalışmaz. Playwright tarayıcısı sayfayı render eder, sonra DOM'dan değer çıkarılır.

Çıktı: data/tr-cds.json (frontend client'ın okuduğu CdsData formatı)

GitHub Actions cron 2x/gün çalıştırır. Yerel test: `python scripts/scrape_tr_cds.py`.
"""

import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

URL = "https://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/"
ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "tr-cds.json"


def is_plausible(v: float) -> bool:
    """CDS spread sanity: 50-1500 bps, yıl (2000-2050) reddi."""
    if not (50 <= v <= 1500):
        return False
    if 2000 <= v <= 2050:
        return False
    return True


def extract_value(html: str):
    """Render edilmiş HTML'den 5 pattern ile değer çıkar."""
    # PATTERN 1: "value stands at NNN basis points"
    m = re.search(r"value\s+stands\s+at[\s\S]{0,80}?(\d+(?:[.,]\d+)?)[\s\S]{0,40}?basis\s+points", html, re.I)
    if m:
        v = float(m.group(1).replace(",", "."))
        if is_plausible(v):
            return v, "stands-at"

    # PATTERN 2: decimal + "basis points" yakın
    for m in re.finditer(r"(\d{2,4}(?:[.,]\d{1,4})?)[\s\S]{0,40}?basis\s+points", html, re.I):
        v = float(m.group(1).replace(",", "."))
        if is_plausible(v):
            return v, "bps-nearby"

    # PATTERN 3: <td>NNN.NN</td>
    for m in re.finditer(r"<td[^>]*>\s*(\d{2,4}\.\d{1,4})\s*</td>", html):
        v = float(m.group(1))
        if is_plausible(v):
            return v, "td-decimal"

    # PATTERN 4: > NNN.NN < (herhangi tag içinde)
    for m in re.finditer(r">\s*(\d{2,4}\.\d{1,4})\s*<", html):
        v = float(m.group(1))
        if is_plausible(v):
            return v, "any-tag-decimal"

    return None, None


def extract_history(html: str):
    """Tarih + decimal eşleşmesi history tablosundan."""
    history = []
    for m in re.finditer(
        r"<tr[^>]*>\s*<td[^>]*>\s*(\d{1,2}/\d{1,2}/\d{4})\s*</td>\s*<td[^>]*>\s*(\d+(?:[.,]\d+)?)",
        html,
    ):
        d = m.group(1)
        v = float(m.group(2).replace(",", "."))
        parts = d.split("/")
        if len(parts) == 3 and is_plausible(v):
            iso = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
            history.append({"date": iso, "value": v})
    history.sort(key=lambda x: x["date"])
    return history[-365:]  # son 1 yıl


def parse_as_of_date(html: str):
    """"Last Update: 19 May 2026" gibi tarih."""
    m = re.search(
        r"Last\s*Update:?\s*([0-9]{1,2}\s+[A-Za-z]+\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*GMT[+-]?\d*)?)?)",
        html,
        re.I,
    )
    return m.group(1).strip() if m else None


async def render_with_playwright() -> str:
    """Playwright headless Chromium ile sayfayı render et."""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            ctx = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800},
            )
            page = await ctx.new_page()
            print(f"Navigating: {URL}", flush=True)
            await page.goto(URL, wait_until="domcontentloaded", timeout=45000)

            # JS chart'ın render olması için network idle bekle
            try:
                await page.wait_for_load_state("networkidle", timeout=20000)
                print("Network idle reached", flush=True)
            except Exception as e:
                print(f"Network idle timeout (devam ediliyor): {e}", flush=True)

            # Chart kütüphanesi (Highcharts vb.) için ekstra 3 sn
            await page.wait_for_timeout(3000)

            html = await page.content()
            print(f"Rendered HTML length: {len(html)} bytes", flush=True)
            return html
        finally:
            await browser.close()


def main():
    html = asyncio.run(render_with_playwright())

    value, parser = extract_value(html)
    history = extract_history(html)

    if value is None and history:
        value = history[-1]["value"]
        parser = "history-last"

    if value is None:
        print("HATA: CDS değeri render edilmiş HTML'de bulunamadı", file=sys.stderr)
        debug_path = ROOT / "data" / "tr-cds-debug.html"
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        debug_path.write_text(html[:80000], encoding="utf-8")
        print(f"İlk 80KB HTML kaydedildi: {debug_path}", file=sys.stderr)
        sys.exit(2)

    print(f"Değer: {value} bps (parser: {parser})", flush=True)
    print(f"History satır: {len(history)}", flush=True)

    # Gün bazlı değişim (history varsa)
    change_abs = None
    change_pct = None
    change_window = None
    if len(history) >= 2:
        last = history[-1]
        prev = history[-2]
        change_abs = last["value"] - prev["value"]
        change_pct = (change_abs / prev["value"]) * 100 if prev["value"] else None
        change_window = "1 day"

    out = {
        "ok": True,
        "value": value,
        "changeAbs": change_abs,
        "changePct": change_pct,
        "changeWindow": change_window,
        "asOfDate": parse_as_of_date(html),
        "history": history if history else None,
        "source": "worldgovernmentbonds.com",
        "parser": parser,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Yazıldı: {OUT_PATH}", flush=True)


if __name__ == "__main__":
    main()
