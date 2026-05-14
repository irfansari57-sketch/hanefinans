import { useState } from 'react';
import {
  BookOpen, TrendingUp, PiggyBank, Activity, ShieldAlert, Bitcoin, Calculator, GraduationCap,
  Search, ExternalLink, ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
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
  },
];

const toneClasses: Record<Topic['tone'], string> = {
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

export function FinancialLiteracyPage() {
  const [active, setActive] = useState<string>(TOPICS[0].slug);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? TOPICS.filter((t) =>
        (t.title + t.description + t.bullets.join(' ') + t.keyTerms.map((k) => k.term).join(' '))
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : TOPICS;

  const current = TOPICS.find((t) => t.slug === active) ?? TOPICS[0];
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
