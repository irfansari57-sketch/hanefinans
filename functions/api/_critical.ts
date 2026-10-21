/**
 * Kritik finansal bildirim tespiti — /api/news ve /api/stocks/:symbol/news paylaşır.
 *
 * Yatırımcıyı birebir ilgilendiren, fiyatı anında etkileyen olaylar.
 * Eşleşme bulunursa importance=10, critical=true.
 *
 * 13 Eki 2026 notu: "X, tedbir iddialarına ilişkin açıklama yaptı" gibi
 * yalanlama/açıklama başlıkları da yakalanır; NEGATION_PATTERNS ile bunlar
 * kritik sayılmaz (ama importance yine yüksek kalır).
 */

// 15 Eki 2026: 'Kritik' = yatırımcı için RİSK olayı. Bedelsiz, pay geri alımı,
// halka arz ve önemli nitelikte işlem kritik DEĞİL (nötr/olumlu kurumsal olaylar);
// kırmızı rozet enflasyonu yaratıyordu.
// 21 Eki 2026 (kullanıcı talebi): düzenleyici/piyasa geneli olaylar (SPK'nın aracı
// kurum faaliyetini durdurması, işlem yasağı, kot dışı) sembolsüz de kritik sayılır
// (`marketWide: true`). Şirket olayları (konkordato, iflas, pay alım teklifi…) için
// sembol bağlantısı şartı sürer.
export const CRITICAL_PATTERNS: Array<{ re: RegExp; reason: string; marketWide?: boolean }> = [
  { re: /\b(konkordato)\b/i, reason: 'Konkordato' },
  { re: /\b(iflas(?:\s+erteleme)?|iflas\s+istedi|iflas\s+basvurusu|iflas\s+başvuru|iflas\s+kararı|iflas\s+karari)\b/i, reason: 'İflas' },
  { re: /\b(kayy[ıi]m|kayyum\s+atan)\b/i, reason: 'Kayyım' },
  { re: /\b(tedbir\s+karar|ihtiyati\s+tedbir|tedbirli\s+pazar)\b/i, reason: 'Tedbir' },
  { re: /\b(haciz\s+karar|haczedild)\b/i, reason: 'Haciz' },
  { re: /\b(delisting|borsadan\s+çıkar|kottan\s+çıkar|borsadan\s+cikar|kottan\s+cikar)\b/i, reason: 'Borsadan Çıkarma' },
  { re: /\b(spk\s+(?:ceza|para\s+cezas|idari\s+para)|sermaye\s+piyasası\s+kurulu\s+ceza)\b/i, reason: 'SPK Cezası' },
  { re: /\b(muvazaa|manip[üu]lasyon\s+iddia|insider\s+trading|içeriden\s+öğrenen|iceriden\s+ogrenen)\b/i, reason: 'Manipülasyon' },
  { re: /\b(profit\s+warning|kar\s+uyarı|kar\s+uyari|rekor\s+zarar|dönem\s+zararı|donem\s+zarari)\b/i, reason: 'Kar Uyarısı' },
  // --- 21 Eki 2026 eklemeleri ---
  { re: /(geçici\s+(?:olarak\s+)?durdur|gecici\s+(?:olarak\s+)?durdur|faaliyet(?:ler)?i(?:ni)?\s+durdur|yetki(?:si|leri)?\s+iptal|lisans(?:ı|i)?\s+iptal)/i, reason: 'Faaliyet Durdurma', marketWide: true },
  { re: /(işlem\s+yasağ|islem\s+yasag|işlem\s+sıras[ıi]\s+kapat|islem\s+sirasi\s+kapat|işlemlere\s+kapat|brüt\s+takas|brut\s+takas|açığa\s+satış\s+yasağ|aciga\s+satis\s+yasag)/i, reason: 'İşlem Kısıtı', marketWide: true },
  { re: /(pay\s+alım\s+teklifi|pay\s+alim\s+teklifi|zorunlu\s+(?:pay\s+)?alım\s+teklifi|çağrı\s+(?:yoluyla|yükümlülüğü)|cagri\s+yukumlulugu|ortaklıktan\s+çıkarma|squeeze[-\s]out)/i, reason: 'Pay Alım Teklifi' },
  { re: /(hisse(?:lerin|lerinin)?\s+(?:devri|devrine|satışı(?:na)?)\s+ilişkin|pay\s+devri|çoğunluk\s+hisse(?:si|lerini)\s+(?:satın|devral)|kontrol\s+değişikliği|el\s+değiştir)/i, reason: 'Hisse Devri' },
  { re: /(operasyon\s+(?:düzenlendi|yapıldı)|gözaltına\s+alındı|gozaltina\s+alindi|tutukland|savcılık\s+soruşturma|savcilik\s+sorusturma)/i, reason: 'Soruşturma' },
  { re: /(kot\s+dışı|kot\s+disi|piyasa\s+öncesi\s+işlem\s+platformu|yakın\s+izleme\s+pazarı(?:na)?\s+alın)/i, reason: 'Pazar Değişikliği', marketWide: true },
];

/** Yalanlama / "iddialara ilişkin açıklama" kalıpları — kritik rozeti verilmez. */
const NEGATION_PATTERNS: RegExp[] = [
  /\b(iddialar[ıi]na\s+ili[şs]kin|iddialar[ıi]\s+yalanlad|yalanlama|asılsız|asilsiz|do[ğg]ru\s+de[ğg]il|söz\s+konusu\s+de[ğg]il|soz\s+konusu\s+degil)\b/i,
];

export function detectCritical(title: string, summary: string): { critical: boolean; reason?: string; marketWide?: boolean } {
  const text = `${title} ${summary}`;
  for (const { re, reason, marketWide } of CRITICAL_PATTERNS) {
    if (re.test(text)) {
      if (NEGATION_PATTERNS.some((n) => n.test(title))) return { critical: false, reason };
      return { critical: true, reason, marketWide: !!marketWide };
    }
  }
  return { critical: false };
}

/** Google News RSS başlıkları " - Kaynak" ile biter; ayır. */
export function splitGoogleTitle(title: string): { title: string; source?: string } {
  const m = title.match(/^(.*)\s[-–]\s([^-–]{2,40})$/);
  if (!m) return { title };
  return { title: m[1].trim(), source: m[2].trim() };
}

/** XML entity + CDATA + tag temizliği (news/index.ts ile aynı). */
export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function extractXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]) : null;
}
