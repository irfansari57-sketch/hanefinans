"""
TR 10Y Tahvil getirisi (%) + history extraction — Playwright headless Chromium.

Kaynak: worldgovernmentbonds.com/bond-historical-data/turkey/10-years/
CDS scraper'ı ile aynı pattern — sayfa JS-rendered olduğu için Playwright şart.

Çıktı: data/tr-10y.json
"""

import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

URL = "https://www.worldgovernmentbonds.com/bond-historical-data/turkey/10-years/"
ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "tr-10y.json"


def is_plausible(v: float) -> bool:
    """TR 10Y yield sanity: 5% - 100% (yüksek enflasyon dönemleri için geniş)."""
    if not (3 <= v <= 120):
        return False
    return True


def extract_value(html: str):
    """Render edilmiş HTML'den 10Y yield (%) çıkar."""
    # PATTERN 1: "yield ... NNN.NN %"  veya "yield stands at NNN.NN"
    m = re.search(r"yield\s+(?:stands\s+at\s+|is\s+|of\s+|:\s*)?[\s\S]{0,40}?(\d+(?:[.,]\d+)?)\s*%", html, re.I)
    if m:
        v = float(m.group(1).replace(",", "."))
        if is_plausible(v):
            return v, "yield-keyword"

    # PATTERN 2: "<td>NN.NN%</td>" veya "<td>NN.NN</td>"  (history table satırı)
    for m in re.finditer(r"<td[^>]*>\s*(\d{1,3}\.\d{1,4})\s*%?\s*</td>", html):
        v = float(m.group(1))
        if is_plausible(v):
            return v, "td-decimal"

    # PATTERN 3: > NN.NN < or > NN.NN% <
    for m in re.finditer(r">\s*(\d{1,3}\.\d{1,4})\s*%?\s*<", html):
        v = float(m.group(1))
        if is_plausible(v):
            return v, "any-tag-decimal"

    return None, None


def extract_history(html: str):
    """Tarih + decimal (% opsiyonel) eşleşmesi."""
    history = []
    pat = re.compile(
        r"<tr[^>]*>\s*<td[^>]*>\s*(\d{1,2}/\d{1,2}/\d{4})\s*</td>\s*<td[^>]*>\s*(\d+(?:[.,]\d+)?)\s*%?",
    )
    for m in pat.finditer(html):
        d = m.group(1)
        v = float(m.group(2).replace(",", "."))
        parts = d.split("/")
        if len(parts) == 3 and is_plausible(v):
            iso = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
            history.append({"date": iso, "value": v})
    history.sort(key=lambda x: x["date"])
    return history[-365:]


def parse_as_of_date(html: str):
    m = re.search(
        r"Last\s*Update:?\s*([0-9]{1,2}\s+[A-Za-z]+\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*GMT[+-]?\d*)?)?)",
        html,
        re.I,
    )
    return m.group(1).strip() if m else None


async def render_with_playwright() -> str:
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
            try:
                await page.wait_for_load_state("networkidle", timeout=20000)
                print("Network idle reached", flush=True)
            except Exception as e:
                print(f"Network idle timeout: {e}", flush=True)
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
        print("HATA: TR 10Y yield bulunamadı", file=sys.stderr)
        debug_path = ROOT / "data" / "tr-10y-debug.html"
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        debug_path.write_text(html[:80000], encoding="utf-8")
        print(f"İlk 80KB HTML kaydedildi: {debug_path}", file=sys.stderr)
        sys.exit(2)

    print(f"Değer: {value}% (parser: {parser})", flush=True)
    print(f"History satır: {len(history)}", flush=True)

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
        "value": value,           # % olarak (örn. 28.45)
        "unit": "%",
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
