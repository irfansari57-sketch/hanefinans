import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen, TrendingUp, PiggyBank, Activity, ShieldAlert, Bitcoin, Calculator, GraduationCap,
  Search, ExternalLink, ChevronRight, Briefcase,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { BESCalculator } from '@/components/domain/BESCalculator';
import { cn } from '@/lib/utils';

interface Topic {
  slug: string;
  title: string;
  icon: typeof BookOpen;
  tone: 'accent' | 'success' | 'warning' | 'danger';
  description: string;
  videoQuery: string;       // YouTube search query
  keyTerms: { term: string; def: string }[];
  bullets: string[];
  externalLinks?: { label: string; url: string }[];
  /** Geniş kapsamlı yazılı anlatım — section başlıklarıyla */
  sections?: { heading: string; body: string }[];
}

const TOPICS: Topic[] = [
  {
    slug: 'borsa-temelleri',
    title: 'Borsa Temelleri (BIST)',
    icon: TrendingUp,
    tone: 'accent',
    description:
      'Borsa nedir, BIST 100/30 endeksleri neyi gösterir, hisse senedi nasıl alınır-satılır? Yatırıma yeni başlayanlar için temel bilgi.',
    videoQuery: 'borsa istanbul nedir başlangıç',
    bullets: [
      'BIST 100: Borsa İstanbul\'da işlem gören en büyük 100 hissenin değerini gösteren endeks',
      'BIST 30: En büyük 30 hisse — VIOP30 vadeli kontratının dayanağı',
      'Hisse alıp satmak için aracı kurum (broker) gerekir: Midas, Garanti BBVA Yatırım, vb.',
      'Lot: Bir hisse alma birimi (Türkiye\'de 1 lot = 1 hisse)',
      'Komisyon: Her işlemde aracı kurum keser, %0.1-0.3 arası',
    ],
    keyTerms: [
      { term: 'Endeks', def: 'Belirli hisselerin ortalama değerini gösteren sayı' },
      { term: 'Volatilite', def: 'Fiyatın dalgalanma şiddeti' },
      { term: 'Likidite', def: 'Bir varlığın hızla nakde dönüşebilme derecesi' },
      { term: 'Spread', def: 'Alış ve satış fiyatı arasındaki fark' },
    ],
    externalLinks: [
      { label: 'KAP — Kamuyu Aydınlatma', url: 'https://www.kap.org.tr' },
      { label: 'BIST Resmi Sayfa', url: 'https://www.borsaistanbul.com' },
    ],
    sections: [
      {
        heading: 'Borsa nedir ve neden vardır?',
        body: 'Borsa, şirketlerin halka açılarak finansman bulduğu ve yatırımcıların bu şirketlere küçük paylar (hisse) alarak ortak olduğu organize bir pazardır. Borsa İstanbul (BIST), Türkiye\'nin tek menkul kıymetler borsasıdır ve dünyanın 30+ ülkesindeki yabancı yatırımcılar da burada işlem yapar. Bir hisse aldığında, o şirketin küçük bir parçasının sahibi olursun: şirket kâr ederse temettü (kâr payı) alırsın, hisse değeri yükselirse aradaki farkı satarak kazanırsın. Şirket kötü giderse hissen değer kaybeder — yani borsa garantili değil, fırsat ve risk birlikte gelir.',
      },
      {
        heading: 'BIST 100 ve BIST 30 endeksleri',
        body: 'BIST 100 endeksi, Borsa İstanbul\'da işlem gören en yüksek piyasa değerine ve likiditeye sahip 100 hisse senedinin ağırlıklandırılmış ortalamasıdır. Bu endeks, "piyasa nasıl?" sorusunun cevabıdır — bir gün BIST 100 %2 yükseldi diyorsak, ortalama olarak en büyük 100 şirket o gün %2 değerlendi demektir. BIST 30 ise BIST 100\'ün içindeki en büyük 30 hisseyi içerir; bunlar genelde bankalar, holding\'ler, Tüpraş, THYAO, Aselsan, Sabancı/Koç Holding gibi devlerdir. VIOP30 (Vadeli İşlem Opsiyon Piyasası 30) sözleşmeleri, BIST 30 endeksini dayanak alarak gelecek tarihli kontrat olarak işlem görür — kısa pozisyon açma ve kaldıraçlı işlem için kullanılır.',
      },
      {
        heading: 'İlk adım: Aracı kurum seçimi',
        body: 'Borsada işlem yapabilmek için SPK (Sermaye Piyasası Kurulu) lisanslı bir aracı kuruma yatırım hesabı açman gerekir. Türkiye\'de popüler tercihler: **Midas** (sıfır komisyon, mobil odaklı, yeni başlayanlara çok uygun), **Garanti BBVA Yatırım** (banka entegrasyonu, çoğu kişide zaten var), **İş Yatırım** (kurumsal güven, geniş ürün yelpazesi), **Gedik Yatırım**, **Yapı Kredi Yatırım**. Hesap açarken kimlik, ikametgah ve banka bilgilerin yeterli — online açılır. Komisyon yapısını mutlaka karşılaştır: bazıları sıfır, bazıları %0.05-0.25 arası işlem başına keser. Yıllık üyelik veya saklama ücreti olabilir.',
      },
      {
        heading: 'İşlem nasıl yapılır?',
        body: 'BIST\'in açılış-kapanış saatleri: Hafta içi 10:00 - 18:00 (öğle arası yok, sürekli işlem). Açılış öncesi 09:40-10:00 "açılış seansı"nda emirler toplanır ve 10:00\'da tek fiyattan eşleşir. Bir hisse satın almak için aracı kurumun uygulamasına gir, sembolü ara (örn. THYAO), "Limit" veya "Piyasa" emir tipini seç (Limit\'te fiyat belirtirsin, sadece o fiyat ve altına alır; Piyasa\'da güncel fiyattan hemen işlem olur), lot adedini gir (1 lot = 1 hisse) ve onayla. Satarken aynı süreç — pozisyonu kapatırsın. Komisyon her iki tarafta da kesilir; vergisel olarak 2 yıldan az tutulan hisselerde kâr stopaja tabidir.',
      },
    ],
  },
  {
    slug: 'yatirim-fonlari',
    title: 'Yatırım Fonları (TEFAS)',
    icon: PiggyBank,
    tone: 'success',
    description:
      'Fonlar nedir, neden tercih edilir, getiri nasıl ölçülür, ücretler nelerdir? TEFAS sisteminde işlem nasıl yapılır?',
    videoQuery: 'yatırım fonu nedir TEFAS',
    bullets: [
      'Fon = Profesyonel yöneticinin senin paranı çeşitli varlıklara dağıtması',
      'TEFAS: Türkiye Elektronik Fon Alım Satım Platformu — tüm fonlara tek noktadan ulaş',
      'Fon türleri: Para piyasası, hisse senedi, borçlanma araçları, fon sepeti, kıymetli madenler, katılım',
      'Yıllık yönetim ücreti %0.5-3 arası — getiriden düşülür',
      'Vergi: Hisse fonlarda stopaj %0 (3 yıl elinde tut), diğerlerde %10',
    ],
    keyTerms: [
      { term: 'NAV', def: 'Net Asset Value — fonun bir biriminin değeri (Birim Pay Değeri)' },
      { term: 'Stopaj', def: 'Vergi kesintisi — banka tarafından otomatik' },
      { term: 'Şemsiye', def: 'Aynı portföy yönetim şirketinin fon kategorisi' },
      { term: 'Karşılaştırma ölçütü', def: 'Fonun başarısını ölçen referans endeks (örn. BIST 100)' },
    ],
    externalLinks: [
      { label: 'TEFAS Resmi', url: 'https://www.tefas.gov.tr' },
      { label: 'Fintables Fon Karşılaştırma', url: 'https://fintables.com/fonlar' },
    ],
    sections: [
      {
        heading: 'Yatırım fonu nedir?',
        body: 'Yatırım fonu, profesyonel bir portföy yöneticisinin senin paranı diğer yatırımcıların parasıyla birleştirip belirli bir stratejiye göre yatırım yaptığı havuzdur. Tek başına 100 farklı hisse alamazsın, ama bir hisse senedi fonu seninkilerden alarak bunu yapar. Bu sayede otomatik çeşitlendirme elde edersin ve uzman yönetimine erişirsin. Karşılığında yıllık yönetim ücreti ödersin (%0.5-3 arası). Fon büyüdükçe yönetim daha verimli olur; küçük yatırımcı için en kolay yatırım aracıdır.',
      },
      {
        heading: 'TEFAS sistemi nasıl çalışır?',
        body: 'TEFAS (Türkiye Elektronik Fon Alım Satım Platformu), Türkiye\'deki tüm yatırım fonlarına tek bir bankadan/aracı kurumdan ulaşmanı sağlar. Eskiden Garanti fonu için Garanti hesabı, İş Bankası fonu için İş Bankası hesabı gerekiyordu; artık herhangi birinden hepsine erişirsin. Fon alım emri verdiğinde işlem T+1 (bir iş günü sonrası) NAV fiyatından gerçekleşir — yani bugün verdiğin emrin fiyatı yarınki NAV\'da netleşir. Satışta T+2 yani 2 iş günü sonra paran hesabına geçer. Hisse senedi fonları ise T+1\'dir.',
      },
      {
        heading: 'Hangi fon kategorisi sana uygun?',
        body: 'Risk iştahına ve yatırım vadeye göre seçim yap: **Para Piyasası fonları** (kısa vadeli, çok düşük risk, %20-50 yıllık getiri — kasaya benzer); **Borçlanma Araçları fonları** (devlet/şirket tahvilleri, orta risk); **Hisse Senedi fonları** (BIST hisselerine yatırım, yüksek risk yüksek getiri potansiyeli); **Fon Sepeti fonları** (birden fazla fona dağıtım); **Kıymetli Madenler fonları** (altın/gümüş bazlı); **Değişken fonlar** (yöneticiye geniş yetki); **Katılım fonları** (faizsiz, İslami finans kurallarına uygun). 1-2 yıllık vadede emekli olacaksan para piyasası, 10+ yıl vadeli birikim için hisse fonu tercih et.',
      },
    ],
  },
  {
    slug: 'teknik-analiz',
    title: 'Teknik Analiz',
    icon: Activity,
    tone: 'accent',
    description:
      'RSI, MACD, Bollinger, hareketli ortalamalar... Grafiklerdeki desenleri okuma sanatı. Kısa vadeli yatırımcı için temel.',
    videoQuery: 'teknik analiz RSI MACD türkçe',
    bullets: [
      'RSI (Relative Strength Index): 0-100 arası — 70 üstü aşırı alım, 30 altı aşırı satım',
      'MACD: İki hareketli ortalamanın farkı — pozitif kesişim bullish sinyal',
      'Bollinger Bandı: Fiyatın volatiliteye göre üst/alt sınırı',
      'Destek/Direnç: Fiyatın yatay olarak takıldığı seviyeler',
      'Hacim önemli — fiyat hareketini doğrular',
    ],
    keyTerms: [
      { term: 'Trend', def: 'Fiyatın genel yönü (yükseliş/yatay/düşüş)' },
      { term: 'Mum Çubuğu', def: 'Belirli zaman aralığının open-high-low-close değerlerini gösteren grafik' },
      { term: 'Boğa (Bull)', def: 'Yükseliş eğilimi' },
      { term: 'Ayı (Bear)', def: 'Düşüş eğilimi' },
      { term: 'Fibonacci', def: 'Doğal sayı dizisi tabanlı destek/direnç seviyeleri' },
    ],
    sections: [
      {
        heading: 'Teknik analiz nedir, neden işe yarar?',
        body: 'Teknik analiz, geçmiş fiyat ve hacim verilerinden geleceği tahmin etmeye çalışan disiplindir. Temel mantık şudur: piyasa katılımcılarının kolektif davranışı tekrarlayan örüntüler oluşturur. Bir hisse her seferinde belirli bir fiyat seviyesinde dirence çarpıyorsa, oradaki satıcılar olası önümüzdeki seferde de aktif olacaktır. Teknik analiz "ne kadar zaman tutmalıyım" sorusuna değil, "şu anda almak/satmak iyi mi" sorusuna cevap arar. Temel analiz (şirketin finansalları) ile birlikte kullanılınca güçlü olur — sadece grafik bakmak yeterli değildir.',
      },
      {
        heading: 'RSI, MACD, Bollinger nasıl okunur?',
        body: '**RSI (Relative Strength Index, 14 günlük):** 0-100 arası bir göstergedir. 70 üstü "aşırı alım" — fiyat hızla yükselmiş, geri çekilme bekleyebilirsin. 30 altı "aşırı satım" — düşüş bitmiş olabilir, toparlanma sinyali. RSI tek başına alış-satış emri vermez ama trend tersine dönmeden önce uyarır. **MACD (Moving Average Convergence Divergence):** İki üstel hareketli ortalamanın (12 ve 26 günlük) farkı + 9 günlük sinyal çizgisi. MACD çizgisi sinyali yukarı keserse "bullish cross" (alış sinyali), aşağı keserse "bearish cross" (satış sinyali). **Bollinger Bantları:** 20 günlük ortalama etrafında 2 standart sapma genişliğinde bir kanal. Fiyat üst bandı geçerse aşırı alım, alt bandın altına düşerse aşırı satım. Bantlar daralırsa volatilite düşük (sıkışma) — sonra büyük hareket gelir.',
      },
      {
        heading: 'EMA pozisyonları ile trend okuma',
        body: 'EMA (Exponential Moving Average), yeni fiyatlara daha fazla ağırlık veren hareketli ortalama türüdür. Hane Finans BIST analizinde EMA 5, 8, 13, 21, 55 ve 200 kullanılır. **EMA 5-13:** Çok kısa vadeli trend (scalping). **EMA 21-55:** Kısa-orta vadeli trend (1-3 hafta). **EMA 200:** Uzun vadeli trend (yıllık). Fiyat EMA 200\'ün üstündeyse hisse "uzun vadeli boğa modunda" — düşüşler alım fırsatı. Altındaysa "uzun vadeli ayı" — yükselişler satış fırsatı olabilir. EMA 5 ve EMA 13\'ün kesişimi (golden cross / death cross) kısa vadeli trend dönüşü sinyalidir. MA8 fiyatı ise günlük (1D) 8 periyodluk basit ortalamadır — kısa vadeli swing trade için referans seviye.',
      },
      {
        heading: 'Destek-direnç ve hacim',
        body: 'Destek, fiyatın takıldığı ve aşağı geçmediği seviyedir — alıcıların güçlü olduğu yer. Direnç, fiyatın geçmediği üst seviye — satıcıların aktif olduğu yer. Bir direnç kırılırsa eski direnç yeni destek olur. Hacim her zaman doğrulayıcıdır: yüksek hacimle gelen yükseliş güvenilir, düşük hacimde olan yükseliş "boş yükseliş" olabilir. Profesyoneller hacmi takip etmeden teknik analiz yapmaz. ADX (Average Directional Index) trend gücünü ölçer: 25 üstü güçlü trend, altı kararsız piyasa demektir.',
      },
    ],
  },
  {
    slug: 'risk-yonetimi',
    title: 'Risk Yönetimi',
    icon: ShieldAlert,
    tone: 'danger',
    description:
      'Borsada kazanmaktan çok kaybetmemek önemli. Stop-loss, pozisyon büyüklüğü, çeşitlendirme nasıl yapılır?',
    videoQuery: 'risk yönetimi yatırım stop loss',
    bullets: [
      '1-2 kuralı: Tek bir işlemde sermayenin %1-2\'sinden fazlasını riske atma',
      'Stop-loss: Kayıp belirli seviyeye geldiğinde otomatik satış emri',
      'Çeşitlendirme (diversification): Tek hisseye/sektöre fazla yüklenme',
      'Risk-getiri oranı: 1:2 veya 1:3 olmalı (1 lira riske için 2-3 lira hedef)',
      'Duygusal karar verme — en büyük düşman; plan yap, plana uy',
    ],
    keyTerms: [
      { term: 'Stop-Loss', def: 'Belirli zarar seviyesinde otomatik satış' },
      { term: 'Take-Profit', def: 'Belirli kar seviyesinde otomatik satış' },
      { term: 'Drawdown', def: 'Portföyün en yüksek değerine göre en düşük noktası' },
      { term: 'Sharpe Oranı', def: 'Risk başına getiri ölçüsü' },
    ],
    sections: [
      {
        heading: 'Risk yönetimi: kazanmaktan önemli',
        body: 'Borsada uzun vadeli başarının %80\'i risk yönetimine, %20\'si analize bağlıdır. Çünkü %50 düşüşten kurtulmak için %100 kazanman gerekir — yani büyük kayıpları engellemek küçük kazançlardan kıymetlidir. Profesyonel trader\'lar her zaman "kaybedersem ne olur?" diye sorarak işleme girer. Sermayenin tamamını tek hisseye yatırmak, kaldıraçlı işlem yapmak, stop-loss kullanmamak, duygusal karar vermek — bunların hepsi kısa zamanda hesabı sıfırlar. Profesyonel risk yönetimi 4 ayak üzerinde durur: pozisyon büyüklüğü, stop-loss, çeşitlendirme ve psikolojik disiplin.',
      },
      {
        heading: 'Pozisyon büyüklüğü hesaplama',
        body: '**1-2 kuralı:** Tek bir işlemde sermayenin en fazla %1-2\'sini riske at. Örnek: 100.000₺ portföyün varsa, bir işlemde 1.000-2.000₺\'den fazla kaybetme planı yapma. Hesaplama: Pozisyon büyüklüğü = (Riske atılan tutar) / (giriş fiyatı - stop fiyatı). Örnek: THYAO\'yu 320₺\'den alıyorsun, stop seviyesi 310₺ (10₺ risk per hisse). 1.000₺ kaybetmeye razıysan: 1.000 / 10 = 100 lot. Bu hesabı yapmadan "100 lot THYAO alayım" demek, ne kadar riske attığını bilmemek demektir. Risk-getiri oranı: hedef kâr en az risk\'in 2-3 katı olmalı (1:2 veya 1:3). 1.000₺ riske at, hedefin 2.000-3.000₺ kâr olsun.',
      },
      {
        heading: 'Stop-Loss neden zorunlu?',
        body: 'Stop-loss, fiyat belirli seviyeye düştüğünde otomatik satış emridir. Borsanın en güçlü kuralı: "Önce sermayeni koru, sonra büyüt." Stop-loss kullanmayanlar genelde şöyle hata yapar: hisse %5 düşer, "biraz daha bekleyim toparlanır" derler, %15 düşer, "şimdi satarsam zarar realize olur" derler, %30 düşer ve artık çıkamazlar. Bu psikolojik tuzağı kırmanın tek yolu işleme girmeden önce stop-loss seviyesini belirleyip sisteme tanıtmaktır. Teknik stop: önemli destek seviyesinin biraz altı. Yüzde bazlı stop: girdiğin fiyatın %5-8 altı (uzun vadeli yatırımda). Volatilite bazlı stop: ATR (Average True Range) kullanarak hesapla.',
      },
      {
        heading: 'Çeşitlendirme ve sektör dağılımı',
        body: 'Tüm yumurtaları aynı sepete koyma. Sermayenin %20\'sinden fazlasını tek hisseye, %40\'tan fazlasını tek sektöre yatırma. Bankacılık tek başına portföyün yarısıysa, bir CBRT faiz kararı seni mahvedebilir. Sağlıklı bir BIST portföyü: bankacılık (%15-20), holding (%10-15), savunma sanayii (%10), enerji (%10-15), perakende-tüketici (%10), demir-çelik (%5-10), gayrimenkul (%5), ulaşım/havayolu (%5-10), nakit/altın (%10-15). Korelasyon önemli: GARAN, AKBNK, ISCTR aynı yönde hareket eder; üçünü birden almak çeşitlendirme değildir.',
      },
    ],
  },
  {
    slug: 'kripto',
    title: 'Kripto Para',
    icon: Bitcoin,
    tone: 'warning',
    description:
      'Bitcoin nedir, blockchain nasıl çalışır, altcoin/stablecoin/DeFi kavramları, kripto borsasına nasıl giriş yapılır?',
    videoQuery: 'kripto para nedir bitcoin başlangıç',
    bullets: [
      'Bitcoin (BTC): İlk ve en büyük kripto para — sınırlı arz (21M)',
      'Ethereum (ETH): Akıllı kontrat platformu — DeFi ekosisteminin temeli',
      'Stablecoin: USDT, USDC — sabit USD değeri tutan kriptolar',
      'Altcoin: Bitcoin dışındaki tüm kriptolar (ETH, SOL, ADA vb.)',
      'Kripto borsaları: Binance, Bybit, OKX — Türkiye\'de Paribu, BTCTurk',
      'Risk: Volatilite çok yüksek, regülasyon belirsiz',
    ],
    keyTerms: [
      { term: 'Cüzdan', def: 'Kriptonu sakladığın yazılım/donanım (private key sahibi)' },
      { term: 'DeFi', def: 'Decentralized Finance — aracısız finansal hizmetler' },
      { term: 'Staking', def: 'Kriptonu kilitleyip getiri kazanma' },
      { term: 'Gas fee', def: 'Ethereum işlem ücreti' },
      { term: 'NFT', def: 'Non-Fungible Token — benzersiz dijital varlık' },
    ],
    sections: [
      {
        heading: 'Bitcoin ve blockchain temelleri',
        body: 'Bitcoin (BTC), 2009\'da Satoshi Nakamoto takma adlı kişi/grup tarafından oluşturulmuş ilk merkeziyetsiz dijital paradır. Blockchain (zincir bloklar), her işlemin onaylanıp şifrelendiği ve binlerce bilgisayara dağıtıldığı bir kayıt defteridir — yani kimse bir kaydı silemez veya değiştiremez. Bitcoin\'in en kritik özelliği sınırlı arzıdır: toplam 21 milyon BTC üretilecek ve sonra hiç yenisi olmayacak. Şu an 19.7+ milyon dolaşımdadır. Bu kıtlık, Bitcoin\'i "dijital altın" yapan özelliktir. Madencilik (mining), bilgisayarların matematik problemleri çözerek yeni blok ekleme ve karşılığında yeni BTC kazanma sürecidir.',
      },
      {
        heading: 'Ethereum ve akıllı sözleşmeler',
        body: 'Ethereum (ETH), 2015\'te Vitalik Buterin tarafından kurulan, sadece para transferi değil "akıllı sözleşme" (smart contract) çalıştıran blockchain platformudur. Akıllı sözleşme, koşullar gerçekleştiğinde otomatik çalışan programdır — örnek: "Eğer X tarihinde Y olursa ödeme Z\'ye git". DeFi (decentralized finance) ekosisteminin temelidir: Uniswap (decentralized exchange), Aave (borç-mevduat), Compound, MakerDAO\'da sabitcoin DAI. Ethereum 2022\'de "Merge" güncellemesi ile Proof-of-Stake\'e geçti — artık madencilik değil staking ile blok onaylanıyor, %99 daha az enerji harcanıyor.',
      },
      {
        heading: 'Türkiye\'de kripto: borsalar ve regülasyon',
        body: 'Türkiye\'de kripto ticareti yasal ancak ödeme aracı olarak kullanmak yasaktır (2021 BDDK kararı). Yerli borsalar: **Paribu** (Türkiye\'nin en büyük kripto borsası, lira mevduat), **BTCTurk** (eski), **BiLira/BLP**. Yurtdışı: **Binance**, **Bybit**, **OKX** (TR çıkarımı zor, KYC sıkı). 2024-2026 arasında SPK kripto regülasyonu netleşmeye başladı, lisanslı borsalar listelendi. Vergi: 2026 itibariyle kripto kazançları beyana tabi tutulmaya başlandı, kazançlar gelir vergisinde olabilir — güncel mevzuatı GİB\'den takip et. Soğuk cüzdan (hardware wallet — Ledger, Trezor) büyük tutarlar için zorunlu güvenlik tedbiridir.',
      },
      {
        heading: 'Kripto yatırımının riskleri',
        body: 'Volatilite kripto dünyasının doğasıdır: bir günde %30-50 düşüş normaldir, bir ayda %80 düşüş yaşandı (örn. 2022 Luna çöküşü). Buna ek riskler: regülasyon belirsizliği (devletler yasak getirebilir), borsa iflası (FTX 2022\'de battı, kullanıcı paraları yandı), hack/scam (rugpull, fake projeler), private key kaybı (kaybedince paran sonsuza kadar gider). Tavsiye: Tüm net varlığının en fazla %5-10\'unu kriptoya ayır. Sadece BTC ve ETH ile başla (büyük çoğunluk altcoin\'lere yatırım sonunda kaybeder). Soğuk cüzdan kullan, borsada uzun süreli para tutma. "Kaybedebileceğin parayı" yatır kuralı kripto için iki kat geçerli.',
      },
    ],
  },
  {
    slug: 'vergi-mevzuat',
    title: 'Vergi & Mevzuat',
    icon: Calculator,
    tone: 'success',
    description:
      'Yatırım gelirleri nasıl vergilendirilir, beyan ne zaman gerekir, indirimler nelerdir? Türkiye için 2026 kuralları.',
    videoQuery: 'borsa vergisi türkiye stopaj',
    bullets: [
      'Hisse senedi: 2 yıldan az tuttysan kar %15 stopaj, 2+ yıl tuttysan vergi yok',
      'Fonlar: Stopaj fon tipine göre değişir (hisse fonu %0 / diğer %10)',
      'Kripto: 2026 itibariyle kazanç beyana tabi (mevzuat değişiyor — güncel dur)',
      'Temettü: Stopaj %0-15 (şirket türüne göre)',
      'Yıllık beyan: Yüksek tutarlı kazançlarda zorunlu',
    ],
    keyTerms: [
      { term: 'Stopaj', def: 'Kaynağında kesilen vergi' },
      { term: 'KDV', def: 'Katma Değer Vergisi (yatırım kazançlarında uygulanmaz)' },
      { term: 'Damga vergisi', def: 'Sözleşme bazlı vergi' },
      { term: 'GMSI', def: 'Gayrimenkul Sermaye İradı (kira gelirleri vergisi)' },
    ],
    externalLinks: [
      { label: 'GİB — Gelir İdaresi', url: 'https://www.gib.gov.tr' },
    ],
    sections: [
      {
        heading: 'Borsa kazançlarının vergilendirilmesi',
        body: 'Türkiye\'de hisse senedi yatırım kazançlarının vergilendirilmesi tutuş süresine göre değişir. **2 yıldan kısa süre tutulan hisseler:** Satıştan elde edilen kazanç (sermaye kazancı) %15 oranında stopaj olarak banka tarafından otomatik kesilir. **2 yıldan uzun tutulan hisseler:** İstisna kapsamında, vergi yok — uzun vadeli yatırımı teşvik eden en önemli mevzuat. Bu süre hisseyi aldığın tarihten satış tarihine kadar sayılır; FIFO (ilk giren ilk çıkar) yöntemi uygulanır. Temettüler ayrı vergilendirilir: kurumlardan gelen kar paylarında %15-20 stopaj kesilir, yıllık beyan limitini aşıyorsan ek beyan zorunluluğu doğabilir.',
      },
      {
        heading: 'Yatırım fonları vergisi',
        body: '**Hisse senedi yoğun fonlar** (portföyünün en az %75\'i hisse): Stopaj **%0** — yani kesinti yok! Bu büyük avantaj, uzun vadeli BIST yatırımı için fon kullanımı çekici kılar. **Diğer fonlar** (para piyasası, borçlanma araçları, fon sepeti, değişken, kıymetli madenler): Kazanç üzerinden **%10 stopaj** kesilir. Stopaj otomatik banka tarafından yapılır, ek beyan gerekmez (basit yatırımcı için). 2 yıldan uzun tutulmuş hisse fonlarında bile %0 stopaj devam eder — yani fonlar bireysel hisseden vergisel olarak daha avantajlıdır kısa vadede.',
      },
      {
        heading: 'Mevduat ve döviz vergisi',
        body: 'TL vadeli mevduat: Stopaj %0-15 arası, vade ve banka türüne göre değişir (2026 itibariyle özel bankalarda kısa vadede %15, uzun vadede daha düşük). Döviz mevduatı: Yabancı para mevduatı (USD/EUR) üzerinden %20-25 stopaj uygulanır (daha yüksek çünkü TL\'ye geçişi caydırma politikası). Altın hesabı: Bankada tutulan kıymetli maden hesaplarında stopaj %0 — ancak bozdurma anında kur farkı oluşursa yıl sonu beyana girer. Kira gelirleri (GMSI): Yıllık 13.000₺ üstü beyana tabi (2026 limitleri).',
      },
      {
        heading: 'Beyanname ne zaman gerekir?',
        body: 'Çoğu küçük yatırımcı için yıllık beyanname zorunlu değildir, çünkü stopaj kesintisi vergi yükümlülüğünü kapatır. Ancak şu durumlarda beyan vermen gerekir: (1) Stopajsız gelirin var ise (örn. yurtdışı borsadan kazanç, kripto kazancı 2026 sonrası), (2) Yıllık menkul sermaye iradı 2026 için 600.000₺\'yi aşıyorsa, (3) Birden fazla işverenden ücret alıyorsan ve toplamı eşiği geçtiyse, (4) Ticari faaliyet niteliği taşıyan trading yapıyorsan (gün içi yoğun işlem — vergi dairesi "ticari" sayabilir). Beyanname GİB e-Beyanname sisteminden Mart ayında verilir. Şüphedeyken mali müşavire danış — vergi cezaları yüksek.',
      },
    ],
  },
  {
    slug: 'bes-bireysel-emeklilik',
    title: 'BES — Bireysel Emeklilik',
    icon: Briefcase,
    tone: 'accent',
    description:
      'Bireysel Emeklilik Sistemi nedir, %20 devlet katkısı nasıl alınır, hangi fonlar seçilir, vergi avantajları nelerdir? Uzun vadeli birikim için 2026 rehberi.',
    videoQuery: 'bireysel emeklilik BES nedir nasıl başlanır',
    bullets: [
      'BES: Bireysel Emeklilik Sistemi — devletin %20 katkısı + vergi avantajı sağlayan uzun vadeli birikim',
      'Devlet Katkısı: Yatırdığın her 100₺\'ye 20₺ devlet ekler (2026 başında %30\'dan %20\'ye indirildi)',
      'Tavan: Yıllık brüt asgari ücret tutarı kadar katkıya devlet katkı sağlar — üstüne katkı yok',
      'Hak ediş: 3 yılda %15, 6 yılda %35, 10 yılda %60, 56 yaş + 10 yıl katılım = %100',
      'Erken çıkış: 56 yaş/10 yıl şartı sağlanmadan devlet katkısı yanar (cebine kalanın %15-25\'i bile olabilir)',
      'Fon seçimi sistemin kalbidir — agresif (hisse), dengeli (karma), muhafazakar (borçlanma), katılım, altın',
      'OKS (Otomatik): 45 yaş altı çalışan otomatik dahil edilir — istemiyorsan 2 ay içinde ücretsiz cayma hakkı',
      'Vergi: Çıkışta birikim üzerinden %5 stopaj (10 yıl + 56 yaş = %3.75\'e düşer)',
      'Yılda 6 kez ücretsiz fon değişimi yapabilirsin — piyasaya göre dağılımını ayarla',
    ],
    keyTerms: [
      { term: 'Devlet Katkısı (DK)', def: '%20 oranında devletin yatırdığın paraya eklediği teşvik (2026 başında %30\'dan %20\'ye düşürüldü)' },
      { term: 'Hak Ediş', def: 'BES\'ten çıkışta devlet katkısının ne kadarını alabileceğin oran (yıla göre artar)' },
      { term: 'Fon Dağılımı', def: 'BES birikiminin hangi yatırım fonlarına ne oranda dağıtılacağı' },
      { term: 'OKS', def: 'Otomatik Katılım Sistemi — işverenin çalışanı otomatik kaydettiği BES' },
      { term: 'Cayma', def: 'OKS\'ye girdikten sonraki ilk 2 ay içinde ücretsiz çıkma hakkı' },
      { term: 'Aktarım', def: 'BES birikimini başka şirkete taşıma — 2 yıl sonra ücretsiz, devlet katkısı korunur' },
      { term: 'Yıllık Gelir Sigortası', def: 'Birikimi maaş gibi aylık almayı sağlayan opsiyon (vergi avantajı +)' },
    ],
    sections: [
      {
        heading: 'BES Nasıl Çalışır?',
        body: 'Bireysel Emeklilik Sistemi 2003\'te Türkiye\'de kuruldu. Mantığı basit: sen aylık veya tek seferlik bir tutar yatırırsın, devlet bunun %20\'sini hesabına ekler (2026 başı itibariyle — daha önce %30\'du, yeni mevzuatla düşürüldü), paran emeklilik şirketinin yönettiği yatırım fonlarında değerlenir. **56 yaş + 10 yıl katılım** şartını tamamladığında birikimini topluca veya aylık maaş gibi alırsın. Devlet katkısı, BES\'i normal yatırım fonlarından farklı yapan en önemli unsurdur — yıllık brüt asgari ücret tutarına kadar yapılan katkıya devlet %20 ek katar. Yatırdığın paranın üstüne sıfır risk ile %20 ek getiri demektir.',
      },
      {
        heading: '%20 Devlet Katkısı Nasıl Hesaplanır?',
        body: 'Yatırdığın her brüt tutarın %20\'si devlet katkısıdır. **Örnek:** Aylık 5.000₺ yatırırsan, devlet 1.000₺ ekler. Yıllık 60.000₺ yatırdığında devlet 12.000₺ katkı verir. Ancak yıllık brüt asgari ücret tavanı var — bu tavanın üzerine yapılan katkıya devlet ek yapmaz. 2026 brüt asgari ücret yaklaşık 33.000₺/ay olduğu için yıllık katkı tavanı yaklaşık 396.000₺/yıl, üst sınır devlet katkısı ≈ 79.200₺/yıl. **Strateji:** Bütçen elveriyorsa "her zaman tavan kadar yatır" en karlı opsiyondur. Aşağıdaki hesaplayıcı ile kendi senin için somut rakamları gör.',
      },
      {
        heading: 'Hangi Fonu Seçmeliyim?',
        body: 'BES içinde 7-10 fon arasından seçim yaparsın. **Genel rehber:** 30 yaş altıysan %70-80 hisse senedi fonu (yüksek risk, yüksek getiri), 30-45 yaş arası %50-60 hisse + %30-40 borçlanma araçları (dengeli), 45+ yaş %30 hisse + %60 borçlanma + %10 altın (muhafazakar). **Kural:** Emekliliğine "100\'den yaşını çıkararak hisse oranını belirle" yöntemi yaygındır (35 yaşında %65 hisse). Yılda 6 kez ücretsiz fon değişimi yapabilirsin — piyasa şartlarına göre ayarla. Performansları TEFAS\'ta veya Fintables\'da karşılaştırabilirsin.',
      },
      {
        heading: 'BES vs Bireysel Yatırım Hangisi Avantajlı?',
        body: '**BES\'in 3 büyük avantajı:** (1) %20 devlet katkısı garantili (eski %30\'dan düşürülse de hala önemli), (2) %15 → %3.75 vergi avantajı (10 yıl + 56 yaş şartı), (3) Otomatik düzenli yatırım disiplini. **Dezavantajları:** (1) Likidite yok, paranı 10 yıl bağlıyorsun, (2) Yönetim ücretleri normal fonlardan biraz daha yüksek (yıllık %1-2.5), (3) Erken çıkışta devlet katkısı yanar. **Sonuç:** Disiplinli uzun vadeli birikim hedefin varsa BES kazançlıdır. Likiditeye ihtiyacın varsa veya kısa-orta vade hedefliyorsan TEFAS yatırım fonları daha mantıklı.',
      },
      {
        heading: 'OKS — Otomatik Katılım Sistemi',
        body: '2017\'den beri 45 yaş altı çalışanlar işveren tarafından otomatik BES\'e dahil ediliyor. İşveren maaşının **%3\'ünü** BES\'e yatırır (sen istemezsen 2 ay içinde cayabilirsin). 2026 itibariyle bunun üzerine devlet katkısı da var. Birçok kişi cayıyor ama **matematik açıkça gösteriyor:** uzun vadede aylık küçük rakamlar bile devlet katkısı (%20) + uzun vadeli bileşik getiriyle ciddi tutarlara dönüşür. Yukarıdaki hesaplayıcıdan kendi durumun için somut rakamı görebilirsin. Cayma kararı verirken bu büyüklüğü düşünmek gerek. OKS\'ye dahil kalmak, en hızlı zenginleşme yollarından biridir küçük gelirli için.',
      },
      {
        heading: 'Sık Yapılan 6 Hata',
        body: '(1) **"Cayayım, kendim yatırırım"** — disiplin tutmayanların büyük çoğunluğu bireysel olarak yatırım yapmıyor; %20 devlet katkısını kaçırıyorlar. (2) **Düşük getirili fonlarda kalıp değişim yapmamak** — yılda 6 ücretsiz değişim hakkını kullanmamak büyük getiri kaybı. (3) **Tavan üstüne para yatırmak** — devlet katkısı yok, sadece yönetim ücreti ödüyorsun. (4) **2 yıl bekleme süresi dolmadan şirket değiştirmek** — komisyon ödüyorsun. (5) **9. yılda paniğe kapılıp çıkmak** — devlet katkısının %40\'ını feda ediyorsun. (6) **Tek bir fona yığılmak** — kıymetli madenler veya katılım fonu gibi sabit "güvenli" fona koymak, enflasyona yenik düşmek demektir. **BES\'te en büyük servet sabırdır.**',
      },
      {
        heading: 'En İyi Emeklilik Şirketleri (2026)',
        body: 'Türkiye\'deki başlıca BES şirketleri: **AvivaSA, Anadolu Hayat Emeklilik, Garanti Emeklilik, Allianz Yaşam ve Emeklilik, BNP Paribas Cardif Emeklilik, NN Hayat ve Emeklilik, AGESA, Vakıf Emeklilik, Halk Emeklilik, Ziraat Emeklilik.** Şirket seçimi 3 kritere dayanır: (1) **Fon çeşitliliği** ve performans (TEFAS\'tan kontrol et), (2) **Yönetim ücretleri** (yıllık net %1.5\'in altı iyi), (3) **Online erişim ve mobil app** kalitesi. Geçmiş performans gelecek garantisi değildir ama 5-10 yıllık dönem getirilerini karşılaştırarak makul bir seçim yapabilirsin. Şirket değiştirmek istersen 2 yıl bekledikten sonra ücretsiz aktarım hakkın var, devlet katkısı korunur.',
      },
    ],
    externalLinks: [
      { label: 'EGM — Emeklilik Gözetim Merkezi', url: 'https://www.egm.org.tr' },
      { label: 'TEFAS — Emeklilik Fonları', url: 'https://www.tefas.gov.tr/EmeklilikFonu/EmeklilikFonu.aspx' },
      { label: 'Fintables — Emeklilik Fonu Karşılaştırma', url: 'https://fintables.com/fonlar' },
    ],
  },
];

/** Basit **bold** markdown render — paragraf metinlerinde <strong> üretir. */
function renderMarkdownBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++} className="text-slate-100">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const toneClasses: Record<Topic['tone'], string> = {
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

// İstenen görüntü sırası — BES en başta, gerisi orijinal sırada.
const PRIORITY_SLUGS = ['bes-bireysel-emeklilik'];
const ORDERED_TOPICS = (() => {
  const priority = PRIORITY_SLUGS
    .map((slug) => TOPICS.find((t) => t.slug === slug))
    .filter((t): t is Topic => !!t);
  const rest = TOPICS.filter((t) => !PRIORITY_SLUGS.includes(t.slug));
  return [...priority, ...rest];
})();

export function FinancialLiteracyPage() {
  const [active, setActive] = useState<string>(ORDERED_TOPICS[0].slug);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ORDERED_TOPICS;
    return ORDERED_TOPICS.filter((t) =>
      (t.title + t.description + t.bullets.join(' ') + t.keyTerms.map((k) => k.term).join(' '))
        .toLowerCase()
        .includes(q),
    );
  }, [search]);

  const current = ORDERED_TOPICS.find((t) => t.slug === active) ?? ORDERED_TOPICS[0];
  const Icon = current.icon;

  return (
    <>
      <PageHeader
        title="Finansal Okuryazarlık"
        subtitle="Borsa, fonlar, teknik analiz, risk yönetimi, kripto ve vergi — bilmen gereken her şey."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Konu listesi */}
        <aside className="lg:col-span-3">
          <div className="glass-card p-3">
            <div className="relative mb-3">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-8 text-xs"
                placeholder="Konu ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <nav className="space-y-1">
              {filtered.map((t) => {
                const TIcon = t.icon;
                const isActive = t.slug === active;
                return (
                  <button
                    key={t.slug}
                    onClick={() => setActive(t.slug)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition',
                      isActive
                        ? 'bg-gradient-to-r from-accent/15 to-accent/5 text-accent ring-1 ring-accent/20'
                        : 'text-slate-300 hover:bg-bg-card hover:translate-x-0.5',
                    )}
                  >
                    <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', toneClasses[t.tone])}>
                      <TIcon size={12} />
                    </span>
                    <span className="font-medium truncate">{t.title}</span>
                    {isActive && <ChevronRight size={12} className="ml-auto shrink-0" />}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-2 py-4 text-center text-[11px] text-slate-500">Arama eşleşmiyor.</p>
              )}
            </nav>
          </div>
        </aside>

        {/* Konu detayı */}
        <main className="lg:col-span-9 space-y-4">
          {/* Hero */}
          <section className="glass-card p-5">
            <div className="flex items-start gap-3">
              <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl', toneClasses[current.tone])}>
                <Icon size={22} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-100">{current.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{current.description}</p>
              </div>
            </div>
          </section>

          {/* Video — YouTube embed bloke ediyor, direkt YouTube linkleri sunuyoruz */}
          <section className="glass-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <GraduationCap size={14} /> Video Eğitim
              <span className="ml-auto text-[10px] text-slate-500">YouTube'da güncel arama</span>
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(current.videoQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-lg border border-danger/30 bg-gradient-to-br from-danger/10 to-transparent p-4 transition hover:border-danger/50 hover:from-danger/20"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-danger/20 text-danger">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23 7.5c0-1.4-1.1-2.5-2.5-2.5h-17C2.1 5 1 6.1 1 7.5v9c0 1.4 1.1 2.5 2.5 2.5h17c1.4 0 2.5-1.1 2.5-2.5v-9zM10 16V8l6 4-6 4z"/>
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-100">YouTube'da Aç</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    "{current.videoQuery}" için güncel videolar
                  </div>
                </div>
                <ExternalLink size={13} className="text-slate-400 transition group-hover:text-danger" />
              </a>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(current.title + ' başlangıç')}`}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-lg border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-4 transition hover:border-accent/50 hover:from-accent/20"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-accent/20 text-accent">
                  <GraduationCap size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-100">Başlangıç Seviyesi</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Sıfırdan öğrenmek için filtrelenmiş arama
                  </div>
                </div>
                <ExternalLink size={13} className="text-slate-400 transition group-hover:text-accent" />
              </a>
            </div>
            <p className="mt-3 text-[10px] text-slate-500">
              ℹ️ Üçüncü taraf siteler YouTube'u embed etmeye izin vermediği için doğrudan YouTube'a yönlendiriyoruz — videolar orada sorunsuz oynar.
            </p>
          </section>

          {/* BES için özel hesaplayıcı — konunun başında, görsel olarak yüksek değer */}
          {current.slug === 'bes-bireysel-emeklilik' && <BESCalculator />}

          {/* Geniş kapsamlı anlatım */}
          {current.sections && current.sections.length > 0 && (
            <section className="glass-card p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <BookOpen size={14} /> Detaylı Anlatım
              </h3>
              <div className="space-y-5">
                {current.sections.map((s, i) => (
                  <div key={i} className="border-l-2 border-accent/40 pl-4">
                    <h4 className="text-base font-semibold text-slate-100">{s.heading}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      {renderMarkdownBold(s.body)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Anahtar noktalar */}
          <section className="glass-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <BookOpen size={14} /> Bilmen Gereken Anahtar Noktalar
            </h3>
            <ul className="space-y-2 text-sm text-slate-200">
              {current.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', `bg-${current.tone === 'accent' ? 'accent' : current.tone}`)} style={{ backgroundColor: 'currentColor' }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Sözlük */}
          <section className="glass-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Sözlük</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              {current.keyTerms.map((kt) => (
                <div key={kt.term} className="rounded-lg border border-border bg-bg-card p-3">
                  <dt className="text-xs font-semibold text-accent">{kt.term}</dt>
                  <dd className="mt-1 text-xs text-slate-400">{kt.def}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Dış kaynaklar */}
          {current.externalLinks && current.externalLinks.length > 0 && (
            <section className="glass-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-300">Dış Kaynaklar</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {current.externalLinks.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
                  >
                    {l.label}
                    <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
