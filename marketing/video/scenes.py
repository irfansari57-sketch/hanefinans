#!/usr/bin/env python3
"""
Sahne plakaları: sitenin tasarım diliyle (index.css tokenları) HTML/CSS → WeasyPrint → PDF → PNG.
Gerçek veriler data.json'dan (investliq.com API, 27 Eki 2026). Hareket (pan/zoom/crossfade) render_promo.py'de.
Çıktı: plates/*.png  (1920 genişlik; bazıları 1080'den uzun → kaydırma için)
"""
import json
import os
import subprocess
import sys
import math

import weasyprint

H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, "plates")
os.makedirs(OUT, exist_ok=True)
D = json.load(open(os.path.join(H, "data.json"), encoding="utf-8"))
ICON = os.path.join(H, "..", "..", "public", "web-app-manifest-512x512.png")

CSS = """
@font-face{font-family:L;src:url(/usr/share/fonts/truetype/lato/Lato-Regular.ttf)}
@font-face{font-family:L;font-weight:600;src:url(/usr/share/fonts/truetype/lato/Lato-Semibold.ttf)}
@font-face{font-family:L;font-weight:700;src:url(/usr/share/fonts/truetype/lato/Lato-Bold.ttf)}
@font-face{font-family:L;font-weight:900;src:url(/usr/share/fonts/truetype/lato/Lato-Black.ttf)}
@font-face{font-family:M;src:url(/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf)}
@font-face{font-family:M;font-weight:700;src:url(/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf)}
*{box-sizing:border-box;margin:0;padding:0;page-break-inside:avoid}
.card,.wrap,.col,.news{page-break-inside:auto}
body{width:1920px;background:#0E1116;color:#F1F5F9;font-family:L;font-size:22px;line-height:1.35}
.bg{position:absolute;left:0;top:0;width:1920px;height:100%;background:#0E1116}
.topbar{height:88px;display:flex;align-items:center;gap:22px;padding:0 44px;background:#0E1116;border-bottom:1px solid #1F2730}
.search{width:720px;height:50px;border:1px solid #2A333E;border-radius:14px;background:#151A21;color:#64748B;display:flex;align-items:center;padding:0 18px;font-size:20px}
.seg{margin-left:auto;display:flex;gap:4px;background:#151A21;border:1px solid #2A333E;border-radius:12px;padding:4px}
.seg span{padding:6px 14px;border-radius:9px;color:#94A3B8;font-size:18px}.seg .on{background:#1B2129;color:#F1F5F9;font-weight:700}
.avatar{width:40px;height:40px;border-radius:50%;background:#2DD4BF;color:#04342C;display:flex;align-items:center;justify-content:center;font-weight:900}
.strip{height:50px;display:flex;align-items:center;gap:34px;padding:0 44px;border-bottom:1px solid #1F2730;font-family:M;font-size:18px;color:#94A3B8;white-space:nowrap;overflow:hidden}
.strip b{color:#F1F5F9;font-weight:700;margin:0 6px}
.up{color:#22C55E}.dn{color:#EF4444}.fl{color:#64748B}
.wrap{padding:28px 44px;display:flex;gap:24px}
.col{display:flex;flex-direction:column;gap:24px}
.card{background:#151A21;border:1px solid #262D37;border-radius:18px;padding:22px 26px}
.card h3{font-size:19px;font-weight:700;color:#F1F5F9;white-space:nowrap}
.card h3 small{font-size:14px;font-weight:400;color:#64748B;margin-left:12px}
.meta{font-size:13px;color:#64748B;margin-top:4px}
.tiles{display:flex;gap:18px}
.tile{flex:1;background:#1B2129;border:1px solid #2A333E;border-radius:14px;padding:16px 18px}
.tile .k{font-family:M;font-size:15px;color:#94A3B8}.tile .n{font-size:14px;color:#64748B;margin-top:2px}
.tile .p{font-family:M;font-size:30px;font-weight:700;margin-top:8px}.tile .c{font-family:M;font-size:17px;font-weight:700;margin-top:2px}
.tile .s{font-size:12px;color:#64748B;margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:18px}
th{text-align:left;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748B;font-weight:700;padding:8px 10px;border-bottom:1px solid #262D37}
td{padding:10px 10px;border-bottom:1px solid #1F2730;vertical-align:middle}
td.m,th.m{font-family:M;text-align:right}
.sym{font-family:M;font-weight:700;color:#F1F5F9}.nm{color:#94A3B8;font-size:15px}
.badge{display:inline-block;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:6px;margin-right:8px;vertical-align:middle}
.badge.crit{background:rgba(239,68,68,.18);color:#EF4444;border:1px solid rgba(239,68,68,.5)}
.badge.teal{background:rgba(45,212,191,.16);color:#2DD4BF;border:1px solid rgba(45,212,191,.4)}
.badge.gray{background:#1B2129;color:#94A3B8;border:1px solid #2A333E}
.news{display:flex;flex-direction:column}
.news .it{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #1F2730;align-items:flex-start}
.news .h{font-family:M;font-size:14px;color:#64748B;width:56px;flex:none;padding-top:4px}
.news .t{font-size:18px;color:#E2E8F0}.news .t.crit{color:#FCA5A5;font-weight:700}
.news .s{font-size:13px;color:#64748B;margin-top:3px}
.news .it.crit{background:rgba(239,68,68,.07);border-left:3px solid #EF4444;padding-left:12px;border-radius:6px}
.tabs{display:flex;gap:10px;margin:0 44px 18px}
.tabs span{padding:10px 18px;border-radius:12px;border:1px solid #262D37;background:#151A21;color:#94A3B8;font-size:18px;font-weight:600}
.tabs .on{background:rgba(45,212,191,.12);border-color:#2DD4BF;color:#2DD4BF}
.chip{display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(45,212,191,.14);border:1px solid rgba(45,212,191,.45);color:#2DD4BF;font-weight:700;font-size:16px;margin-right:10px}
.chip.g{background:#1B2129;border-color:#2A333E;color:#94A3B8;font-weight:600}
.toast{position:absolute;right:48px;bottom:48px;background:#151A21;border:1px solid rgba(34,197,94,.5);border-left:5px solid #22C55E;border-radius:14px;padding:16px 22px;font-size:18px;color:#F1F5F9;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.toast small{display:block;color:#94A3B8;font-size:14px;margin-top:3px}
.hero{display:flex;align-items:center;gap:22px;padding:18px 44px}
.hero .ic{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#0b3d2c,#052e16);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:34px;color:#A7F3D0}
.hero h1{font-size:38px;font-weight:900;letter-spacing:-.01em}.hero .sub{font-size:18px;color:#94A3B8}
.hero .px{margin-left:auto;text-align:right}.hero .px .p{font-family:M;font-size:40px;font-weight:700}.hero .px .c{font-family:M;font-size:20px;font-weight:700}
.bubbles{position:relative;width:900px;height:700px}
.bub{position:absolute;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:M;font-weight:700;color:#F1F5F9;background:rgba(45,212,191,.10);border:2px solid rgba(45,212,191,.75)}
.bub.sel{background:rgba(45,212,191,.28);border:3px solid #2DD4BF;box-shadow:0 0 0 10px rgba(45,212,191,.14)}
.bub.ctr{background:rgba(34,197,94,.14);border:3px solid #22C55E}
.bub .k{font-size:15px}.bub .v{font-size:14px;color:#A7F3D0}.bub.sm .k{font-size:12px}.bub.sm .v{font-size:11px}
.panel{width:420px;background:#151A21;border:1px solid #262D37;border-radius:18px;padding:22px}
.panel .k{font-family:M;font-size:30px;font-weight:700}.panel .n{color:#94A3B8;font-size:16px}.panel .sec{color:#64748B;font-size:13px}
.kv{display:flex;gap:12px;margin-top:16px}.kv>div{flex:1;background:#1B2129;border:1px solid #2A333E;border-radius:12px;padding:12px}
.kv .l{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748B}.kv .v{font-family:M;font-size:26px;font-weight:700;margin-top:4px}
.bar{height:8px;border-radius:4px;background:#1B2129;margin-top:14px;overflow:hidden}.bar i{display:block;height:100%;background:#2DD4BF}
.legend{display:flex;gap:26px;font-size:17px;color:#94A3B8;padding:0 44px 14px}.legend b{color:#F1F5F9;font-family:M}
.lit{display:flex;flex-direction:column;gap:10px}
.lit .i{display:flex;gap:12px;align-items:center;padding:12px 14px;background:#1B2129;border:1px solid #2A333E;border-radius:12px;font-size:18px}
.lit .i b{width:30px;height:30px;border-radius:8px;background:rgba(45,212,191,.16);color:#2DD4BF;display:flex;align-items:center;justify-content:center;font-family:M;font-size:14px;flex:none}
.title{position:absolute;left:0;top:0;width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;text-align:center}
.title h1{font-size:84px;font-weight:900;letter-spacing:-.02em;line-height:1.15}.title em{font-style:normal;color:#2DD4BF}
.phone{width:330px;height:690px;border:10px solid #1F2730;border-radius:44px;background:#0E1116;padding:26px 14px;position:relative}
.phone .notch{position:absolute;left:50%;top:10px;width:100px;height:22px;margin-left:-50px;border-radius:12px;background:#1F2730}
.phone .row{display:flex;justify-content:space-between;padding:10px 6px;border-bottom:1px solid #1F2730;font-size:15px}
.disc{font-size:13px;color:#64748B}
.risk .r{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1F2730;font-size:17px}
.pill{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:999px}
.pill.y{background:rgba(239,68,68,.16);color:#EF4444}.pill.o{background:rgba(245,158,11,.16);color:#F59E0B}.pill.l{background:rgba(34,197,94,.16);color:#22C55E}
"""


def cls(c: float) -> str:
    return "up" if c > 0 else "dn" if c < 0 else "fl"


def pct(c: float) -> str:
    a = "▲" if c > 0 else "▼" if c < 0 else "—"
    return f"{a} %{abs(c):.2f}".replace(".", ",")


def strip_html() -> str:
    return '<div class="strip">' + "".join(
        f'<span>{s["k"]}<b>{s["p"]}</b><span class="{cls(s["c"])}">{pct(s["c"])}</span></span>' for s in D["strip"]) + "</div>"


def topbar(view="Yoğun") -> str:
    return f'''<div class="topbar"><div class="search">⌕&nbsp; Hisse, fon, emtia, döviz veya kripto ara...</div>
    <div class="seg"><span>Sade</span><span>Standart</span><span class="on">{view}</span></div><div class="avatar">i</div></div>'''


def render(name: str, body: str, height: int = 1080, width: int = 1920) -> str:
    html = f'<!doctype html><html><head><meta charset="utf-8"><style>@page{{size:{width}px {height}px;margin:0}}{CSS}body{{width:{width}px;height:{height}px;position:relative}}</style></head><body>{body}</body></html>'
    pdf = os.path.join(OUT, name + ".pdf")
    png = os.path.join(OUT, name)
    weasyprint.HTML(string=html, base_url=H).write_pdf(pdf)
    subprocess.run(["pdftoppm", "-png", "-r", "96", "-singlefile", pdf, png], check=True)
    os.remove(pdf)
    print("plate", name, width, height)
    return png + ".png"


# ------------------------------------------------------------------ S1 title
def s1():
    render("s1_title", '<div class="title"><h1>Piyasayı <em>veriyle</em> mi okuyorsun,<br><em>söylentiyle</em> mi?</h1></div>')


# ------------------------------------------------------------------ S2 panel (tall → scroll)
def s2():
    tiles = "".join(f'''<div class="tile"><div class="k">{t["k"]}</div><div class="n">{t["name"]}</div><div class="p">{t["p"]}</div>
      <div class="c {cls(t["c"])}">{pct(t["c"])}</div><div class="s">{t["src"]}</div></div>''' for t in D["today"])
    def rows(lst):
        return "".join(f'<tr><td><span class="sym">{k}</span><div class="nm">{n}</div></td><td class="m">{p}</td><td class="m {cls(c)}">{pct(c)}</td></tr>' for k, n, c, p in lst)
    news = "".join(f'''<div class="it {"crit" if n["critical"] else ""}"><div class="h">{n["h"]}</div><div>
      {"<span class='badge crit'>Kritik · " + n["reason"] + "</span>" if n["critical"] else ""}{"<span class='badge gray'>" + n["sym"] + "</span>" if n.get("sym") else ""}
      <span class="t {"crit" if n["critical"] else ""}">{n["t"]}</span><div class="s">{n["s"]}</div></div></div>''' for n in D["news"])
    # mini sparkline (XU100 60 gün)
    b = D["bars"]; lo, hi = min(b), max(b); W, Hh = 560, 120
    pts = " ".join(f'{i * W / (len(b) - 1):.1f},{Hh - (v - lo) / (hi - lo) * (Hh - 10) - 5:.1f}' for i, v in enumerate(b))
    spark = f'<svg width="{W}" height="{Hh}" viewBox="0 0 {W} {Hh}"><polyline fill="none" stroke="#EF4444" stroke-width="3" points="{pts}"/></svg>'
    body = f'''{topbar()}{strip_html()}
    <div class="wrap"><div class="col" style="width:1180px">
      <div class="card"><h3>Bugün <small>seans içinde 60 sn · kapalıyken 10 dk yenilenir</small></h3><div class="tiles" style="margin-top:14px">{tiles}</div></div>
      <div class="card"><h3>Günün Enleri <small>BIST · İş Yatırım · seans {D["capturedAt"][:10]}</small></h3>
        <div style="display:flex;gap:30px;margin-top:10px"><div style="width:50%"><table><tr><th>Yükselen</th><th class="m">Fiyat</th><th class="m">Gün</th></tr>{rows(D["gainers"])}</table></div>
        <div style="width:50%"><table><tr><th>Düşen</th><th class="m">Fiyat</th><th class="m">Gün</th></tr>{rows(D["losers"])}</table></div></div></div>
      <div class="card"><h3>BIST 100 <small>son 60 işlem günü · kapanış</small></h3><div style="display:flex;align-items:flex-end;gap:30px;margin-top:10px">{spark}
        <div><div style="font-family:M;font-size:34px;font-weight:700">11.151,03</div><div class="dn" style="font-family:M;font-weight:700">▼ %0,01</div><div class="meta">Kaynak: İş Yatırım · 26 Eki kapanış</div></div></div></div>
      <div class="card"><h3>Fonlar — Günün Enleri <small>TEFAS · {D["movers_asof"] if "movers_asof" in D else "26 Eki"}</small></h3><table style="margin-top:8px">
        {"".join(f'<tr><td><span class="sym">{k}</span><div class="nm">{n}</div></td><td class="m up">{pct(c)}</td></tr>' for k, n, c in D["fundGainers"])}</table></div>
    </div>
    <div class="col" style="width:652px">
      <div class="card"><h3>Haber Akışı <small>KAP + ekonomi · kritik etiket otomatik</small></h3><div class="news" style="margin-top:8px">{news}</div></div>
      <div class="card"><h3>Takip Listesi</h3><table style="margin-top:8px">{rows([[s["k"], "", s["c"], s["p"]] for s in D["strip"][4:9]])}</table></div>
    </div></div>'''
    render("s2_panel", body, height=1700)


# ------------------------------------------------------------------ S3 KTJ portföy ağı
def bubbles_html(selected: str | None) -> str:
    items = D["ktj"]["items"][:22]
    cx, cy, R = 450, 350, 300
    out = [f'<div class="bub ctr" style="left:{cx-80}px;top:{cy-80}px;width:160px;height:160px"><div class="k" style="font-size:22px">KTJ</div><div class="v" style="font-size:20px;color:#22C55E">+%{D["ktj"]["ret1y"]:.2f}</div><div class="v" style="color:#94A3B8">1Y getiri</div></div>']
    maxw = items[0][2]
    for i, (k, n, w, t) in enumerate(items):
        ang = -math.pi / 2 + i * 2 * math.pi / len(items)
        r = 18 + 36 * math.sqrt(w / maxw)
        x, y = cx + R * math.cos(ang), cy + R * math.sin(ang)
        sel = " sel" if selected == k else ""
        sm = " sm" if r < 40 else ""
        out.append(f'<div class="bub{sel}{sm}" style="left:{x-r:.0f}px;top:{y-r:.0f}px;width:{2*r:.0f}px;height:{2*r:.0f}px"><div class="k">{k}</div><div class="v">%{w:.1f}</div></div>'.replace(".", ","))
    return '<div class="bubbles">' + "".join(out) + "</div>"


def s3():
    k = D["ktj"]
    legend = "".join(f'<span>{l} <b>%{p:.2f}</b></span>'.replace(".", ",") for l, p in k["alloc"])
    def page(selected):
        panel = ""
        if selected:
            it = next(x for x in k["items"] if x[0] == selected)
            panel = f'''<div class="panel"><div class="k">{it[0]}</div><div class="n">{it[1]}</div><div class="sec">Yabancı Hisse</div>
            <div class="kv"><div><div class="l">Fondaki ağırlık</div><div class="v">%{it[2]:.2f}</div></div><div><div class="l">Önceki ay</div><div class="v" style="font-size:15px;color:#64748B;font-family:L">Önceki rapor henüz yok</div></div></div>
            <div class="bar"><i style="width:{it[2]*8:.0f}%"></i></div>
            <div class="disc" style="margin-top:16px">Kaynak: KAP aylık Portföy Dağılım Raporu · {k["period"]} · KAP'ta {k["aciklama"]} açıklandı</div></div>'''.replace(f'%{it[2]:.2f}', f'%{it[2]:.2f}'.replace(".", ","))
        return f'''{topbar()}{strip_html()}
        <div class="hero"><div class="ic">Q</div><div><h1>{k["code"]} <span class="badge teal" style="font-size:13px;vertical-align:middle">Katılım</span></h1><div class="sub">{k["name"]}</div></div>
          <div class="px"><div class="p">2,650893</div><div class="c up">▲ %1,08</div></div></div>
        <div class="tabs"><span>Özet</span><span class="on">Portföy Ağı</span><span>Getiri Detayı</span><span>Bilgiler</span></div>
        <div class="legend">{legend}<span style="margin-left:auto">Ağırlık Balonları · hisse bazlı · balon alanı = ağırlık · KAP {k["period"]}</span></div>
        <div style="display:flex;gap:40px;padding:0 44px;align-items:flex-start">{bubbles_html(selected)}{panel}</div>'''
    render("s3_bubbles_a", page(None), height=1140)
    render("s3_bubbles_b", page("MSFT"), height=1140)


# ------------------------------------------------------------------ S4 hisse + bilanço
def s4():
    t = D["thyao"]
    rows = "".join(f'<tr><td class="sym">{d}</td><td class="m">{a}</td><td class="m">{b}</td><td class="m {"dn" if c.startswith("-") else ""}">{c}</td></tr>' for d, a, b, c in t["periods"])
    lit = "".join(f'<div class="i"><b>{i+1}</b>{s}</div>' for i, s in enumerate(D["literacy"]))
    body = f'''{topbar()}{strip_html()}
    <div class="hero"><div class="ic" style="font-size:22px">TH</div><div><h1>{t["code"]}</h1><div class="sub">{t["name"]} · BIST · İş Yatırım (~15 dk gecikmeli)</div></div>
      <div class="px"><div class="p">{t["p"]} ₺</div><div class="c {cls(t["c"])}">{pct(t["c"])}</div></div></div>
    <div class="tabs"><span>Özet</span><span>Teknik</span><span class="on">Temel</span><span>Haber/KAP</span><span>Notlar</span></div>
    <div class="wrap"><div class="col" style="width:1120px"><div class="card"><h3>Finansal Tablolar <small>{t["asOf"]}</small></h3>
      <table style="margin-top:10px"><tr>{"".join(f'<th class="{"m" if i else ""}">{c}</th>' for i, c in enumerate(t["cols"]))}</tr>{rows}</table>
      <div class="meta" style="margin-top:12px">Kümülatif dönem değerleri · milyar TL · Kaynak: İş Yatırım mali tablolar</div></div></div>
    <div class="col" style="width:712px"><div class="card"><h3>Bilanço Okuryazarlığı <small>Finansal Okuryazarlık → rehber</small></h3><div class="lit" style="margin-top:12px">{lit}</div></div></div></div>'''
    render("s4_stock", body)


# ------------------------------------------------------------------ S5 tarama + alarm
def s5():
    s = D["screener"]
    chips = "".join(f'<span class="chip">{f} ✕</span>' for f in s["filters"]) + '<span class="chip g">+ Filtre ekle</span>'
    rows = "".join(f'<tr><td class="sym">{r[0]}</td><td class="m">{r[1]}</td><td class="m {cls(r[2])}">{pct(r[2])}</td><td class="m">{str(r[3]).replace(".", ",")}</td><td class="m dn">%{str(r[4]).replace(".", ",")}</td><td class="m dn">%{str(r[5]).replace(".", ",")}</td><td class="m">{str(r[6]).replace(".", ",")}×</td></tr>' for r in s["rows"])
    def page(toast):
        return f'''{topbar()}{strip_html()}
        <div class="hero"><div><h1>Tarama</h1><div class="sub">Deterministik tarayıcı · evren {s["universe"]} hisse · veri {s["asOf"]} kapanış · her satırın kanıtı var</div></div></div>
        <div style="padding:0 44px 18px">{chips}</div>
        <div class="wrap"><div class="card" style="width:1832px"><h3>Sonuçlar <small>{len(s["rows"])} hisse · RSI'a göre artan</small></h3>
        <table style="margin-top:10px"><tr>{"".join(f'<th class="{"m" if i else ""}">{c}</th>' for i, c in enumerate(s["cols"]))}</tr>{rows}</table>
        <div class="meta" style="margin-top:12px">Yatırım tavsiyesi değildir. Tarama sonuçları yalnızca sayısal filtredir; her değer kaynağıyla birlikte saklanır (kanıt defteri).</div></div></div>
        {'<div class="toast">✓ Kural alarmı eklendi — VESTL<small>RSI(14) &lt; 20 iken bildir · 17:20 günlük kontrol</small></div>' if toast else ''}'''
    render("s5_screener_a", page(False))
    render("s5_screener_b", page(True))


# ------------------------------------------------------------------ S6 haber
def s6():
    news = "".join(f'''<div class="it {"crit" if n["critical"] else ""}" style="padding:18px 0"><div class="h" style="font-size:16px">{n["h"]}</div><div>
      {"<span class='badge crit'>Kritik · " + n["reason"] + "</span>" if n["critical"] else ""}{"<span class='badge gray'>" + n["sym"] + "</span>" if n.get("sym") else ""}
      <span class="t {"crit" if n["critical"] else ""}" style="font-size:24px">{n["t"]}</span><div class="s" style="font-size:15px">{n["s"]} · 27 Eki 2026</div></div></div>''' for n in D["news"])
    body = f'''{topbar()}{strip_html()}
    <div class="hero"><div><h1>Haber Akışı</h1><div class="sub">KAP bildirimleri + ekonomi haberleri · kritik başlıklar otomatik etiketlenir: faaliyet durdurma, işlem kısıtı, pay alım teklifi, konkordato…</div></div></div>
    <div class="wrap"><div class="card" style="width:1832px"><div class="news">{news}</div></div></div>'''
    render("s6_news", body, height=1300)


# ------------------------------------------------------------------ S7 portföy + risk + telefon
def s7():
    p = D["portfolio"]
    rows = "".join(f'<tr><td><span class="sym">{k}</span><div class="nm">{t}</div></td><td class="m">{a}</td><td class="m">{px}</td><td class="m">{v} ₺</td><td class="m {cls(c)}">{pct(c)}</td></tr>' for k, t, a, px, v, c in p["rows"])
    risk = "".join(f'<div class="r"><span>{l}</span><span style="display:flex;gap:12px;align-items:center"><b style="font-family:M">{v}</b><span class="pill {"y" if s == "yüksek" else "o" if s == "orta" else "l"}">{s}</span></span></div>' for l, v, s in p["risk"])
    prow = "".join(f'<div class="row"><span class="sym" style="font-size:15px">{k}</span><span class="m {cls(c)}" style="font-family:M">{pct(c)}</span></div>' for k, t, a, px, v, c in p["rows"])
    body = f'''{topbar()}{strip_html()}
    <div class="hero"><div><h1>Portföy <span class="badge gray" style="font-size:13px;vertical-align:middle">{p["label"]}</span></h1><div class="sub">Bulut senkron · tüm cihazlarda aynı hesap · risk raporu deterministik</div></div>
      <div class="px"><div class="p">{p["total"]}</div><div class="c" style="color:#94A3B8;font-size:16px">toplam değer (örnek)</div></div></div>
    <div class="wrap"><div class="col" style="width:1000px"><div class="card"><h3>Pozisyonlar</h3><table style="margin-top:10px"><tr><th>Varlık</th><th class="m">Adet</th><th class="m">Fiyat</th><th class="m">Değer</th><th class="m">Gün</th></tr>{rows}</table></div>
      <div class="card risk"><h3>Risk Raporu <small>konsantrasyon · sektör · varlık sınıfı</small></h3><div style="margin-top:8px">{risk}</div></div></div>
      <div class="col" style="width:420px;align-items:center;justify-content:center"><div class="phone"><div class="notch"></div>
        <div style="font-weight:900;font-size:20px;margin:30px 6px 6px">Portföy</div><div style="font-family:M;font-size:26px;font-weight:700;margin:0 6px 10px">{p["total"]}</div>{prow}
        <div class="disc" style="margin:14px 6px">Veri kaynağı ve saati her satırda</div></div></div></div>'''
    render("s7_portfolio", body)




# ------------------------------------------------------------------ S3V dikey (Shorts) — 1080×1920
def s3v():
    k = D["ktj"]
    def page(selected):
        panel = ""
        if selected:
            it = next(x for x in k["items"] if x[0] == selected)
            w = f"%{it[2]:.2f}".replace(".", ",")
            panel = f'''<div class="panel" style="width:980px;margin:10px 50px 0"><div style="display:flex;gap:20px;align-items:center"><div><div class="k" style="font-size:40px">{it[0]}</div><div class="n" style="font-size:22px">{it[1]} · Yabancı Hisse</div></div>
            <div style="margin-left:auto;text-align:right"><div class="l" style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#64748B">Fondaki ağırlık</div><div class="v" style="font-family:M;font-size:46px;font-weight:700">{w}</div></div></div>
            <div class="bar" style="height:12px"><i style="width:{it[2]*8:.0f}%"></i></div>
            <div class="disc" style="margin-top:14px;font-size:18px">Kaynak: KAP aylık Portföy Dağılım Raporu · {k["period"]} · KAP'ta {k["aciklama"]} açıklandı · Önceki rapor henüz yok</div></div>'''
        return f'''<div class="hero" style="padding:40px 50px 10px"><div class="ic">Q</div><div><h1 style="font-size:44px">{k["code"]} <span class="badge teal" style="font-size:14px;vertical-align:middle">Katılım</span></h1><div class="sub" style="font-size:20px">{k["name"]}</div></div></div>
        <div class="tabs" style="margin:0 50px 10px"><span>Özet</span><span class="on">Portföy Ağı</span><span>Getiri Detayı</span></div>
        <div style="padding:0 50px 6px;color:#94A3B8;font-size:18px">Ağırlık Balonları · hisse bazlı · balon alanı = ağırlık · KAP {k["period"]}</div>
        <div style="display:flex;justify-content:center;transform:scale(1.15);transform-origin:top center;margin-top:30px">{bubbles_html(selected)}</div>
        <div style="height:60px"></div>{panel}'''
    render("s3v_a", page(None), height=1920, width=1080)
    render("s3v_b", page("MSFT"), height=1920, width=1080)


if __name__ == "__main__":
    which = sys.argv[1:] or ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s3v"]
    for w in which:
        globals()[w]()
