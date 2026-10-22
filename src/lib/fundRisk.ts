/**
 * Fon risk seviyesi (TEFAS 1-7 skalası).
 *
 * Kaynak önceliği:
 *   1) `riskValue` — TEFAS'ın fon detay sayfasındaki resmî "Fon Risk Değeri" (scraper, 30 günde bir yenilenir)
 *   2) Kategori tahmini — resmî değer henüz yoksa; UI'da MUTLAKA "tahmini" olarak işaretlenir.
 *
 * 22 Eki 2026: Fon detay kartı tahmini değeri resmî gibi gösteriyordu, liste ise boş bırakıyordu —
 * iki ekran birbirini tutmuyordu. Artık ikisi de bu tek fonksiyonu kullanır.
 */
export interface FundRisk {
  value: number;        // 1..7
  label: string;        // Çok Düşük … Çok Yüksek
  estimated: boolean;   // true = kategori tahmini, false = TEFAS resmî
}

export function riskLabelOf(v: number): string {
  return v <= 1 ? 'Çok Düşük' : v <= 2 ? 'Düşük' : v <= 3 ? 'Düşük-Orta' : v <= 4 ? 'Orta' : v <= 5 ? 'Orta-Yüksek' : v <= 6 ? 'Yüksek' : 'Çok Yüksek';
}

/** Kategori/ada göre tahmin — TEFAS resmî değeri yoksa. */
export function estimateFundRisk(category?: string | null, name?: string | null): FundRisk {
  const cat = (category ?? '').toLocaleLowerCase('tr-TR');
  const nm = (name ?? '').toLocaleLowerCase('tr-TR');
  let risk = 4;
  if (cat.includes('para piyasası') || cat.includes('para piyasasi')) risk = 1;
  else if (cat.includes('borçlanma') || cat.includes('borclanma')) risk = 2;
  else if (cat.includes('katılım') || cat.includes('katilim')) risk = 3;
  else if (cat.includes('karma')) risk = 4;
  else if (cat.includes('değişken') || cat.includes('degisken')) risk = 5;
  else if (cat.includes('kıymetli') || cat.includes('kiymetli') || cat.includes('altın') || cat.includes('altin') || cat.includes('gümüş') || cat.includes('gumus')) risk = 5;
  else if (cat.includes('fon sepeti')) risk = 5;
  else if (cat.includes('hisse senedi')) risk = 6;
  else if (cat.includes('serbest')) risk = 7;
  if (cat.includes('katılım') && cat.includes('serbest')) risk = 6;
  if (nm.includes('hisse')) risk = Math.max(risk, 6);
  return { value: risk, label: riskLabelOf(risk), estimated: true };
}

export function resolveFundRisk(riskValue: number | null | undefined, category?: string | null, name?: string | null): FundRisk {
  if (typeof riskValue === 'number' && Number.isFinite(riskValue) && riskValue >= 1 && riskValue <= 7) {
    const v = Math.round(riskValue);
    return { value: v, label: riskLabelOf(v), estimated: false };
  }
  return estimateFundRisk(category, name);
}
