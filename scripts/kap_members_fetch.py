#!/usr/bin/env python3
"""
KAP BIST şirketleri → hisse kodu ↔ mkkMemberOid haritası (29 Eki 2026).
Kaynak: https://kap.org.tr/tr/bist-sirketler (SSR liste: kod + ad + /tr/sirket-bilgileri/ozet/{id}-slug)
        her şirket sayfasının HTML'inde "mkkMemberOid":"<32 hex>" (KAP bildirim sorgusunda mkkMemberOidList için gerekir).
Çıktı: data/kap-members.json  { updatedAt, count, members: { "ASELS": {oid, name, id} } }
Haftalık yeterli (şirket listesi nadiren değişir). <400 şirket → dosya değiştirilmez, exit 1.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

try:
    from curl_cffi import requests as creq
    def _session():
        return creq.Session(impersonate="chrome")
except Exception:  # pragma: no cover
    import requests as creq  # type: ignore
    def _session():
        return creq.Session()

BASE = "https://kap.org.tr"
OUT = "data/kap-members.json"
H = {"Accept": "text/html,application/xhtml+xml", "Accept-Language": "tr-TR,tr;q=0.9"}


def log(m: str) -> None:
    print(f"[kap-members] {m}", flush=True)


def main() -> int:
    s = _session()
    r = s.get(BASE + "/tr/bist-sirketler", headers=H, timeout=60)
    if r.status_code != 200:
        log(f"liste HTTP {r.status_code}")
        return 1
    html = r.text
    # <a href="/tr/sirket-bilgileri/ozet/866-aselsan-...">ASELS</a> ... <a href="...">ASELSAN ELEKTRONİK ...</a>
    pairs = re.findall(r'href="(/tr/sirket-bilgileri/ozet/(\d+)-[^"]+)"[^>]*>\s*([^<]{1,120}?)\s*<', html)
    comp: dict[str, dict] = {}
    for href, cid, text in pairs:
        text = re.sub(r"\s+", " ", text).strip()
        e = comp.setdefault(href, {"id": int(cid), "codes": [], "name": ""})
        if re.fullmatch(r"[A-Z0-9]{3,6}(,\s*[A-Z0-9]{3,6})*", text):
            e["codes"].extend([c.strip() for c in text.split(",")])
        elif len(text) > len(e["name"]):
            e["name"] = text
    comps = [e | {"href": h} for h, e in comp.items() if e["codes"]]
    log(f"liste: {len(comps)} şirket")
    if len(comps) < 400:
        log("beklenenden az — dosya değiştirilmedi")
        return 1

    prev: dict = {}
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding="utf-8")).get("members", {})
        except Exception:  # noqa: BLE001
            prev = {}

    def oid_of(e: dict) -> tuple[dict, str | None]:
        # önceki dosyada varsa tekrar çekme
        for c in e["codes"]:
            if c in prev and prev[c].get("id") == e["id"] and prev[c].get("oid"):
                return e, prev[c]["oid"]
        for attempt in range(3):
            try:
                time.sleep(0.6)
                rr = _session().get(BASE + e["href"], headers=H, timeout=60)
                if rr.status_code == 200:
                    m = re.search(r"mkkMemberOid[^A-Fa-f0-9]{0,6}([A-Fa-f0-9]{32})", rr.text)
                    return e, (m.group(1) if m else None)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(1 + attempt)
        return e, None

    members: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=2) as ex:  # KAP 6 paralelde engelledi (29 Eki); nazik hız
        for e, oid in ex.map(oid_of, comps):
            if not oid:
                log(f"oid yok: {e['codes']} {e['href']}")
                continue
            for c in e["codes"]:
                members[c] = {"oid": oid, "name": e["name"], "id": e["id"]}
    log(f"oid çözülen kod: {len(members)}")
    if len(members) < 400:
        return 1
    os.makedirs("data", exist_ok=True)
    json.dump({"updatedAt": datetime.now(timezone.utc).isoformat(), "count": len(members), "members": dict(sorted(members.items()))},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log(f"{OUT} yazıldı")
    return 0


if __name__ == "__main__":
    sys.exit(main())
