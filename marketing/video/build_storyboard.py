#!/usr/bin/env python3
"""storyboard.html üretir — bumper önizlemeleri base64 gömülür (tek dosya, her yerde açılır)."""
import base64, os
H = os.path.dirname(os.path.abspath(__file__))
def b64(p):
    with open(os.path.join(H, p), "rb") as f: return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
P16, P9 = b64("preview_16x9.jpg"), b64("preview_9x16.jpg")

SCENES = [
 # (zaman, başlık, ekranda ne var (çekim), üst yazı, seslendirme, geçiş)
 ("0:00–0:04","1 · Açılış — Soru","Siyah zemin, aurora parıltı. Ticker şeridi alttan kayar (bumper'daki). Büyük yazı tek tek belirir.",
  "Piyasayı <em>veriyle</em> mi okuyorsun, <em>söylentiyle</em> mi?","Piyasayı veriyle mi okuyorsun, söylentiyle mi?","Hard cut"),
 ("0:04–0:12","2 · Panel — Tek bakış","<b>EKRAN KAYDI:</b> investliq.com ana Panel, koyu tema, Yoğun görünüm. Yavaş zoom-out (%110→%100). İmleç Bugün kartları üzerinde gezinir; Günün Enleri satırları görünür.",
  "Tek ekran. BIST · Fon · Kripto · Döviz · Makro","InvestliQ, BIST hisselerini, TEFAS fonlarını, kripto ve döviz piyasalarını tek panelde toplar. Veriler İş Yatırım, TEFAS ve KAP gibi kaynaklardan gelir; her kartta kaynak ve veri saati yazar.","Push-left"),
 ("0:12–0:22","3 · Fon Portföy Ağı (vitrin sahnesi)","<b>EKRAN KAYDI:</b> /fund/KTJ → Portföy Ağı sekmesi. Balonlar yüklenir; MSFT balonuna tıklanır, sağda yan panel açılır (%9,77 · Kaynak: KAP). Sonra Fonlar listesine dönüş, çoklu filtre açılır.",
  "Fonun içinde ne var? Hisse hisse.","Bir fonun içinde gerçekten ne olduğunu merak ettin mi? Portföy Ağı, KAP aylık raporlarından hisse hisse ağırlıkları balonlarla gösterir. Tıkla, önceki aya göre değişimi gör.","Zoom-in balon → cut"),
 ("0:22–0:30","4 · Hisse detay + Bilanço","<b>EKRAN KAYDI:</b> /stock/THYAO → grafik + Temel sekmesi (net kâr, FAVÖK). Ardından Finansal Okuryazarlık → Bilanço Okuryazarlığı başlığı kısa kaydırma.",
  "Rakamları oku, hileleri tanı.","Hisse sayfasında fiyatın yanında bilanço var. Bilanço Okuryazarlığı rehberiyle rakamları okumayı ve tablolardaki oyunları fark etmeyi öğren.","Cross-dissolve"),
 ("0:30–0:40","5 · Tarama + Kural Alarmı","<b>EKRAN KAYDI:</b> /tarama — filtre seçilir (örn. F/K < 8, RSI < 35), sonuç tablosu sıralanır. Sonra bir hisseye alarm kuralı eklenir (toast görünür).",
  "Kendi kuralın, kendi listen.","Tarayıcıda kendi kriterlerini kur; sonuçlar deterministik, her satırın kanıtı var. Kural tabanlı alarmlarla koşul oluştuğunda haberin olsun.","Push-left"),
 ("0:40–0:50","6 · Haber akışı + Kritik etiket + Takvim","<b>EKRAN KAYDI:</b> Panel haber akışı; KRİTİK etiketli bir KAP haberi vurgulanır (faaliyet durdurma / pay alım teklifi). Ekonomik takvim satırları.",
  "Kritik haberi kaçırma.","KAP ve ekonomi haberleri akışta; konkordato, işlem kısıtı, pay alım teklifi gibi kritik başlıklar otomatik etiketlenir.","Cut"),
 ("0:50–0:58","7 · Portföy + Risk raporu","<b>EKRAN KAYDI:</b> /portfolio — pozisyonlar, risk raporu kartı (konsantrasyon, sektör dağılımı). Mobil görünümden 2 sn ek kesit (telefon çerçevesi).",
  "Portföyün, her cihazda.","Portföyünü ekle, risk raporunu al; telefon, tablet, bilgisayar — hepsinde aynı hesap.","Cross-dissolve"),
 ("0:58–1:08","8 · Kapanış — CTA","Bumper varyantı: logo + <b>investliq.com</b> + “Ücretsiz başla”. Altta küçük: “Yatırım tavsiyesi değildir. Veriler ~15 dk gecikmeli olabilir; kaynak ve saat her kartta.”",
  "investliq.com · Ücretsiz başla","InvestliQ. Yatırımcılar için akıllı veri platformu. investliq.com’da ücretsiz başla.","Fade-out"),
]
SHORTS = [
 ("0:00–0:03","Hook","“Fonun içinde NE var?” büyük yazı, balonlar arkadan belirir (9:16; Portföy Ağı kaydı dikey kırpılmış).","Fonun içinde ne var, biliyor musun?"),
 ("0:03–0:12","Göster","KTJ Portföy Ağı: MSFT/TSM/KSV balonlarına sırayla tıklama, yan panel. Hızlı kesmeler (1,5 sn).","KAP raporundan hisse hisse ağırlık. Tıkla, önceki aya göre farkı gör."),
 ("0:12–0:20","İkinci kanca","Tarama → 3 filtre → sonuç. “Kendi kuralını kur.”","Kendi kriterini kur, sonucu kanıtıyla gör."),
 ("0:20–0:28","CTA","Logo + investliq.com + “Ücretsiz” rozeti; disclaimer alt satır.","investliq.com. Ücretsiz. Yatırım tavsiyesi değildir."),
]
MUSIC = [
 ("A · Modern teknoloji / minimal elektronik (ÖNERİ)","95–105 BPM, düşük bas + arpej sentez, vuruşlar sahne geçişlerine denk; vokal yok. Hissiyat: güven, netlik, hız değil düzen.","YouTube Audio Library: tür “Dance & Electronic”, ruh hali “Inspirational”/“Bright”, arama: <i>minimal tech, corporate electronic</i>. Pixabay Music: <i>technology corporate</i>, <i>data</i>, <i>minimal</i>. Epidemic/Artlist (ücretli): “corporate tech minimal” koleksiyonları."),
 ("B · Cinematic hafif gerilim → açılım","80–90 BPM, piyano + pad ile başlar, 0:12’de perküsyon girer (balon sahnesi), kapanışta yükselir. Daha ‘haber/analiz’ havası.","Audio Library: “Cinematic” + “Dramatic” filtre; arama: <i>build-up corporate, documentary tech</i>. Pixabay: <i>documentary, suspense light</i>."),
 ("C · Lo-fi / sakin","70–80 BPM, yumuşak davul, sıcak tuşlar; Shorts ve eğitim içeriği (bilanço rehberi) için.","Audio Library: “Hip Hop & Rap” → “Calm”; arama: <i>lofi study, chill beats</i>. Shorts’ta YouTube’un kendi kütüphanesinden eklemek telif açısından en güvenli yol."),
]
def rows(items, cols):
    out=[]
    for it in items:
        out.append("<tr>"+"".join(f"<td>{c}</td>" for c in it)+"</tr>")
    return "\n".join(out)

html = f"""<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>investliQ · Tanıtım Videosu Proje Planı</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{{--bg:#0E1116;--s:#151A21;--c:#1B2129;--t:#2DD4BF;--g:#22C55E;--r:#EF4444;--fg:#F1F5F9;--f2:#94A3B8;--f3:#64748B;--b:#262D37}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 Inter,Segoe UI,system-ui,sans-serif}}
.wrap{{max-width:1180px;margin:0 auto;padding:36px 24px 80px}}
h1{{font-size:30px;margin:0 0 6px}}h2{{font-size:20px;margin:40px 0 12px;color:var(--t)}}h3{{font-size:15px;margin:18px 0 8px}}
.sub{{color:var(--f2);margin:0 0 20px}}
.card{{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:18px 20px;margin:12px 0}}
.grid{{display:grid;gap:14px}}.g2{{grid-template-columns:1fr 1fr}}.g3{{grid-template-columns:repeat(3,1fr)}}
table{{width:100%;border-collapse:collapse;font-size:13.5px}}th{{text-align:left;color:var(--f2);font-weight:600;padding:8px;border-bottom:1px solid var(--b);font-size:12px;text-transform:uppercase;letter-spacing:.06em}}
td{{padding:10px 8px;border-bottom:1px solid var(--b);vertical-align:top}}td:first-child{{white-space:nowrap;font-family:JetBrains Mono,Consolas,monospace;color:var(--t)}}
.frame{{aspect-ratio:16/9;background:var(--bg);border:1px solid var(--b);border-radius:10px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px}}
.frame .cap{{position:absolute;left:10px;top:8px;font-size:11px;color:var(--f3);font-family:monospace}}
.frame .big{{font-size:22px;font-weight:800;line-height:1.2}}.frame .big em{{color:var(--t);font-style:normal}}
.frame .ui{{position:absolute;inset:34px 14px 14px;background:var(--s);border-radius:8px;border:1px solid var(--b);padding:8px;text-align:left;font-size:10px;color:var(--f2)}}
.ui .row{{display:flex;gap:6px;margin:4px 0}}.ui .box{{flex:1;background:var(--c);border-radius:5px;height:26px}}.ui .box.t{{background:rgba(45,212,191,.18);border:1px solid var(--t)}}
.ui .bub{{position:absolute;border-radius:50%;border:2px solid var(--t);background:rgba(45,212,191,.12);display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--fg)}}
.pill{{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(45,212,191,.15);color:var(--t);margin-right:6px}}
.pill.r{{background:rgba(239,68,68,.15);color:var(--r)}}.pill.g{{background:rgba(34,197,94,.15);color:var(--g)}}
.vo{{font-style:italic;color:var(--fg)}}.small{{font-size:12px;color:var(--f3)}}
img.prev{{width:100%;border-radius:10px;border:1px solid var(--b)}}
ol,ul{{padding-left:20px}}li{{margin:4px 0}}
.warn{{border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.06)}}
</style></head><body><div class="wrap">
<h1>investliQ · Tanıtım Videosu + Shorts + Ekonoskop Bumper</h1>
<p class="sub">Proje planı v1 · 27 Eki 2026 · Karar için: sahneler, görseller, seslendirme metni, müzik. Onaydan sonra üretim.</p>

<div class="grid g3">
 <div class="card"><h3>1 · Ana tanıtım (16:9)</h3><div>68 sn · 8 sahne · seslendirme + altyazı<br><span class="small">investliq.com ana sayfa “tanıtım” + Ekonoskop kanal videosu</span></div></div>
 <div class="card"><h3>2 · Shorts (9:16)</h3><div>28 sn · 4 blok · yazı ağırlıklı + VO<br><span class="small">Ekonoskop Shorts + Instagram Reels; aynı kayıtlardan dikey kesim</span></div></div>
 <div class="card"><h3>3 · Ekonoskop bumper</h3><div>5 sn · giriş jeneriğinden hemen sonra<br><span class="small">Hazır — aşağıda önizleme (16:9 ve 9:16 MP4 klasörde)</span></div></div>
</div>

<h2>Ekonoskop reklam geçişi (5 sn) — ÜRETİLDİ, önizleme</h2>
<div class="grid g2">
 <div><img class="prev" src="{P16}" alt="bumper 16:9"><p class="small">bumper_16x9.mp4 · 1920×1080 · 30 fps · 5,0 sn · sessiz (müzik vuruşu kurguda eklenir)</p></div>
 <div class="card"><h3>Akış</h3><ol>
 <li>0,0–0,8 s: Q ikonu ölçeklenerek belirir (ease-out)</li>
 <li>0,6–1,6 s: “Investli” harf harf, ardından gradient <b>Q</b> + turkuaz alt çizgi</li>
 <li>1,4 s: slogan “YATIRIMCILAR İÇİN AKILLI VERİ PLATFORMU”</li>
 <li>2,2 s: <b>investliq.com</b></li>
 <li>3,0 s: “Bu video investliQ desteğiyle hazırlanmıştır · Yatırım tavsiyesi değildir”</li>
 <li>Alt şerit: kayan ticker (temsili değerler) · 4,6–5,0 s fade-out</li></ol>
 <p class="small">Yerleşim: Ekonoskop videolarında giriş jeneriğinin bitiminden hemen sonra (izleyici kopmadan); isteğe bağlı 10 sn kapanış CTA varyantı sonra eklenebilir.</p>
 <p class="small">Değişebilir: ticker gerçek gün verisiyle (render anında API’den) üretilebilir; font Lato → Inter (marka fontu) dosya sağlanınca.</p></div>
</div>

<h2>Ana tanıtım — storyboard (68 sn)</h2>
<div class="grid g2">
 <div class="frame"><span class="cap">S1 · 0:00</span><div class="big">Piyasayı <em>veriyle</em> mi okuyorsun,<br><em>söylentiyle</em> mi?</div></div>
 <div class="frame"><span class="cap">S2 · 0:04 · Panel (ekran kaydı)</span><div class="ui">Bugün · XU100 · USD · Altın · BTC<div class="row"><div class="box t"></div><div class="box"></div><div class="box"></div><div class="box"></div></div><div class="row"><div class="box" style="height:60px"></div><div class="box" style="height:60px"></div></div><div class="row"><div class="box"></div><div class="box"></div></div>Günün Enleri · Haber akışı · Takvim</div></div>
 <div class="frame"><span class="cap">S3 · 0:12 · Portföy Ağı (vitrin)</span><div class="ui" style="background:var(--bg)"><div class="bub" style="left:44%;top:36%;width:54px;height:54px;border-color:var(--g)">KTJ</div><div class="bub" style="left:62%;top:14%;width:44px;height:44px">MSFT<br>9,8</div><div class="bub" style="left:72%;top:52%;width:40px;height:40px">TSM<br>9,0</div><div class="bub" style="left:22%;top:22%;width:38px;height:38px">KSV<br>8,3</div><div class="bub" style="left:26%;top:62%;width:30px;height:30px">AVGO</div><div class="bub" style="left:50%;top:70%;width:26px;height:26px">MU</div><div style="position:absolute;right:8px;top:8px;width:34%;height:70%;background:var(--s);border:1px solid var(--b);border-radius:6px;padding:6px;font-size:9px">MSFT<br><b style="color:var(--fg);font-size:13px">%9,77</b><br>Önceki ay: %9,78<br><span class="small">Kaynak: KAP · Eylül 2026</span></div></div></div>
 <div class="frame"><span class="cap">S4 · 0:22 · Hisse + Bilanço</span><div class="ui"><div class="row"><div class="box" style="height:48px;flex:2"></div><div class="box" style="height:48px"></div></div>Net Kâr · FAVÖK · Net Borç/FAVÖK<div class="row"><div class="box"></div><div class="box"></div><div class="box"></div></div><span style="color:var(--t)">Bilanço Okuryazarlığı → “Tablolardaki hileleri yakala”</span></div></div>
 <div class="frame"><span class="cap">S5 · 0:30 · Tarama + Alarm</span><div class="ui"><span class="pill">F/K &lt; 8</span><span class="pill">RSI &lt; 35</span><span class="pill">Hacim ↑</span><div class="row"><div class="box"></div></div><div class="row"><div class="box"></div></div><div class="row"><div class="box"></div></div><span class="pill g">Kural alarmı eklendi ✓</span></div></div>
 <div class="frame"><span class="cap">S6 · 0:40 · Haber + Kritik</span><div class="ui"><div class="row"><span class="pill r">KRİTİK</span> SPK — 3 aracı kuruma geçici faaliyet durdurma</div><div class="row"><div class="box"></div></div><div class="row"><div class="box"></div></div>Ekonomik takvim · TÜFE · PPK</div></div>
 <div class="frame"><span class="cap">S7 · 0:50 · Portföy + Risk</span><div class="ui"><div class="row"><div class="box" style="height:40px"></div><div class="box" style="height:40px"></div><div class="box t" style="height:40px"></div></div>Risk raporu · Konsantrasyon · Sektör<div style="position:absolute;right:10px;bottom:8px;width:44px;height:80px;border:2px solid var(--f3);border-radius:8px"></div></div></div>
 <div class="frame"><span class="cap">S8 · 0:58 · CTA</span><div class="big">Investli<em>Q</em><br><span style="font-size:14px;color:var(--f2)">investliq.com · Ücretsiz başla</span><br><span class="small">Yatırım tavsiyesi değildir</span></div></div>
</div>

<div class="card"><table><thead><tr><th>Zaman</th><th>Sahne</th><th>Görüntü / Çekim</th><th>Üst yazı</th><th>Seslendirme</th><th>Geçiş</th></tr></thead><tbody>
{rows([(a,b,c,d,f'<span class="vo">“{e}”</span>',g) for a,b,c,d,e,g in SCENES],6)}
</tbody></table></div>

<div class="grid g2">
<div class="card"><h3>Seslendirme (tam metin, ~150 kelime ≈ 62 sn)</h3>
<p class="vo">{" ".join(s[4] for s in SCENES)}</p>
<p class="small">Ses: Türkçe, orta tonlu, sakin-güvenli; erkek veya kadın (karar). Üretim: ElevenLabs / Azure “tr-TR-AhmetNeural / EmelNeural” (sandbox’tan erişilemiyor; senin hesabından ya da yerelde). Alternatif: kendi sesin.</p></div>
<div class="card warn"><h3>Uyum (SPK / itibar) — metinde kasıtlı olarak YOK</h3>
<ul><li>“al / sat / kazandırır / garanti / sinyal verir” yok; “gör, oku, kur, haberin olsun” var.</li>
<li>“Gerçek zamanlı” iddiası yok (eski videoda vardı) — “kaynak ve veri saati her kartta”.</li>
<li>Her videoda görünür disclaimer: <b>Yatırım tavsiyesi değildir.</b></li>
<li>Ekranda görünen rakamlar gerçek ekran kaydından; sahte grafik/uydurma getiri yok.</li></ul></div>
</div>

<h2>Shorts (9:16 · 28 sn)</h2>
<div class="card"><table><thead><tr><th>Zaman</th><th>Blok</th><th>Görüntü</th><th>VO / Yazı</th></tr></thead><tbody>{rows(SHORTS,4)}</tbody></table>
<p class="small">Kural: ilk 3 sn’de kanca, her 1,5–2 sn’de kesme, yazılar ekranın orta bandında (üst/alt UI bindirmelerine girmesin), altyazı yanık (burned-in).</p></div>

<h2>Müzik önerileri</h2>
<div class="card"><table><thead><tr><th>Seçenek</th><th>Karakter</th><th>Nereden (telifsiz / lisanslı)</th></tr></thead><tbody>{rows(MUSIC,3)}</tbody></table>
<p class="small">Not: Ses dosyalarını dinleyemiyorum; parça adı yerine tür/BPM/kütüphane + arama anahtarı veriyorum. 2–3 aday indirip klasöre bırakırsan kurguyu (vuruş–kesme hizası, ducking) ben yaparım. Shorts için YouTube’un kendi kütüphanesi telif açısından en güvenli yol.</p></div>

<h2>Üretim yolu</h2>
<div class="grid g2">
<div class="card"><h3>Ben üretirim</h3><ul><li>Bumper 16:9 + 9:16 (hazır)</li><li>Açılış/kapanış kartları, başlık animasyonları, altyazı (SRT + yanık)</li><li>Kurgu: ffmpeg ile kesme, zoom/pan (Ken Burns), geçişler, müzik ducking, loudness (-14 LUFS)</li><li>Shorts dikey kesim (crop + yeniden çerçeveleme)</li></ul></div>
<div class="card"><h3>Senden gerekenler</h3><ol><li><b>Ekran kayıtları</b> (OBS/Win+G, 1920×1080, 60 fps, koyu tema, Yoğun görünüm, imleç görünür, 1 sn baş/son pay): S2 Panel · S3 KTJ Portföy Ağı (balona tıkla) · S4 THYAO + Bilanço rehberi · S5 Tarama + alarm · S6 haber akışı (kritik haber varken) · S7 portföy + telefon ekranı (iPhone kayıt ya da tarayıcı mobil mod)</li><li>Seslendirme: ElevenLabs/Azure çıktısı (mp3/wav) ya da kendi sesin</li><li>Müzik: 1–2 aday dosya</li><li>Dosyaları <code>C:\\dev\\hanefinans\\marketing\\video\\raw\\</code> altına koy</li></ol></div>
</div>

<h2>Kararlar (onay bekleyen)</h2>
<div class="card"><ol>
<li>Seslendirme cinsiyeti/tonu: erkek sakin mi, kadın enerjik mi?</li>
<li>Müzik seçeneği: A (tech minimal) / B (cinematic) / C (lo-fi)?</li>
<li>S1 açılış cümlesi: “Piyasayı veriyle mi okuyorsun, söylentiyle mi?” — alternatif: “Fonun içinde ne var, biliyor musun?”</li>
<li>Bumper metni: “Bu video investliQ desteğiyle hazırlanmıştır” mı, “Veri ortağımız investliQ” mı?</li>
<li>Kapanış CTA: “Ücretsiz başla” mı (hesap gerekmeden kullanım var), “Hemen dene” mi?</li></ol></div>
<p class="small">Dosyalar: marketing/video/ → storyboard.html · bumper_16x9.mp4 · bumper_9x16.mp4 · render_bumper.py (yeniden üretilebilir) · Not: public/ altındaki Mayıs tarihli iki eski video HaneFinans markası ve “gerçek zamanlı” ifadesi içeriyor; yayından kaldırılmalı.</p>
</div></body></html>"""
open(os.path.join(H, "storyboard.html"), "w", encoding="utf-8").write(html)
print("storyboard.html", len(html))
