#!/usr/bin/env python3
"""
SPK Portföy Yönetim Şirketleri yetki belgesi kaydı -> data/spk-pys.json (24 Eki 2026)

Kaynak (resmî, herkese açık JSON): https://ws.spk.gov.tr/PortfoyYetki/api/YetkiBelgesi
  [{sirketkod, sirketid, sirketad, belge, belgetarih, belgeno, belgedurumu}, ...]
belgedurumu: "Faaliyette" | "Geçici İptal" | "İptal" | "Tasfiye ..." (gözlenen: Faaliyette, Geçici İptal)

Çıktı: {updatedAt, source, count, companies:[{name, status, belge, belgeno, since}], flagged:[...]}
"flagged" = durumu "Faaliyette" olmayanlar. Kaynak düşerse mevcut dosya DEĞİŞMEZ, exit 1.
"""
import json, os, sys
from datetime import datetime, timezone

URL = "https://ws.spk.gov.tr/PortfoyYetki/api/YetkiBelgesi"
OUT = "data/spk-pys.json"

def main() -> int:
    try:
        from curl_cffi import requests as cr
        r = cr.get(URL, impersonate="chrome131", timeout=40)
    except Exception:
        import requests
        r = requests.get(URL, timeout=40, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
    print(f"[spk] GET {URL} -> HTTP {r.status_code}, {len(r.content)} byte", flush=True)
    if r.status_code != 200:
        return 1
    try:
        data = r.json()
    except Exception as e:
        print(f"[spk] JSON parse hatasi: {e}; ilk 200: {r.text[:200]!r}", flush=True)
        return 1
    rows = data if isinstance(data, list) else (data.get("data") or data.get("value") or [])
    if len(rows) < 50:
        print(f"[spk] beklenenden az kayit ({len(rows)}) — dosya degistirilmedi", flush=True)
        return 1
    companies = []
    for x in rows:
        name = str(x.get("sirketad") or "").strip()
        if not name:
            continue
        companies.append({
            "name": name,
            "status": str(x.get("belgedurumu") or "").strip(),
            "belge": str(x.get("belge") or "").strip(),
            "belgeno": str(x.get("belgeno") or "").strip(),
            "since": str(x.get("belgetarih") or "")[:10],
        })
    flagged = [c for c in companies if c["status"] and not c["status"].lower().startswith("faaliyet")]
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": URL,
        "count": len(companies),
        "companies": companies,
        "flagged": flagged,
    }
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[spk] {OUT} yazildi: {len(companies)} sirket, {len(flagged)} isaretli: {[c['name'] + ' (' + c['status'] + ')' for c in flagged]}", flush=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
