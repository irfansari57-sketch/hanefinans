/**
 * Yatırımcı uygunluğu — fon "nitelikli yatırımcıya" mı, "genel yatırımcıya" mı satılır? (28 Eki 2026)
 *
 * Mevzuat: SPK Yatırım Fonlarına İlişkin Esaslar Tebliği (III-52.1) — SERBEST fonlar ve ÖZEL fonlar yalnız
 * nitelikli yatırımcıya satılır; Gayrimenkul Yatırım Fonu (GYF) ve Girişim Sermayesi Yatırım Fonu (GSYF)
 * de nitelikli yatırımcıya yöneliktir. SPK 26 Eki 2026 kararı (Bülten 2026/74): nitelikli yatırımcı için
 * finansal varlık eşiği 10 → 50 milyon TL, işlem hacmi şartı 5 → 25 milyon TL; GYF/GSYF istisnası kaldırıldı.
 * (18 Ara 2025 kararıyla eşik 1 → 10 milyon TL olmuştu.)
 *
 * Sınıflandırma kaynağı: fon ADI ve KATEGORİ (TEFAS). Fon adında "SERBEST", "ÖZEL FON", "NİTELİKLİ",
 * "GAYRİMENKUL YATIRIM FONU", "GİRİŞİM SERMAYESİ" → nitelikli. Aksi → genel. Belirsizse "genel" denmez,
 * `confidence:'low'` ile işaretlenir (UI küçük "?" gösterir). Yatırım tavsiyesi değildir; nihai uygunluk
 * aracı kurumun nitelikli yatırımcı tespitine bağlıdır.
 */
export type Eligibility = {
  kind: 'nitelikli' | 'genel';
  label: string;
  reason: string;
  confidence: 'high' | 'low';
};

export const QUALIFIED_THRESHOLD_TL = 50_000_000;
export const QUALIFIED_THRESHOLD_LABEL = '50 milyon TL';
export const QUALIFIED_RULE_NOTE =
  'SPK 26 Eki 2026 kararı (Bülten 2026/74): nitelikli yatırımcı sayılmak için finansal varlık toplamı en az 50 milyon TL (önceki 10 milyon TL) veya belirtilen işlem hacmi şartı gerekir. Serbest ve özel fonlar yalnız nitelikli yatırımcılara satılabilir.';

function fold(s: string): string {
  return s.replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's').replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u').replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ç/g, 'C').replace(/ç/g, 'c').toUpperCase();
}

export function eligibilityOf(name: string | null | undefined, category?: string | null): Eligibility {
  const n = fold(name ?? '');
  const c = fold(category ?? '');
  if (/\bSERBEST\b/.test(n) || c === 'SERBEST') {
    return { kind: 'nitelikli', label: 'Nitelikli', reason: 'Serbest fon — yalnız nitelikli yatırımcıya satılır (III-52.1)', confidence: 'high' };
  }
  if (/\bOZEL\s+FON\b|\bOZEL\s+(?:SERBEST|DEGISKEN|HISSE|KATILIM)/.test(n) || /\(OZEL\)/.test(n)) {
    return { kind: 'nitelikli', label: 'Nitelikli', reason: 'Özel fon — belirli kişi/kuruluşlara yönelik, nitelikli yatırımcı şartı', confidence: 'high' };
  }
  if (/GAYRIMENKUL\s+YATIRIM\s+FONU|\bGYF\b/.test(n)) {
    return { kind: 'nitelikli', label: 'Nitelikli', reason: 'Gayrimenkul yatırım fonu — nitelikli yatırımcıya yönelik (GYF istisnası 26 Eki 2026\'da kaldırıldı)', confidence: 'high' };
  }
  if (/GIRISIM\s+SERMAYESI/.test(n) || /\bGSYF\b/.test(n)) {
    return { kind: 'nitelikli', label: 'Nitelikli', reason: 'Girişim sermayesi yatırım fonu — nitelikli yatırımcıya yönelik', confidence: 'high' };
  }
  if (/NITELIKLI/.test(n)) {
    return { kind: 'nitelikli', label: 'Nitelikli', reason: 'Fon adında nitelikli yatırımcı ibaresi', confidence: 'high' };
  }
  if (!n && !c) return { kind: 'genel', label: 'Genel', reason: 'Ad/kategori bilgisi yok', confidence: 'low' };
  return { kind: 'genel', label: 'Genel', reason: 'TEFAS\'ta tüm yatırımcılara açık fon türü (adı/kategorisi serbest, özel, GYF, GSYF değil)', confidence: 'high' };
}

export const isQualifiedOnly = (name: string | null | undefined, category?: string | null) => eligibilityOf(name, category).kind === 'nitelikli';
