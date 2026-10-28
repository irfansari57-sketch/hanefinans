#!/usr/bin/env python3
"""Portföy Ağı — balon modelleme alternatifleri (KTJ gerçek KAP verisiyle). Çıktı: bubble_models.html"""
import json, math, os, random
H = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(H, "..", "video", "data.json"), encoding="utf-8"))["ktj"]
items = [(k, n, w, t) for k, n, w, t in D["items"]]  # (kod, ad, %, tür)
GROUP = {"yh": ("Yabancı Hisse", "#2DD4BF"), "h": ("BIST Hisse", "#22C55E"), "fon": ("Fon / BYF", "#A78BFA"), "repo": ("Repo", "#F59E0B"), "dv": ("Döviz", "#94A3B8")}
BG, S, FG, FG2, B = "#0E1116", "#151A21", "#F1F5F9", "#94A3B8", "#262D37"
maxw = max(w for _, _, w, _ in items)

def bub(x, y, r, k, w, col, sel=False, small=False):
    fs = max(9, min(15, r * 0.36)); fs2 = max(8, fs - 3)
    txt = f'<text x="{x:.0f}" y="{y-2:.0f}" text-anchor="middle" font-family="Lato,Inter,sans-serif" font-weight="800" font-size="{fs:.0f}" fill="{FG}">{k}</text><text x="{x:.0f}" y="{y+fs2+2:.0f}" text-anchor="middle" font-family="DejaVu Sans Mono,monospace" font-size="{fs2:.0f}" fill="{col}">%{w:.1f}</text>'.replace(".", ",", 0)
    if r < 16: txt = f'<text x="{x:.0f}" y="{y+3:.0f}" text-anchor="middle" font-size="8" fill="{FG2}">{k}</text>'
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{col}" fill-opacity="{0.28 if sel else 0.12}" stroke="{col}" stroke-width="{3 if sel else 1.6}"/>{txt}'

def center(cx, cy, r=70):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#22C55E" fill-opacity=".14" stroke="#22C55E" stroke-width="3"/><text x="{cx}" y="{cy-6}" text-anchor="middle" font-family="Lato" font-weight="900" font-size="22" fill="{FG}">KTJ</text><text x="{cx}" y="{cy+16}" text-anchor="middle" font-family="DejaVu Sans Mono" font-size="15" fill="#22C55E">+%{str(round(D["ret1y"],2)).replace(".", ",")}</text><text x="{cx}" y="{cy+32}" text-anchor="middle" font-size="10" fill="{FG2}">1Y getiri</text>'

def legend(x, y):
    out = [];
    for i, (g, (name, col)) in enumerate(GROUP.items()):
        out.append(f'<circle cx="{x+i*150}" cy="{y}" r="6" fill="{col}"/><text x="{x+i*150+12}" y="{y+4}" font-size="12" fill="{FG2}">{name}</text>')
    return "".join(out)

W, Hh = 900, 640
def rad(w, lo=16, hi=58): return lo + (hi - lo) * math.sqrt(w / maxw)

# ---------- A) Mevcut: tek halka
def model_a():
    cx, cy, R = W/2, Hh/2, 250; out = [center(cx, cy)]
    for i, (k, n, w, t) in enumerate(items):
        a = -math.pi/2 + i*2*math.pi/len(items); r = rad(w, 14, 50)
        x, y = cx + R*math.cos(a), cy + R*math.sin(a)
        out.append(f'<line x1="{cx}" y1="{cy}" x2="{x:.0f}" y2="{y:.0f}" stroke="{B}" stroke-width="1"/>')
        out.append(bub(x, y, r, k, w, GROUP[t][1]))
    return "".join(out)

# ---------- B) Gruplu halka: türe göre renkli yaylar + grup içinde sıralı
def model_b():
    cx, cy, R = W/2, Hh/2, 262; out = [center(cx, cy)]
    order = ["yh", "h", "fon", "repo", "dv"]
    groups = [(g, [it for it in items if it[3] == g]) for g in order]
    total = len(items); ang = -math.pi/2; gap = 0.12
    for g, its in groups:
        if not its: continue
        span = 2*math.pi*len(its)/total - gap
        col = GROUP[g][1]
        a0, a1 = ang, ang + span
        # yay (dış kılavuz)
        x0, y0 = cx + (R+62)*math.cos(a0), cy + (R+62)*math.sin(a0); x1, y1 = cx + (R+62)*math.cos(a1), cy + (R+62)*math.sin(a1)
        out.append(f'<path d="M{x0:.0f},{y0:.0f} A{R+62},{R+62} 0 {1 if span>math.pi else 0},1 {x1:.0f},{y1:.0f}" fill="none" stroke="{col}" stroke-opacity=".55" stroke-width="3"/>')
        am = (a0+a1)/2; lx, ly = cx + (R+84)*math.cos(am), cy + (R+84)*math.sin(am)
        gw = sum(w for _, _, w, _ in its)
        out.append(f'<text x="{lx:.0f}" y="{ly:.0f}" text-anchor="middle" font-size="11" font-weight="700" fill="{col}">{GROUP[g][0]} %{gw:.1f}</text>'.replace(".", ","))
        for j, (k, n, w, t) in enumerate(its):
            a = a0 + (j + 0.5) * span / len(its); r = rad(w, 12, 42)
            x, y = cx + R*math.cos(a), cy + R*math.sin(a)
            out.append(f'<line x1="{cx}" y1="{cy}" x2="{x:.0f}" y2="{y:.0f}" stroke="{col}" stroke-opacity=".25" stroke-width="1"/>')
            out.append(bub(x, y, r, k, w, col))
        ang += span + gap
    return "".join(out)

# ---------- C) Paketlenmiş balonlar (circle packing) — merkez KTJ, büyükler içeride
def pack(cx, cy, radii, start_r=78):
    placed = []  # (x,y,r)
    for r in radii:
        best = None
        # spiral arama
        a, d = 0.0, start_r + r + 6
        while best is None and d < 700:
            x, y = cx + d*math.cos(a), cy + d*math.sin(a)
            ok = all(math.hypot(x-px, y-py) >= r + pr + 4 for px, py, pr in placed)
            if ok: best = (x, y, r)
            a += 0.35
            if a > 2*math.pi: a -= 2*math.pi; d += 6
        placed.append(best or (cx, cy, r))
    return placed

def model_c():
    cx, cy = W/2, Hh/2; out = [center(cx, cy, 72)]
    srt = sorted(items, key=lambda it: -it[2])
    pl = pack(cx, cy, [rad(w, 15, 62) for _, _, w, _ in srt])
    for (k, n, w, t), (x, y, r) in zip(srt, pl):
        out.append(bub(x, y, r, k, w, GROUP[t][1]))
    return "".join(out)

# ---------- D) Gruplu kümeler (cluster packing): her tür ayrı küme, küme merkezi KTJ etrafında
def model_d():
    cx, cy = W/2, Hh/2; out = [center(cx, cy, 64)]
    order = ["yh", "h", "fon", "repo", "dv"]; groups = [(g, [it for it in items if it[3] == g]) for g in order if any(it[3]==g for it in items)]
    tot = sum(sum(w for _,_,w,_ in its) for _, its in groups)
    POS = {"yh": (cx + 235, cy), "h": (cx - 250, cy - 165), "fon": (cx - 250, cy + 150), "repo": (cx - 60, cy - 240), "dv": (cx - 60, cy + 240)}
    for g, its in groups:
        gw = sum(w for _,_,w,_ in its); col = GROUP[g][1]
        gx, gy = POS.get(g, (cx, cy))
        srt = sorted(its, key=lambda it: -it[2])
        pl = pack(gx, gy, [rad(w, 13, 54) for _,_,w,_ in srt], start_r=0)
        xs = [x for x,_,_ in pl]; ys = [y for _,y,_ in pl]; rs = [r for *_, r in pl]
        hull = max(math.hypot(x-gx, y-gy)+r for (x,y,r) in pl) + 10
        out.append(f'<circle cx="{gx:.0f}" cy="{gy:.0f}" r="{hull:.0f}" fill="{col}" fill-opacity=".05" stroke="{col}" stroke-opacity=".35" stroke-dasharray="4 4"/>')
        out.append(f'<line x1="{cx}" y1="{cy}" x2="{gx:.0f}" y2="{gy:.0f}" stroke="{col}" stroke-opacity=".3"/>')
        out.append(f'<text x="{gx:.0f}" y="{gy-hull-6:.0f}" text-anchor="middle" font-size="11" font-weight="700" fill="{col}">{GROUP[g][0]} · %{gw:.1f}</text>'.replace(".", ","))
        for (k,n,w,t),(x,y,r) in zip(srt, pl): out.append(bub(x, y, r, k, w, col))
    return "".join(out)

# ---------- E) Yatay şerit (beeswarm): ağırlığa göre soldan sağa, tür şeritleri
def model_e():
    out = []; order = ["yh", "h", "fon", "repo", "dv"]; lanes = [g for g in order if any(it[3]==g for it in items)]
    laneH = (Hh - 80) / len(lanes); x0, x1 = 90, W - 40
    wmax = maxw
    for li, g in enumerate(lanes):
        y = 50 + li*laneH + laneH/2; col = GROUP[g][1]
        its = sorted([it for it in items if it[3]==g], key=lambda it: -it[2])
        gw = sum(w for _,_,w,_ in its)
        out.append(f'<line x1="{x0}" y1="{y:.0f}" x2="{x1}" y2="{y:.0f}" stroke="{B}"/><text x="12" y="{y-4:.0f}" font-size="11" font-weight="700" fill="{col}">{GROUP[g][0]}</text><text x="12" y="{y+10:.0f}" font-size="10" fill="{FG2}">%{gw:.1f}</text>'.replace(".", ","))
        # şeride sığdır: gereken genişlik > alan ise yarıçapları ölçekle
        rs = [rad(w, 12, 40) for _,_,w,_ in its]
        need = sum(2*r + 10 for r in rs); scale = min(1.0, (x1 - x0 - 20) / need) if need else 1
        x = x0 + 10
        for (k, n, w, t), r0 in zip(its, rs):
            r = r0 * scale
            x += r
            out.append(bub(x, y, r, k, w, col))
            x += r + 10 * scale
    return "".join(out)

MODELS = [
 ("A", "Tek halka (mevcut)", "Tüm varlıklar eşit açıyla tek çemberde; alan = ağırlık. Artı: sade, tıklanabilir. Eksi: tür ayrımı yok, 25+ varlıkta küçükler okunmuyor.", model_a()),
 ("B", "Gruplu halka", "Aynı halka, ama varlıklar türe göre bitişik yaylarda; dış kılavuz yayı grup toplamını yazar (Yabancı Hisse %73,3…). Mevcut etkileşim korunur.", model_b()),
 ("C", "Paketlenmiş balonlar", "Circle-packing: en ağırlar KTJ'nin dibinde, küçükler dışa doğru. Alan algısı en güçlüsü; görsel olarak 'fonun kütlesi' hissi.", model_c()),
 ("D", "Tür kümeleri", "Her tür ayrı küme; ağır küme merkeze yakın. Hem tür toplamı hem varlık ağırlığı tek bakışta. Fon karşılaştırmasına da uygun (iki fonun kümeleri yan yana).", model_d()),
 ("E", "Şerit (beeswarm)", "Tür şeritlerinde soldan sağa büyükten küçüğe. Mobilde en iyi okunan; halka estetiği yok ama liste gibi taranır.", model_e()),
]

cards = "".join(f'''<section class="m"><header><span class="tag">{t}</span><h2>{name}</h2><p>{desc}</p></header>
<svg viewBox="0 0 {W} {Hh}" width="100%" style="background:{BG};border-radius:14px;border:1px solid {B}"><g>{svg}</g>{legend(40, Hh-18)}</svg></section>''' for t, name, desc, svg in MODELS)

html = f'''<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Portföy Ağı — balon modelleri</title>
<style>body{{margin:0;background:{BG};color:{FG};font:14px/1.5 Inter,Segoe UI,system-ui,sans-serif}} .wrap{{max-width:1180px;margin:0 auto;padding:28px 20px 60px}}
h1{{font-size:24px;margin:0 0 6px}} .sub{{color:{FG2};margin:0 0 20px}} .m{{background:{S};border:1px solid {B};border-radius:16px;padding:18px;margin:16px 0}}
.m header{{display:flex;gap:14px;align-items:flex-start;margin-bottom:12px}} .tag{{display:inline-flex;width:36px;height:36px;border-radius:10px;background:rgba(45,212,191,.15);color:#2DD4BF;font-weight:900;font-size:18px;align-items:center;justify-content:center;flex:none}}
h2{{font-size:17px;margin:4px 0 2px}} .m p{{margin:0;color:{FG2};font-size:13px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}} @media(max-width:900px){{.grid{{grid-template-columns:1fr}}}}
table{{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}} td,th{{padding:8px 10px;border-bottom:1px solid {B};text-align:left}} th{{color:{FG2};font-size:11px;text-transform:uppercase;letter-spacing:.06em}}
</style></head><body><div class="wrap">
<h1>Portföy Ağı — balon modelleme alternatifleri</h1>
<p class="sub">Veri: KTJ · KAP Eylül 2026 raporu (gerçek ağırlıklar) · Renk = varlık türü · Balon alanı = fon toplam değerine göre ağırlık. Tıklama → yan panel (E+I) tüm modellerde aynen korunur.</p>
{cards}
<section class="m"><h2>Karşılaştırma</h2><table><tr><th>Model</th><th>Tür ayrımı</th><th>25+ varlıkta okunurluk</th><th>Mobil</th><th>Fon karşılaştırmaya uygunluk</th><th>Uygulama</th></tr>
<tr><td>A · Tek halka</td><td>Renkle</td><td>Zayıf</td><td>Orta</td><td>Zayıf</td><td>Mevcut</td></tr>
<tr><td>B · Gruplu halka</td><td>Yay + renk</td><td>Orta</td><td>Orta</td><td>Orta</td><td>Küçük değişiklik (açı dağılımı)</td></tr>
<tr><td>C · Paketlenmiş</td><td>Renkle</td><td>İyi</td><td>İyi</td><td>Orta</td><td>Orta (yerleşim algoritması)</td></tr>
<tr><td>D · Tür kümeleri</td><td>Küme + yay</td><td>İyi</td><td>Orta</td><td>İyi</td><td>Orta</td></tr>
<tr><td>E · Şerit</td><td>Şerit</td><td>Çok iyi</td><td>Çok iyi</td><td>İyi</td><td>Küçük</td></tr></table>
<p style="color:{FG2};font-size:13px;margin-top:12px">Önerim: masaüstünde <b>D (tür kümeleri)</b> ya da <b>C (paketlenmiş)</b>, mobilde otomatik <b>E (şerit)</b>. B, mevcut halkayı en az değişiklikle iyileştirir.</p></section>
</div></body></html>'''
open(os.path.join(H, "bubble_models.html"), "w", encoding="utf-8").write(html)
print("ok", len(html))
