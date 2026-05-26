import type {
  Stock, NewsItem, MarketEvent, SentimentMention, MacroIndicator, AgentStatus,
} from './types';

const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
const daysFromNow = (d: number) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};

// BIST evreni — Yahoo Finance üzerinden gerçek fiyatlar gelir.
// Buradaki price/changePct sadece API başarısız olursa fallback'tir.
export const MOCK_STOCKS: Stock[] = [
  // Bankacılık
  { symbol: 'AKBNK', name: 'Akbank',                sector: 'Bankacılık',   price: 68.95,  changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'GARAN', name: 'Garanti BBVA',          sector: 'Bankacılık',   price: 142.80, changePct: 0,    updatedAt: minutesAgo(1) },
  { symbol: 'ISCTR', name: 'İş Bankası (C)',        sector: 'Bankacılık',   price: 18.20,  changePct: 0,    updatedAt: minutesAgo(2) },
  { symbol: 'YKBNK', name: 'Yapı Kredi',            sector: 'Bankacılık',   price: 32.40,  changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'HALKB', name: 'Halkbank',              sector: 'Bankacılık',   price: 17.85,  changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'VAKBN', name: 'Vakıfbank',             sector: 'Bankacılık',   price: 16.20,  changePct: 0,    updatedAt: minutesAgo(4) },
  // Holding
  { symbol: 'KCHOL', name: 'Koç Holding',           sector: 'Holding',      price: 234.00, changePct: 0,    updatedAt: minutesAgo(2) },
  { symbol: 'SAHOL', name: 'Sabancı Holding',       sector: 'Holding',      price: 91.40,  changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'TKFEN', name: 'Tekfen Holding',        sector: 'Holding',      price: 52.30,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'DOHOL', name: 'Doğan Holding',         sector: 'Holding',      price: 27.50,  changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'ALARK', name: 'Alarko Holding',        sector: 'Holding',      price: 88.20,  changePct: 0,    updatedAt: minutesAgo(3) },
  // Sanayi & Savunma
  { symbol: 'ASELS', name: 'Aselsan',               sector: 'Savunma',      price: 75.20,  changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'OTKAR', name: 'Otokar',                sector: 'Savunma',      price: 442.00, changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'EREGL', name: 'Ereğli Demir Çelik',    sector: 'Demir-Çelik',  price: 48.20,  changePct: 0,    updatedAt: minutesAgo(2) },
  { symbol: 'KRDMD', name: 'Kardemir (D)',          sector: 'Demir-Çelik',  price: 24.80,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'SISE',  name: 'Şişecam',               sector: 'Cam/Sanayi',   price: 56.40,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'PETKM', name: 'Petkim',                sector: 'Petrokimya',   price: 18.62,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'CIMSA', name: 'Çimsa',                 sector: 'Çimento',      price: 78.90,  changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'AKCNS', name: 'Akçansa',               sector: 'Çimento',      price: 195.30, changePct: 0,    updatedAt: minutesAgo(5) },
  // Enerji
  { symbol: 'TUPRS', name: 'Tüpraş',                sector: 'Enerji',       price: 188.40, changePct: 0,    updatedAt: minutesAgo(6) },
  { symbol: 'ENJSA', name: 'Enerjisa',              sector: 'Enerji',       price: 92.10,  changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'ZOREN', name: 'Zorlu Enerji',          sector: 'Enerji',       price: 5.85,   changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'AKSEN', name: 'Aksa Enerji',           sector: 'Enerji',       price: 38.40,  changePct: 0,    updatedAt: minutesAgo(2) },
  // Otomotiv
  { symbol: 'TOASO', name: 'Tofaş Oto',             sector: 'Otomotiv',     price: 268.50, changePct: 0,    updatedAt: minutesAgo(7) },
  { symbol: 'FROTO', name: 'Ford Otosan',           sector: 'Otomotiv',     price: 1158.00,changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'DOAS',  name: 'Doğuş Otomotiv',        sector: 'Otomotiv',     price: 198.50, changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'KARSN', name: 'Karsan Otomotiv',       sector: 'Otomotiv',     price: 9.15,   changePct: 0,    updatedAt: minutesAgo(6) },
  // Ulaşım & Havacılık
  { symbol: 'THYAO', name: 'Türk Hava Yolları',     sector: 'Ulaşım',       price: 318.50, changePct: 0,    updatedAt: minutesAgo(2) },
  { symbol: 'PGSUS', name: 'Pegasus',               sector: 'Ulaşım',       price: 282.00, changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'TAVHL', name: 'TAV Havalimanları',     sector: 'Ulaşım',       price: 246.50, changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'DOCO',  name: 'Do & Co',               sector: 'Ulaşım',       price: 4490.00,changePct: 0,    updatedAt: minutesAgo(5) },
  // Perakende & Gıda
  { symbol: 'BIMAS', name: 'BİM Mağazalar',         sector: 'Perakende',    price: 524.00, changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'MGROS', name: 'Migros',                sector: 'Perakende',    price: 542.00, changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'SOKM',  name: 'Şok Marketler',         sector: 'Perakende',    price: 64.80,  changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'MAVI',  name: 'Mavi Giyim',            sector: 'Perakende',    price: 78.50,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'ULKER', name: 'Ülker Bisküvi',         sector: 'Gıda',         price: 121.40, changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'CCOLA', name: 'Coca-Cola İçecek',      sector: 'İçecek',       price: 58.95,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'AEFES', name: 'Anadolu Efes',          sector: 'İçecek',       price: 192.30, changePct: 0,    updatedAt: minutesAgo(3) },
  // Beyaz Eşya & Tüketici
  { symbol: 'ARCLK', name: 'Arçelik',               sector: 'Beyaz Eşya',   price: 138.60, changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'VESTL', name: 'Vestel',                sector: 'Tüketici',     price: 52.40,  changePct: 0,    updatedAt: minutesAgo(4) },
  // Telekom
  { symbol: 'TCELL', name: 'Turkcell',              sector: 'Telekom',      price: 89.30,  changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'TTKOM', name: 'Türk Telekom',          sector: 'Telekom',      price: 48.20,  changePct: 0,    updatedAt: minutesAgo(4) },
  // Madencilik
  { symbol: 'TRALT', name: 'Koza Altın',            sector: 'Madencilik',   price: 28.50,  changePct: 0,    updatedAt: minutesAgo(3) },
  { symbol: 'KOZAA', name: 'Koza Madencilik',       sector: 'Madencilik',   price: 17.25,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'IPEKE', name: 'İpek Doğal Enerji',     sector: 'Madencilik',   price: 32.80,  changePct: 0,    updatedAt: minutesAgo(5) },
  // İnşaat
  { symbol: 'ENKAI', name: 'Enka İnşaat',           sector: 'İnşaat',       price: 78.40,  changePct: 0,    updatedAt: minutesAgo(5) },
  // Diğer
  { symbol: 'AKSA',  name: 'Aksa Akrilik',          sector: 'Kimya',        price: 25.30,  changePct: 0,    updatedAt: minutesAgo(4) },
  { symbol: 'ANACM', name: 'Anadolu Cam',           sector: 'Cam',          price: 105.80, changePct: 0,    updatedAt: minutesAgo(5) },
  { symbol: 'BERA',  name: 'Bera Holding',          sector: 'Holding',      price: 12.85,  changePct: 0,    updatedAt: minutesAgo(6) },
  { symbol: 'OYAKC', name: 'Oyak Çimento',          sector: 'Çimento',      price: 49.30,  changePct: 0,    updatedAt: minutesAgo(4) },
];

export const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    source: 'KAP',
    symbols: ['THYAO'],
    importance: 8,
    title: 'Türk Hava Yolları, 50 adet Boeing 737 MAX siparişi verdi',
    summary: 'THY, filo yenileme planı kapsamında Boeing ile yaklaşık 8 milyar dolarlık tedarik anlaşması imzaladığını KAP\'ta açıkladı.',
    publishedAt: minutesAgo(12),
    url: 'https://kap.org.tr',
  },
  {
    id: 'n2',
    source: 'KAP',
    symbols: ['ASELS'],
    importance: 7,
    title: 'Aselsan, savunma ihalesinde anlaşma imzaladı',
    summary: 'Şirket, Savunma Sanayi Başkanlığı ile yeni jenerasyon radar sistemleri için sözleşme imzaladığını duyurdu.',
    publishedAt: minutesAgo(38),
  },
  {
    id: 'n3',
    source: 'KAP',
    symbols: ['GARAN'],
    importance: 6,
    title: 'Garanti BBVA çeyrek dönem finansal raporu',
    summary: 'Banka, 2026/1Ç net dönem kârını ve takipteki krediler oranını açıkladı; ayrıntılar ekli sunumdadır.',
    publishedAt: minutesAgo(60),
  },
  {
    id: 'n4',
    source: 'KAP',
    symbols: ['SISE'],
    importance: 5,
    title: 'Şişecam yeni fırın yatırımı duyurdu',
    summary: 'Şirket, Polatlı tesisinde 200 milyon dolarlık yeni cam fırını yatırımına başladığını KAP\'a bildirdi.',
    publishedAt: minutesAgo(180),
  },
  {
    id: 'n5',
    source: 'Reuters',
    symbols: ['TUPRS'],
    importance: 6,
    title: 'Tüpraş, rafineri kapasite kullanımını %94\'e yükseltti',
    summary: 'Tüpraş üst yönetimi, talep tarafındaki güçlü seyrin sürdüğünü ve marjların korunduğunu açıkladı.',
    publishedAt: minutesAgo(240),
  },
  {
    id: 'n6',
    source: 'KAP',
    symbols: ['BIMAS'],
    importance: 4,
    title: 'BİM, yeni mağaza açılış programını revize etti',
    summary: 'Şirket 2026 yılında 800 yeni mağaza hedefini koruduğunu, yatırım tutarının revize edildiğini açıkladı.',
    publishedAt: minutesAgo(310),
  },
  {
    id: 'n7',
    source: 'Bloomberg',
    symbols: ['AKBNK', 'GARAN', 'YKBNK'],
    importance: 7,
    title: 'TCMB, bankalara yeni zorunlu karşılık adımı',
    summary: 'Merkez Bankası, TL mevduatlarda zorunlu karşılık oranlarını yeniden düzenledi; etki banka kârlılığına yansıyacak.',
    publishedAt: minutesAgo(420),
  },
  {
    id: 'n8',
    source: 'KAP',
    symbols: ['EREGL'],
    importance: 5,
    title: 'Erdemir, kapasite genişleme yatırımı için EBRD kredisi sağladı',
    summary: 'Şirket, 250 milyon euro tutarındaki sürdürülebilirlik kredisinin kullanım koşullarını paylaştı.',
    publishedAt: minutesAgo(540),
  },
];

export const MOCK_EVENTS: MarketEvent[] = [
  { id: 'e1', title: 'ABD CPI',                  type: 'cpi',           country: 'US', date: daysFromNow(2),  importance: 3 },
  { id: 'e2', title: 'TCMB Faiz Kararı',         type: 'rate-decision', country: 'TR', date: daysFromNow(7),  importance: 3 },
  { id: 'e3', title: 'FOMC Toplantı Tutanakları', type: 'fomc',         country: 'US', date: daysFromNow(14), importance: 2 },
  { id: 'e4', title: 'TÜFE Enflasyon (TR)',      type: 'cpi',           country: 'TR', date: daysFromNow(3),  importance: 3 },
  { id: 'e5', title: 'THYAO 2026/1Ç Bilanço',    type: 'earnings',      country: 'TR', date: daysFromNow(10), importance: 2 },
  { id: 'e6', title: 'AB Faiz Kararı (ECB)',     type: 'rate-decision', country: 'EU', date: daysFromNow(17), importance: 3 },
  { id: 'e7', title: 'ABD İşsizlik Maaşı Başvuruları', type: 'data',    country: 'US', date: daysFromNow(4),  importance: 1 },
];

export const MOCK_SENTIMENT: SentimentMention[] = [
  { symbol: 'THYAO', count: 1248, sentiment: 'positive', lastChange: 12 },
  { symbol: 'ASELS', count: 894,  sentiment: 'positive', lastChange: 8 },
  { symbol: 'GARAN', count: 612,  sentiment: 'neutral',  lastChange: -3 },
  { symbol: 'SISE',  count: 458,  sentiment: 'positive', lastChange: 5 },
  { symbol: 'EREGL', count: 421,  sentiment: 'negative', lastChange: -14 },
  { symbol: 'TUPRS', count: 387,  sentiment: 'positive', lastChange: 9 },
  { symbol: 'KCHOL', count: 295,  sentiment: 'neutral',  lastChange: -2 },
];

// Fallback değerleri — sadece live fetch başarısız olursa kullanılır.
// Güncellendi: 2026-05-12 (frankfurter, TCMB, Yahoo ile çapraz doğrulandı)
export const MOCK_MACRO_FALLBACK: MacroIndicator[] = [
  // BIST endeksleri — birinci öncelik
  { key: 'BIST 100',        label: 'BIST 100',       value: 15133,    changePct: 0.47,  source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'BIST 30',         label: 'BIST 30',                   value: 16420, changePct: 0.52, source: 'mock', updatedAt: minutesAgo(1) },
  // Döviz
  { key: 'USD/TRY',         label: 'USD/TRY',        value: 45.40,    changePct: 0.20,  source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'EUR/TRY',         label: 'EUR/TRY',        value: 53.29,    changePct: 0.30,  source: 'mock', updatedAt: minutesAgo(1) },
  // Politika
  { key: 'Politika Faizi',  label: 'Politika Faizi', value: 39.5,     unit: '%', subLabel: 'TCMB (yaklaşık)', source: 'mock', updatedAt: minutesAgo(60) },
  // Emtia — gram TL
  { key: 'Gram Altın',      label: 'Gram Altın',     value: 6890,     changePct: 0.80,  unit: '₺', source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'Gram Gümüş',      label: 'Gram Gümüş',     value: 126,      changePct: 1.20,  unit: '₺', source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'Gram Platin',     label: 'Gram Platin',    value: 3140,     changePct: 0.30,  unit: '₺', source: 'mock', updatedAt: minutesAgo(1) },
  // Emtia — ons USD
  { key: 'Ons Altın',       label: 'Ons Altın',      value: 4727,     changePct: 0.30,  unit: '$', subLabel: '/oz', source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'Ons Gümüş',       label: 'Ons Gümüş',      value: 86.8,     changePct: 0.95,  unit: '$', subLabel: '/oz', source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'Ons Platin',      label: 'Ons Platin',     value: 2150,     changePct: 0.40,  unit: '$', subLabel: '/oz', source: 'mock', updatedAt: minutesAgo(1) },
  // Diğer makro
  { key: 'Brent',           label: 'Brent',          value: 104.2,    changePct: -0.60, unit: '$', source: 'mock', updatedAt: minutesAgo(2) },
  { key: 'VIX',             label: 'VIX',            value: 18.1,     changePct: -2.10, source: 'mock', updatedAt: minutesAgo(3) },
  { key: 'CDS 5Y',          label: 'CDS 5Y',         value: 268,      changePct: -1.20, unit: 'bps', source: 'mock', updatedAt: minutesAgo(2) },
  // Kripto — popüler 4 (Yahoo BTC-USD format)
  { key: 'BTC/USD',         label: 'BTC/USD',        value: 95000,    changePct: 0.50,  unit: '$', source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'ETH/USD',         label: 'ETH/USD',        value: 3200,     changePct: 0.80,  unit: '$', source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'XRP/USD',         label: 'XRP/USD',        value: 2.10,     changePct: 1.20,  unit: '$', source: 'mock', updatedAt: minutesAgo(1) },
  { key: 'DOGE/USD',        label: 'DOGE/USD',       value: 0.38,     changePct: 1.50,  unit: '$', source: 'mock', updatedAt: minutesAgo(1) },
];

// #106: indicator default 'live' — yahoo-warmer cron + D1 cache ile hisse fiyatları
// her zaman taze. Diğer 3 agent (news/sentiment/macro) talep üzerine servis
// çağrısıyla 'live'a flip oluyor. Bu sayede Layout'taki "Mock akış" göstergesi
// (isMockMode = hepsi mock) yanlış pozitif vermez.
export const AGENTS_DEFAULT: AgentStatus[] = [
  { key: 'news',      label: 'News Agent',      state: 'mock', description: 'KAP, Reuters, Bloomberg gibi kaynaklardan canlı haber akışını toplar.' },
  { key: 'sentiment', label: 'Sentiment Agent', state: 'mock', description: 'Sosyal medya ve forumlardaki hisse anlatımını puanlar.' },
  { key: 'indicator', label: 'Indicator Agent', state: 'live', description: 'Hisse fiyatları, teknik göstergeler ve hareketler için sinyaller üretir.' },
  { key: 'macro',     label: 'Macro Agent',     state: 'mock', description: 'Makroekonomik göstergeleri ve yaklaşan olayları izler.' },
];
