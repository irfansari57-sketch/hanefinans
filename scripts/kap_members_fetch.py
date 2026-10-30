#!/usr/bin/env python3
"""
KAP BIST şirketleri → hisse kodu ↔ mkkMemberOid haritası (29–30 Eki 2026).

Kaynak: https://kap.org.tr/tr/bist-sirketler — tek sayfa. Next.js SSR yükü (self.__next_f.push) içinde her şirket için
  {"mkkMemberOid":"<32 hex>","kapMemberTitle":"…","relatedMemberTitle":"…","stockCode":"ASELS","cityName":…,"kapMemberType":"IGS"}
gömülüdür (30 Eki 2026 tarayıcıdan doğrulandı: 788 kod; ASELS oid'i şirket sayfasındakiyle aynı).
Bu yüzden şirket sayfalarını tek tek çekmeye gerek yok (ilk sürüm ~700 isteği KAP hız sınırına takılıyordu).

Çıktı: data/kap-members.json  { updatedAt, count, members: { "ASELS": {oid, name} } }
Haftalık yeterli. <400 kod → dosya değiştirilmez, exit 1.
"""
from __future__ import annotations

import json
import os
import re
import sys
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

# Yük içinde tırnaklar kaçışlı: \"mkkMemberOid\":\"4028…\",\"kapMemberTitle\":\"…\",(\"relatedMemberTitle\":\"…\",)?\"stockCode\":\"ASELS\"
ITEM_RE = re.compile(
    r'\\"mkkMemberOid\\":\\"([0-9A-Fa-f]{32})\\",'
    r'\\"kapMemberTitle\\":\\"((?:[^"\\]|\\\\.)*?)\\",'
    r'(?:\\"relatedMemberTitle\\":\\"(?:[^"\\]|\\\\.)*?\\",)?'
    r'\\"stockCode\\":\\"([^"\\]*)\\"'
)


def log(m: str) -> None:
    print(f"[kap-members] {m}", flush=True)


def _unescape(s: str) -> str:
    # çift kaçışlı JSON dizesi (\\\" → \" → ")
    try:
        return json.loads('"' + s.replace("\\\\", "\\") + '"')
    except Exception:  # noqa: BLE001
        return s.replace('\\\\"', '"')


def parse_members(html: str) -> dict[str, dict]:
    members: dict[str, dict] = {}
    for oid, title, codes in ITEM_RE.findall(html):
        name = re.sub(r"\s+", " ", _unescape(title)).strip()
        for c in codes.split(","):
            c = c.strip().upper()
            if re.fullmatch(r"[A-Z0-9]{2,10}", c) and c not in members:
                members[c] = {"oid": oid.lower(), "name": name}
    return members


def main() -> int:
    s = _session()
    r = s.get(BASE + "/tr/bist-sirketler", headers=H, timeout=90)
    if r.status_code != 200:
        log(f"liste HTTP {r.status_code}")
        return 1
    html = r.text
    log(f"liste: {len(html)} bayt, 'mkkMemberOid' geçişi: {html.count('mkkMemberOid')}")
    members = parse_members(html)
    log(f"çözülen kod: {len(members)}")
    if len(members) < 400:
        log("beklenenden az — dosya değiştirilmedi")
        return 1
    for probe in ("ASELS", "THYAO", "KCHOL"):
        log(f"  {probe}: {members.get(probe)}")
    os.makedirs("data", exist_ok=True)
    json.dump({"updatedAt": datetime.now(timezone.utc).isoformat(), "count": len(members), "members": dict(sorted(members.items()))},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    log(f"{OUT} yazıldı")
    return 0


if __name__ == "__main__":
    sys.exit(main())
