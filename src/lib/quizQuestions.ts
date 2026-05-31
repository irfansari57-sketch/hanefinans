/**
 * Finansal Quiz soru bankası — başlangıç seti.
 *
 * Kategoriler: 'temel' | 'bist' | 'makro' | 'aktuel'
 * Format: 4 şık, correctIdx 0-3.
 *
 * Genişletilebilir: yeni sorular sondan eklenir, daily seçim ID üzerinden.
 */

export interface QuizQuestion {
  id: number;
  category: 'temel' | 'bist' | 'makro' | 'aktuel';
  question: string;
  options: [string, string, string, string];
  correctIdx: 0 | 1 | 2 | 3;
  explanation?: string;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // --- Temel Finans ---
  {
    id: 1, category: 'temel',
    question: 'F/K (P/E) oranı neyi gösterir?',
    options: ['Hisse fiyatı / Kâr', 'Kâr / Sermaye', 'Borç / Özkaynak', 'Hasılat / Maliyet'],
    correctIdx: 0,
    explanation: 'Fiyat/Kazanç oranı = hisse fiyatı bölü hisse başı net kâr. Değerleme metriği.',
  },
  {
    id: 2, category: 'temel',
    question: 'EBITDA aşağıdakilerden hangisini içermez?',
    options: ['Amortisman', 'Vergi', 'Faiz', 'Brüt kâr'],
    correctIdx: 3,
    explanation: 'EBITDA = Earnings Before Interest, Taxes, Depreciation, Amortization. Brüt kâr içindedir.',
  },
  {
    id: 3, category: 'temel',
    question: 'PD/DD (Piyasa Değeri/Defter Değeri) 1\'in altında ise ne anlama gelir?',
    options: ['Hisse pahalı', 'Hisse defter değerinin altında işlem görüyor', 'Şirket kârsız', 'Bilanço bozuk'],
    correctIdx: 1,
    explanation: 'PD/DD < 1: piyasa şirketi defter değerinin altında değerliyor — potansiyel ucuzluk veya yapısal sorun işareti.',
  },
  {
    id: 4, category: 'temel',
    question: 'Cari oran (Current Ratio) nasıl hesaplanır?',
    options: ['Dönen Varlık / Kısa Vadeli Yükümlülük', 'Net Kâr / Toplam Varlık', 'Hasılat / Aktif', 'FAVÖK / Faiz'],
    correctIdx: 0,
    explanation: 'Kısa vadeli ödeme gücü göstergesi. 1\'den büyük olması likidite açısından iyidir.',
  },
  {
    id: 5, category: 'temel',
    question: 'ROE (Özkaynak Kârlılığı) neyi ölçer?',
    options: ['Borç yükü', 'Özkaynak başına net kâr', 'Aktif devir hızı', 'Satışların büyümesi'],
    correctIdx: 1,
    explanation: 'ROE = Net Kâr / Özkaynak. Ortakların yatırdığı sermayenin getirisi.',
  },
  {
    id: 6, category: 'temel',
    question: 'Temettü verimi (dividend yield) nasıl hesaplanır?',
    options: ['Temettü / Hisse Fiyatı', 'Net Kâr / Temettü', 'Temettü / Sermaye', 'Hisse Fiyatı / Temettü'],
    correctIdx: 0,
  },
  {
    id: 7, category: 'temel',
    question: 'Stop-loss emri ne işe yarar?',
    options: ['Garantili kâr alma', 'Belirli bir fiyat altında otomatik satış', 'Kaldıraçlı işlem', 'Vadeli kontrat'],
    correctIdx: 1,
    explanation: 'Stop-loss = zarar durdur. Belirli fiyat seviyesinde otomatik kapatma ile riski sınırlar.',
  },
  {
    id: 8, category: 'temel',
    question: 'Borsa İstanbul\'da seans kapanış saati kaçtır?',
    options: ['17:00', '17:30', '18:00', '18:10'],
    correctIdx: 3,
    explanation: 'BIST kapanış: 18:10 (kapanış maçı 18:00\'da başlar, kapanış fiyatı 18:10\'da kesinleşir).',
  },

  // --- BIST Trivia ---
  {
    id: 9, category: 'bist',
    question: 'BIST 100 endeksinde kaç şirket vardır?',
    options: ['50', '75', '100', '150'],
    correctIdx: 2,
  },
  {
    id: 10, category: 'bist',
    question: 'ASELS hangi sektörde faaliyet gösterir?',
    options: ['Bankacılık', 'Savunma & Elektronik', 'Gıda', 'Enerji'],
    correctIdx: 1,
    explanation: 'Aselsan — TR\'nin en büyük savunma elektroniği şirketi.',
  },
  {
    id: 11, category: 'bist',
    question: 'THYAO sembolü hangi şirketi temsil eder?',
    options: ['Türk Hava Yolları', 'Türk Hava Kuvvetleri', 'TAV Havalimanları', 'Pegasus'],
    correctIdx: 0,
  },
  {
    id: 12, category: 'bist',
    question: 'BIST 30 endeksinde hangi sektörden hisseler ağırlıklıdır?',
    options: ['Sadece banka', 'Bankacılık + holding', 'Gıda + perakende', 'Sadece teknoloji'],
    correctIdx: 1,
    explanation: 'BIST 30 en likit 30 hisse — bankacılık ve büyük holding ağırlıklıdır (GARAN, AKBNK, KCHOL, SAHOL vb.).',
  },
  {
    id: 13, category: 'bist',
    question: 'EREGL sembolü hangi şirkete aittir?',
    options: ['Ereğli Demir Çelik', 'Ereğli Tekstil', 'Erdemir Holding', 'Eregli Enerji'],
    correctIdx: 0,
  },
  {
    id: 14, category: 'bist',
    question: 'BIST seans öncesi açılış emri saati kaç?',
    options: ['09:30', '09:40', '09:50', '10:00'],
    correctIdx: 2,
    explanation: 'BIST açılış: 10:00. 09:50\'de açılış emri kabulü başlar.',
  },
  {
    id: 15, category: 'bist',
    question: 'GARAN sembolü hangi bankaya aittir?',
    options: ['Akbank', 'Garanti BBVA', 'Yapı Kredi', 'İş Bankası'],
    correctIdx: 1,
  },
  {
    id: 16, category: 'bist',
    question: 'BIST\'te VİOP nedir?',
    options: ['Vadeli İşlem ve Opsiyon Piyasası', 'Yabancı Sermaye Piyasası', 'Tahvil Piyasası', 'Pay Piyasası'],
    correctIdx: 0,
  },

  // --- Makro / Ekonomi ---
  {
    id: 17, category: 'makro',
    question: 'TÜFE neyi ölçer?',
    options: ['Üretici Fiyatları', 'Tüketici Fiyat Endeksi', 'İthalat Fiyatları', 'Tarım Fiyatları'],
    correctIdx: 1,
    explanation: 'TÜFE = Tüketici Fiyat Endeksi. Hane halkının harcadığı mal/hizmet sepetinin fiyat değişimi.',
  },
  {
    id: 18, category: 'makro',
    question: 'TCMB politika faizinin amacı nedir?',
    options: ['Vergi toplama', 'Enflasyon ve para arzı yönetimi', 'Hisse fiyatı yönetimi', 'Döviz sabitleme'],
    correctIdx: 1,
  },
  {
    id: 19, category: 'makro',
    question: 'CDS primi neyi gösterir?',
    options: ['Şirket büyümesi', 'Ülke iflas riski', 'Hisse temettü', 'Tahvil getirisi'],
    correctIdx: 1,
    explanation: 'CDS = Credit Default Swap. Ülke veya şirketin iflas riskini ölçer. Yüksek CDS = yüksek risk algısı.',
  },
  {
    id: 20, category: 'makro',
    question: 'FED hangi ülkenin merkez bankasıdır?',
    options: ['İngiltere', 'Almanya', 'ABD', 'Japonya'],
    correctIdx: 2,
    explanation: 'Federal Reserve System = ABD merkez bankası.',
  },
  {
    id: 21, category: 'makro',
    question: 'PPK (Para Politikası Kurulu) toplantısı ne sıklıkta yapılır?',
    options: ['Haftada bir', 'Ayda bir', 'Her hafta Çarşamba', 'Yılda iki kez'],
    correctIdx: 1,
  },
  {
    id: 22, category: 'makro',
    question: 'Bir ülkenin GSYİH (GDP) neyi temsil eder?',
    options: ['İhracat hacmi', 'Toplam üretim değeri', 'Bütçe açığı', 'Nüfus'],
    correctIdx: 1,
  },
  {
    id: 23, category: 'makro',
    question: 'Bütçe açığı ne anlama gelir?',
    options: ['Gelir > Gider', 'Gider > Gelir', 'Vergi indirimi', 'İhracat fazlası'],
    correctIdx: 1,
  },
  {
    id: 24, category: 'makro',
    question: 'TR ekonomisinde dolarizasyon ne demektir?',
    options: ['Dolar yatırımı', 'TL yerine dövize geçiş eğilimi', 'Dolar ihracatı', 'Sabit kur sistemi'],
    correctIdx: 1,
  },

  // --- Aktüel / Genel kültür ---
  {
    id: 25, category: 'aktuel',
    question: 'TEFAS nedir?',
    options: ['Türkiye Elektronik Fon Alım Satım Platformu', 'Tahvil Fonu', 'Türk Endüstri Fonu', 'Teknoloji Fonu'],
    correctIdx: 0,
    explanation: 'TEFAS — Sermaye Piyasası Kurulu denetiminde tüm yatırım fonlarının alınıp satıldığı platform.',
  },
  {
    id: 26, category: 'aktuel',
    question: 'KAP neyin kısaltmasıdır?',
    options: ['Kurumsal Açıklama Platformu', 'Kamu Aydınlatma Platformu', 'Kar Açıklama Programı', 'Komisyon Aktarım Paneli'],
    correctIdx: 1,
    explanation: 'KAP = Kamuyu Aydınlatma Platformu. Halka açık şirketlerin tüm önemli bildirimleri.',
  },
  {
    id: 27, category: 'aktuel',
    question: 'BES nedir?',
    options: ['Borsa Emeklilik Sistemi', 'Bireysel Emeklilik Sistemi', 'Bütçe Eşitleme Sistemi', 'Borsa Endeks Standardı'],
    correctIdx: 1,
  },
  {
    id: 28, category: 'aktuel',
    question: 'Halka arz (IPO) ne demektir?',
    options: ['Şirketin tasfiyesi', 'Şirket hissesinin ilk kez halka satılması', 'Bedelli sermaye artırımı', 'Temettü dağıtımı'],
    correctIdx: 1,
  },
  {
    id: 29, category: 'aktuel',
    question: 'BIST Sürdürülebilirlik Endeksi neyi gösterir?',
    options: ['En çok büyüyen şirketler', 'ESG uyumlu şirketler', 'Yeşil teknoloji şirketleri', 'En kârlı şirketler'],
    correctIdx: 1,
    explanation: 'ESG = Environmental, Social, Governance. Çevre, sosyal ve yönetişim kriterlerine uyan şirketler.',
  },
  {
    id: 30, category: 'aktuel',
    question: 'Bedelsiz sermaye artırımı yatırımcının elindeki hisseyi nasıl etkiler?',
    options: ['Hisse sayısı artar, ödeme yapılmaz', 'Hisse sayısı azalır', 'Para ödenir', 'Hisse iptal edilir'],
    correctIdx: 0,
    explanation: 'Bedelsiz — şirket içsel kaynaklarından sermaye artırır. Mevcut ortaklar oranlarınca ücretsiz yeni hisse alır.',
  },
];
